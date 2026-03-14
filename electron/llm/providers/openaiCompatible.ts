import { Buffer } from 'node:buffer'
import type { Provider, ProviderCtx, StreamGen } from '../common'
import type { LLMParams, MessageContentPart, ModelCapabilities, ToolDef, TurnAttachment, UIMessage } from '../../../contracts/index'
import { normalizeError } from '../adapters/error'
import { estimateMessageTokens } from '../../core/attachments/attachmentTokenEstimator'
import {
    appendLegacyAttachmentsToLastUser,
    getMessageParts,
    getMessageText,
} from '../adapters/messageParts'
import { log } from '../../core/logging/runtimeLogger'
import { mimeMatchesAllowlist } from '../../core/attachments/attachmentPolicy'

type OpenAICompatConfig = {
    id: string
    defaultBaseUrl: string
    extraHeaders?: (ctx: ProviderCtx) => Record<string, string>
    requireApiKey?: boolean
    normalizeBaseUrl?: (baseUrl: string) => string
    capabilities?: Partial<Pick<ModelCapabilities, 'nativeFiles' | 'supportedMimeTypes' | 'maxFileSizeMB' | 'maxFilesPerTurn' | 'attachmentTransport'>>
}

type OpenAIMessage = {
    role: string
    content?: string | null | OpenAIChatContentPart[]
    name?: string
    tool_call_id?: string
    tool_calls?: unknown
}

type OpenAIChatContentPart =
    | { type: 'text'; text: string }
    | { type: 'image_url'; image_url: { url: string } }

type OpenAITool = {
    type: 'function'
    function: {
        name: string
        description?: string
        parameters?: unknown
    }
}

type OpenAIToolCall = {
    id: string
    type: 'function'
    function: {
        name: string
        arguments: string
    }
}

function normalizeToolCallsForOpenAI(
    raw: unknown,
    originalToSanitized?: Record<string, string>,
): OpenAIToolCall[] | undefined {
    const list = Array.isArray(raw) ? raw : (raw ? [raw] : [])
    if (!list.length) return undefined
    const used = new Set<string>()
    const out: OpenAIToolCall[] = []
    for (const entry of list) {
        if (!entry || typeof entry !== 'object') continue
        const obj = entry as Record<string, unknown>
        const id = typeof obj.id === 'string' ? obj.id : `call_${out.length + 1}`
        const nameRaw = typeof obj.name === 'string'
            ? obj.name
            : typeof obj.function === 'object' && obj.function && typeof (obj.function as { name?: unknown }).name === 'string'
                ? (obj.function as { name: string }).name
                : ''
        if (!nameRaw) continue
        const sanitizedBase = originalToSanitized?.[nameRaw] ?? sanitizeToolName(nameRaw)
        const name = ensureUniqueToolName(sanitizedBase, used)
        const argsRaw =
            obj.args ?? (obj as { arguments?: unknown }).arguments
            ?? (obj.function as { arguments?: unknown } | undefined)?.arguments
        const argumentsText =
            typeof argsRaw === 'string'
                ? argsRaw
                : JSON.stringify(argsRaw ?? {})
        out.push({
            id,
            type: 'function',
            function: { name, arguments: argumentsText },
        })
    }
    return out.length ? out : undefined
}

function toOpenAIMessages(history: UIMessage[], originalToSanitized?: Record<string, string>): OpenAIMessage[] {
    return history.map((msg) => {
        const anyMsg = msg as unknown as {
            tool_call_id?: string
            tool_calls?: unknown
            name?: string
        }
        const hasToolCalls = Array.isArray(anyMsg.tool_calls) && anyMsg.tool_calls.length > 0
        const text = getMessageText(msg)
        const base: OpenAIMessage = {
            role: msg.role,
            // OpenAI requires assistant content=null when tool_calls exist
            content: msg.role === 'assistant' && hasToolCalls
                ? null
                : text ?? '',
        }
        if (anyMsg.tool_call_id) base.tool_call_id = anyMsg.tool_call_id
        if (anyMsg.tool_calls) {
            base.tool_calls = normalizeToolCallsForOpenAI(anyMsg.tool_calls, originalToSanitized)
        }
        if (anyMsg.name) base.name = anyMsg.name
        return base
    })
}

function toOpenAIMessagesWithInlineBase64(
    history: UIMessage[],
    supportedMimeTypes: string[],
    originalToSanitized?: Record<string, string>,
): OpenAIMessage[] {
    return history.map((msg) => {
        const anyMsg = msg as unknown as {
            tool_call_id?: string
            tool_calls?: unknown
            name?: string
        }
        const hasToolCalls = Array.isArray(anyMsg.tool_calls) && anyMsg.tool_calls.length > 0
        const role = msg.role
        const messageParts = getMessageParts(msg)
        const hasAttachmentParts = messageParts.some((part) => part.type === 'file' || part.type === 'image')
        if (!hasAttachmentParts) {
            const text = getMessageText(msg)
            const base: OpenAIMessage = {
                role,
                content: role === 'assistant' && hasToolCalls ? null : text ?? '',
            }
            if (anyMsg.tool_call_id) base.tool_call_id = anyMsg.tool_call_id
            if (anyMsg.tool_calls) {
                base.tool_calls = normalizeToolCallsForOpenAI(anyMsg.tool_calls, originalToSanitized)
            }
            if (anyMsg.name) base.name = anyMsg.name
            return base
        }

        const content: OpenAIChatContentPart[] = []
        for (let i = 0; i < messageParts.length; i += 1) {
            const part = messageParts[i]
            if (part.type === 'text') {
                if (!part.text.trim()) continue
                content.push({ type: 'text', text: part.text.trim() })
                continue
            }
            const mimeType = (part.mimeType || 'application/octet-stream').trim()
            if (!mimeMatchesAllowlist(mimeType, supportedMimeTypes)) {
                throw new Error(`AttachmentMimeNotSupported: ${mimeType}`)
            }
            if (!mimeType.toLowerCase().startsWith('image/')) {
                throw new Error(`AttachmentTransportNotImplemented: ${mimeType}`)
            }
            if (!part.data || part.data.length <= 0) {
                throw new Error(`AttachmentDataMissing: ${part.assetId ?? part.name ?? 'unknown'}`)
            }
            if (!hasExplicitAttachmentHint(messageParts, i, part.name)) {
                content.push({ type: 'text', text: `File: ${part.name}` })
            }
            const base64 = Buffer.from(part.data).toString('base64')
            content.push({
                type: 'image_url',
                image_url: { url: `data:${mimeType};base64,${base64}` },
            })
        }

        const base: OpenAIMessage = {
            role,
            content: role === 'assistant' && hasToolCalls
                ? null
                : (content.length > 0 ? content : (getMessageText(msg) ?? '')),
        }
        if (anyMsg.tool_call_id) base.tool_call_id = anyMsg.tool_call_id
        if (anyMsg.tool_calls) {
            base.tool_calls = normalizeToolCallsForOpenAI(anyMsg.tool_calls, originalToSanitized)
        }
        if (anyMsg.name) base.name = anyMsg.name
        return base
    })
}

export function buildInlineBase64ChatMessages(args: {
    history: UIMessage[]
    attachments?: TurnAttachment[]
    inputText?: string
    supportedMimeTypes: string[]
}): Array<{ role: string; content?: unknown }> {
    const normalizedHistory = appendLegacyAttachmentsToLastUser(
        args.history,
        args.attachments ?? [],
        args.inputText,
    )
    return toOpenAIMessagesWithInlineBase64(normalizedHistory, args.supportedMimeTypes)
}

type OpenAIAttachmentRouteReason =
    | 'no_file_parts'
    | 'mime_not_supported'
    | 'transport_not_implemented'
    | 'model_does_not_support_files'
    | 'native_files_available'

type OpenAIAttachmentRoute = {
    normalizedHistory: UIMessage[]
    inputFileCount: number
    supportsNativeFiles: boolean
    selectedTransport: 'chat_completions' | 'responses' | 'chat_completions_inline' | 'reject'
    reason: OpenAIAttachmentRouteReason
}

function collectFileParts(messages: UIMessage[]): Array<Extract<MessageContentPart, { type: 'file' | 'image' }>> {
    const out: Array<Extract<MessageContentPart, { type: 'file' | 'image' }>> = []
    for (const msg of messages) {
        for (const part of getMessageParts(msg)) {
            if (part.type === 'file' || part.type === 'image') out.push(part)
        }
    }
    return out
}

function resolveAttachmentRoute(args: {
    history: UIMessage[]
    attachments: TurnAttachment[]
    inputText?: string
    supportsNativeFiles: boolean
    attachmentTransport: string
    supportedMimeTypes: string[]
}): OpenAIAttachmentRoute {
    const normalizedHistory = appendLegacyAttachmentsToLastUser(args.history, args.attachments, args.inputText)
    const fileParts = collectFileParts(normalizedHistory)
    if (fileParts.length <= 0) {
        return {
            normalizedHistory,
            inputFileCount: 0,
            supportsNativeFiles: args.supportsNativeFiles,
            selectedTransport: 'chat_completions',
            reason: 'no_file_parts',
        }
    }
    if (!args.supportsNativeFiles) {
        return {
            normalizedHistory,
            inputFileCount: fileParts.length,
            supportsNativeFiles: false,
            selectedTransport: 'reject',
            reason: 'model_does_not_support_files',
        }
    }
    if (args.attachmentTransport === 'remote_file_id') {
        return {
            normalizedHistory,
            inputFileCount: fileParts.length,
            supportsNativeFiles: true,
            selectedTransport: 'responses',
            reason: 'native_files_available',
        }
    }
    const hasUnsupportedMime = fileParts.some((part) => {
        const mime = (part.mimeType || 'application/octet-stream').trim()
        return !mimeMatchesAllowlist(mime, args.supportedMimeTypes)
    })
    if (hasUnsupportedMime) {
        return {
            normalizedHistory,
            inputFileCount: fileParts.length,
            supportsNativeFiles: true,
            selectedTransport: 'reject',
            reason: 'mime_not_supported',
        }
    }
    if (args.attachmentTransport === 'inline_base64') {
        const hasNonImageMime = fileParts.some((part) => {
            const mime = (part.mimeType || 'application/octet-stream').toLowerCase()
            return !mime.startsWith('image/')
        })
        if (hasNonImageMime) {
            return {
                normalizedHistory,
                inputFileCount: fileParts.length,
                supportsNativeFiles: true,
                selectedTransport: 'reject',
                reason: 'transport_not_implemented',
            }
        }
        return {
            normalizedHistory,
            inputFileCount: fileParts.length,
            supportsNativeFiles: true,
            selectedTransport: 'chat_completions_inline',
            reason: 'native_files_available',
        }
    }
    return {
        normalizedHistory,
        inputFileCount: fileParts.length,
        supportsNativeFiles: true,
        selectedTransport: 'reject',
        reason: 'transport_not_implemented',
    }
}

function resolveProviderTraceId(args: {
    traceId?: string
    providerId: string
    modelId: string
}): string {
    const raw = typeof args.traceId === 'string' ? args.traceId.trim() : ''
    if (raw.length > 0) return raw
    const suffix = Math.random().toString(36).slice(2, 8)
    return `trace_${args.providerId}_${args.modelId}_${Date.now()}_${suffix}`
}

function sanitizeToolName(name: string): string {
    const cleaned = name.replace(/[^a-zA-Z0-9_-]/g, '_') || 'tool'
    return cleaned.length > 64 ? cleaned.slice(0, 64) : cleaned
}

function ensureUniqueToolName(base: string, used: Set<string>): string {
    let name = base
    let counter = 1
    while (used.has(name)) {
        counter += 1
        const suffix = `_${counter}`
        const trimmed = base.slice(0, Math.max(1, 64 - suffix.length))
        name = `${trimmed}${suffix}`
    }
    used.add(name)
    return name
}

function toOpenAITools(tools?: ToolDef[]): {
    tools: OpenAITool[]
    nameMap: Record<string, string>
    originalToSanitized: Record<string, string>
} | undefined {
    if (!tools || tools.length === 0) return undefined
    const nameMap: Record<string, string> = {}
    const used = new Set<string>()
    const originalToSanitized: Record<string, string> = {}
        const mapped = tools.map((tool) => {
            const sanitized = sanitizeToolName(tool.name)
            const unique = ensureUniqueToolName(sanitized, used)
            nameMap[unique] = tool.name
            originalToSanitized[tool.name] = unique
            return {
                type: 'function' as const,
                function: {
                    name: unique,
                    description: tool.description,
                    parameters: tool.inputSchema,
                },
            }
    })
    return { tools: mapped, nameMap, originalToSanitized }
}

function normalizeParams(params?: LLMParams): {
    temperature?: number
    max_tokens?: number
    top_p?: number
    stop?: string[]
} {
    const raw = params as Record<string, unknown> | undefined
    if (!raw) return {}
    const out: { temperature?: number; max_tokens?: number; top_p?: number; stop?: string[] } = {}
    if (typeof raw.temperature === 'number') out.temperature = raw.temperature
    const maxTokens = raw.maxTokens ?? raw.maxOutputTokens
    if (typeof maxTokens === 'number') out.max_tokens = maxTokens
    const topP = raw.top_p ?? raw.topP
    if (typeof topP === 'number') out.top_p = topP
    if (Array.isArray(raw.stop) && raw.stop.every((s) => typeof s === 'string')) out.stop = raw.stop as string[]
    return out
}

async function readErrorResponse(res: Response): Promise<{ message: string; bodyPreview: string }> {
    const text = await res.text()
    let message = res.statusText
    if (text) {
        try {
            const data = JSON.parse(text) as { error?: { message?: string } }
            message = data?.error?.message ?? text
        } catch {
            message = text
        }
    }
    return { message, bodyPreview: text.slice(0, 200) }
}

function isOpenAIInvalidFileReference(args: {
    status: number
    message: string
    bodyPreview: string
}): boolean {
    const hay = `${args.message}\n${args.bodyPreview}`.toLowerCase()
    const hasFileContext = hay.includes('file') || hay.includes('input_file') || hay.includes('file_id')
    if (!hasFileContext) return false
    if (hay.includes('invalid_file')) return true
    if (hay.includes('invalid_file_id')) return true
    if (hay.includes('expired_file')) return true
    if (hay.includes('file_not_found')) return true
    if (hay.includes('file not found')) return true
    if (hay.includes('no such file')) return true
    if (hay.includes('unknown file')) return true
    if (hay.includes('invalid file')) return true
    if (hay.includes('does not exist')) return true
    if (args.status === 404) return true
    return false
}

function buildHeaders(ctx: ProviderCtx, extra?: Record<string, string>): Record<string, string> {
    const headers: Record<string, string> = {
        'Content-Type': 'application/json',
    }
    if (ctx.apiKey) headers.Authorization = `Bearer ${ctx.apiKey}`
    return { ...headers, ...(ctx.headers ?? {}), ...(extra ?? {}) }
}

function resolveBaseUrl(ctx: ProviderCtx, config: OpenAICompatConfig): string {
    const base = (ctx.baseUrl || config.defaultBaseUrl).replace(/\/$/, '')
    return config.normalizeBaseUrl ? config.normalizeBaseUrl(base) : base
}

type StreamStats = { textEvents: number; nonTextEvents: number }
type ToolCallChunk = {
    id?: string
    name?: string
    arguments?: string
}

type OpenAIResponsesInputPart =
    | { type: 'input_text'; text: string }
    | { type: 'output_text'; text: string }
    | { type: 'refusal'; refusal: string }
    | { type: 'input_file'; file_id: string }

type OpenAIResponsesInputItem = {
    role: 'system' | 'user' | 'assistant' | 'developer'
    content: OpenAIResponsesInputPart[]
}

type ResponsesInputBuildResult = {
    normalizedHistory: UIMessage[]
    input: OpenAIResponsesInputItem[]
}

type ResponsesRequestMetrics = {
    partsCount: number
    attachmentsCount: number
    estimatedTokens: number
    safetyMargin: number
}

function normalizeResponsesParams(params?: LLMParams): {
    temperature?: number
    max_output_tokens?: number
    top_p?: number
} {
    const raw = params as Record<string, unknown> | undefined
    if (!raw) return {}
    const out: { temperature?: number; max_output_tokens?: number; top_p?: number } = {}
    if (typeof raw.temperature === 'number') out.temperature = raw.temperature
    const maxTokens = raw.maxTokens ?? raw.maxOutputTokens
    if (typeof maxTokens === 'number') out.max_output_tokens = maxTokens
    const topP = raw.top_p ?? raw.topP
    if (typeof topP === 'number') out.top_p = topP
    return out
}

function toAttachmentPart(part: Extract<MessageContentPart, { type: 'file' | 'image' }>): OpenAIResponsesInputPart {
    const fileId = typeof part.providerFileId === 'string' ? part.providerFileId.trim() : ''
    if (!fileId) throw new Error(`ProviderFileIdMissing: ${part.assetId}`)
    return {
        type: 'input_file',
        file_id: fileId,
    }
}

function toAttachmentHintPart(
    role: OpenAIResponsesInputItem['role'],
    part: Extract<MessageContentPart, { type: 'file' | 'image' }>,
): OpenAIResponsesInputPart {
    return toResponsesTextPart(role, `File: ${part.name}`)
}

function hasExplicitAttachmentHint(
    parts: MessageContentPart[],
    index: number,
    name: string,
): boolean {
    const previous = index > 0 ? parts[index - 1] : null
    return Boolean(previous && previous.type === 'text' && previous.text.trim() === `File: ${name}`)
}

function resolveResponsesRole(role: string): OpenAIResponsesInputItem['role'] | null {
    if (role === 'system' || role === 'user' || role === 'assistant' || role === 'developer') return role
    return null
}

function toResponsesTextPart(
    role: OpenAIResponsesInputItem['role'],
    text: string,
): OpenAIResponsesInputPart {
    if (role === 'assistant') return { type: 'output_text', text }
    return { type: 'input_text', text }
}

export function buildResponsesInput(
    history: UIMessage[],
    attachments: TurnAttachment[],
    inputText?: string,
): ResponsesInputBuildResult {
    const normalizedHistory = appendLegacyAttachmentsToLastUser(history, attachments, inputText)
    const out: OpenAIResponsesInputItem[] = []
    for (let i = 0; i < normalizedHistory.length; i += 1) {
        const msg = normalizedHistory[i]
        if (!msg) continue
        const role = resolveResponsesRole((msg as { role?: string }).role ?? '')
        if (!role) continue
        const parts: OpenAIResponsesInputPart[] = []
        const messageParts = getMessageParts(msg)
        for (let i = 0; i < messageParts.length; i += 1) {
            const part = messageParts[i]
            if (part.type === 'text' && !part.text.trim()) continue
            if (part.type === 'text') {
                parts.push(toResponsesTextPart(role, part.text))
            } else if (part.type === 'file' || part.type === 'image') {
                if (!hasExplicitAttachmentHint(messageParts, i, part.name)) {
                    parts.push(toAttachmentHintPart(role, part))
                }
                parts.push(toAttachmentPart(part))
            }
        }
        if (!parts.length) continue
        out.push({
            role,
            content: parts,
        })
    }
    return {
        normalizedHistory,
        input: out,
    }
}

function toResponsesInput(
    history: UIMessage[],
    attachments: TurnAttachment[],
    inputText?: string,
): OpenAIResponsesInputItem[] {
    return buildResponsesInput(history, attachments, inputText).input
}

function extractResponsesText(raw: unknown): string {
    if (!raw || typeof raw !== 'object') return ''
    const rec = raw as Record<string, unknown>
    if (typeof rec.output_text === 'string' && rec.output_text.length > 0) {
        return rec.output_text
    }
    const outputs = Array.isArray(rec.output) ? rec.output : []
    const chunks: string[] = []
    for (const item of outputs) {
        if (!item || typeof item !== 'object') continue
        const content = Array.isArray((item as { content?: unknown }).content)
            ? ((item as { content: unknown[] }).content)
            : []
        for (const part of content) {
            if (!part || typeof part !== 'object') continue
            const text = (part as { text?: unknown }).text
            if (typeof text === 'string' && text.length > 0) {
                chunks.push(text)
            }
        }
    }
    return chunks.join('')
}

async function completeWithResponses(args: {
    baseUrl: string
    modelId: string
    providerId: string
    traceId?: string
    history: UIMessage[]
    params?: LLMParams
    attachments: TurnAttachment[]
    inputText?: string
    headers: Record<string, string>
    signal?: AbortSignal
}): Promise<string> {
    const inputItems = toResponsesInput(args.history, args.attachments, args.inputText)
    const msgCount = inputItems.length
    const inputFileCount = inputItems.reduce(
        (acc, item) => acc + item.content.filter((part) => part.type === 'input_file').length,
        0,
    )
    const inputTextCount = inputItems.reduce(
        (acc, item) => acc + item.content.filter((part) => part.type === 'input_text' || part.type === 'output_text').length,
        0,
    )
    log('info', '[PROVIDER][payload]', {
        traceId: args.traceId ?? null,
        provider: args.providerId,
        model: args.modelId,
        msgCount,
        inputFileCount,
        inputTextCount,
        transport: 'responses',
        stream: false,
    })
    const payload = {
        model: args.modelId,
        input: inputItems,
        stream: false,
        ...normalizeResponsesParams(args.params),
    }
    logResponsesPayloadPreview({
        traceId: args.traceId,
        modelId: args.modelId,
        providerId: args.providerId,
        stream: false,
        input: payload.input,
    })
    const res = await fetch(`${args.baseUrl}/responses`, {
        method: 'POST',
        headers: args.headers,
        body: JSON.stringify(payload),
        signal: args.signal,
    })
    if (!res.ok) {
        const { message, bodyPreview } = await readErrorResponse(res)
        log('warn', '[PROVIDER][http_error]', {
            traceId: args.traceId ?? null,
            provider: args.providerId,
            model: args.modelId,
            status: res.status,
            statusText: res.statusText,
            bodyPreview,
        })
        if (isOpenAIInvalidFileReference({ status: res.status, message, bodyPreview })) {
            throw new Error(`OPENAI_FILE_REFERENCE_INVALID: ${message}`)
        }
        throw new Error(message)
    }
    const data = await res.json()
    return extractResponsesText(data)
}

function readResponsesErrorMessage(payload: Record<string, unknown>): string {
    const directError = payload.error
    if (typeof directError === 'string' && directError.trim().length > 0) return directError
    if (directError && typeof directError === 'object') {
        const errObj = directError as Record<string, unknown>
        if (typeof errObj.message === 'string' && errObj.message.trim().length > 0) return errObj.message
        if (typeof errObj.code === 'string' && errObj.code.trim().length > 0) return errObj.code
    }
    if (typeof payload.message === 'string' && payload.message.trim().length > 0) return payload.message
    const response = payload.response
    if (response && typeof response === 'object') {
        const resObj = response as Record<string, unknown>
        const responseError = resObj.error
        if (typeof responseError === 'string' && responseError.trim().length > 0) return responseError
        if (responseError && typeof responseError === 'object') {
            const errObj = responseError as Record<string, unknown>
            if (typeof errObj.message === 'string' && errObj.message.trim().length > 0) return errObj.message
            if (typeof errObj.code === 'string' && errObj.code.trim().length > 0) return errObj.code
        }
    }
    return 'OpenAI responses streaming failed'
}

function readResponsesErrorCode(payload: Record<string, unknown>): string {
    const directError = payload.error
    if (typeof directError === 'string' && directError.trim().length > 0) return directError
    if (directError && typeof directError === 'object') {
        const errObj = directError as Record<string, unknown>
        if (typeof errObj.code === 'string' && errObj.code.trim().length > 0) return errObj.code
    }
    if (typeof payload.code === 'string' && payload.code.trim().length > 0) return payload.code
    const response = payload.response
    if (response && typeof response === 'object') {
        const resObj = response as Record<string, unknown>
        const responseError = resObj.error
        if (responseError && typeof responseError === 'object') {
            const errObj = responseError as Record<string, unknown>
            if (typeof errObj.code === 'string' && errObj.code.trim().length > 0) return errObj.code
        }
    }
    return 'OPENAI_RESPONSES_FAILED'
}

function readResponsesErrorStatus(payload: Record<string, unknown>): number | undefined {
    const directStatus = payload.status
    if (typeof directStatus === 'number' && Number.isFinite(directStatus)) return directStatus
    const directError = payload.error
    if (directError && typeof directError === 'object') {
        const errObj = directError as Record<string, unknown>
        if (typeof errObj.status === 'number' && Number.isFinite(errObj.status)) return errObj.status
    }
    const response = payload.response
    if (response && typeof response === 'object') {
        const resObj = response as Record<string, unknown>
        const responseError = resObj.error
        if (responseError && typeof responseError === 'object') {
            const errObj = responseError as Record<string, unknown>
            if (typeof errObj.status === 'number' && Number.isFinite(errObj.status)) return errObj.status
        }
    }
    return undefined
}

export class OpenAIResponsesStreamError extends Error {
    code: string
    status?: number
    provider: string
    model: string
    eventType?: string
    rawEvent?: unknown

    constructor(args: {
        message: string
        code: string
        status?: number
        provider: string
        model: string
        eventType?: string
        rawEvent?: unknown
    }) {
        super(args.message)
        this.name = 'OpenAIResponsesStreamError'
        this.code = args.code
        this.status = args.status
        this.provider = args.provider
        this.model = args.model
        this.eventType = args.eventType
        this.rawEvent = args.rawEvent
    }
}

export type ResponsesSseParseResult =
    | { kind: 'delta'; delta: string }
    | { kind: 'done' }
    | { kind: 'ignore' }

function extractResponsesDelta(payload: Record<string, unknown>): string {
    const direct = payload.delta
    if (typeof direct === 'string') return direct
    if (direct && typeof direct === 'object') {
        const directObj = direct as Record<string, unknown>
        if (typeof directObj.text === 'string') return directObj.text
    }
    if (typeof payload.text === 'string') return payload.text
    const outputText = payload.output_text
    if (outputText && typeof outputText === 'object') {
        const outputObj = outputText as Record<string, unknown>
        if (typeof outputObj.delta === 'string') return outputObj.delta
    }
    return ''
}

function toResponsesStreamError(payload: Record<string, unknown>, args: {
    provider: string
    model: string
    type: string
}): OpenAIResponsesStreamError {
    return new OpenAIResponsesStreamError({
        message: readResponsesErrorMessage(payload),
        code: readResponsesErrorCode(payload),
        status: readResponsesErrorStatus(payload),
        provider: args.provider,
        model: args.model,
        eventType: args.type,
        rawEvent: payload,
    })
}

export function parseResponsesSseEvent(payload: unknown, args: {
    provider: string
    model: string
}): ResponsesSseParseResult {
    if (!payload || typeof payload !== 'object') return { kind: 'ignore' }
    const payloadObj = payload as Record<string, unknown>
    const type = typeof payloadObj.type === 'string' ? payloadObj.type : ''
    if (type === 'response.output_text.delta') {
        const delta = extractResponsesDelta(payloadObj)
        if (delta.length > 0) return { kind: 'delta', delta }
        return { kind: 'ignore' }
    }
    if (type === 'response.completed' || type === 'response.output_text.done') {
        return { kind: 'done' }
    }
    if (type === 'response.failed' || type === 'error') {
        throw toResponsesStreamError(payloadObj, {
            provider: args.provider,
            model: args.model,
            type,
        })
    }
    return { kind: 'ignore' }
}

function collectResponsesRequestMetrics(normalizedHistory: UIMessage[], input: OpenAIResponsesInputItem[]): ResponsesRequestMetrics {
    let partsCount = 0
    let attachmentsCount = 0
    for (const item of input) {
        partsCount += item.content.length
        attachmentsCount += item.content.filter((part) => part.type === 'input_file').length
    }
    let estimatedTokens = 0
    let safetyMargin = 0
    for (const msg of normalizedHistory) {
        const estimate = estimateMessageTokens(msg)
        estimatedTokens += estimate.totalTokens
        safetyMargin += estimate.safetyMarginTokens
    }
    return {
        partsCount,
        attachmentsCount,
        estimatedTokens,
        safetyMargin,
    }
}

function logResponsesRequest(args: {
    modelId: string
    providerId: string
    traceId?: string
    messageCount: number
    inputTextCount: number
    attachmentTransport: string
    metrics: ResponsesRequestMetrics
}): void {
    log('info', '[PROVIDER][payload]', {
        traceId: args.traceId ?? null,
        provider: args.providerId,
        model: args.modelId,
        msgCount: args.messageCount,
        inputFileCount: args.metrics.attachmentsCount,
        inputTextCount: args.inputTextCount,
        attachmentTransport: args.attachmentTransport,
        estimatedTokens: args.metrics.estimatedTokens,
        safetyMargin: args.metrics.safetyMargin,
    })
}

function logResponsesPayloadPreview(args: {
    traceId?: string
    modelId: string
    providerId: string
    stream: boolean
    input: OpenAIResponsesInputItem[]
}): void {
    if (process.env.DEBUG_PROVIDER_PAYLOAD !== '1') return
    log('debug', '[PROVIDER][payload_detail]', {
        traceId: args.traceId ?? null,
        provider: args.providerId,
        model: args.modelId,
        stream: args.stream,
    }, { debugFlag: 'DEBUG_PROVIDER_PAYLOAD' })
    for (const item of args.input) {
        const blockTypes = item.content.map((part) => part.type)
        log('debug', '[PROVIDER][payload_detail]', {
            traceId: args.traceId ?? null,
            role: item.role,
            blocks: blockTypes,
        }, { debugFlag: 'DEBUG_PROVIDER_PAYLOAD' })
    }
}

function logChatCompletionsPayload(args: {
    traceId?: string
    providerId: string
    modelId: string
    stream: boolean
    messages: OpenAIMessage[]
}): void {
    const metrics = args.messages.reduce((acc, item) => {
        if (typeof item.content === 'string') {
            if (item.content.trim().length > 0) acc.inputTextCount += 1
            return acc
        }
        if (!Array.isArray(item.content)) return acc
        for (const part of item.content) {
            if (part.type === 'text') acc.inputTextCount += 1
            if (part.type === 'image_url') acc.inputFileCount += 1
        }
        return acc
    }, { inputTextCount: 0, inputFileCount: 0 })
    log('info', '[PROVIDER][payload]', {
        traceId: args.traceId ?? null,
        provider: args.providerId,
        model: args.modelId,
        msgCount: args.messages.length,
        inputFileCount: metrics.inputFileCount,
        inputTextCount: metrics.inputTextCount,
        transport: 'chat_completions',
        stream: args.stream,
    })
    if (process.env.DEBUG_PROVIDER_PAYLOAD !== '1') return
    for (const item of args.messages) {
        const hasToolCall = Array.isArray(item.tool_calls) && item.tool_calls.length > 0
        let blocks: string[] = []
        if (Array.isArray(item.content)) {
            blocks = item.content.map((part) => part.type === 'image_url' ? 'input_image' : 'input_text')
        } else {
            const blockType = item.role === 'assistant' ? 'output_text' : 'input_text'
            blocks = [blockType]
        }
        if (hasToolCall) blocks.push('tool_calls')
        log('debug', '[PROVIDER][payload_detail]', {
            traceId: args.traceId ?? null,
            role: item.role,
            blocks,
        }, { debugFlag: 'DEBUG_PROVIDER_PAYLOAD' })
    }
}

async function* streamWithResponses(args: {
    baseUrl: string
    modelId: string
    traceId?: string
    history: UIMessage[]
    params?: LLMParams
    attachments: TurnAttachment[]
    inputText?: string
    headers: Record<string, string>
    providerId: string
    attachmentTransport: string
    signal?: AbortSignal
}): AsyncGenerator<string, void> {
    const built = buildResponsesInput(args.history, args.attachments, args.inputText)
    const metrics = collectResponsesRequestMetrics(built.normalizedHistory, built.input)
    const inputTextCount = built.input.reduce(
        (acc, item) => acc + item.content.filter((part) => part.type === 'input_text' || part.type === 'output_text').length,
        0,
    )
    logResponsesRequest({
        modelId: args.modelId,
        providerId: args.providerId,
        traceId: args.traceId,
        messageCount: built.input.length,
        inputTextCount,
        attachmentTransport: args.attachmentTransport,
        metrics,
    })

    const controller = new AbortController()
    const forwardAbort = () => controller.abort(args.signal?.reason)
    if (args.signal) {
        if (args.signal.aborted) {
            controller.abort(args.signal.reason)
        } else {
            args.signal.addEventListener('abort', forwardAbort, { once: true })
        }
    }

    const payload = {
        model: args.modelId,
        input: built.input,
        stream: true,
        ...normalizeResponsesParams(args.params),
    }
    logResponsesPayloadPreview({
        traceId: args.traceId,
        modelId: args.modelId,
        providerId: args.providerId,
        stream: true,
        input: built.input,
    })
    try {
        const res = await fetch(`${args.baseUrl}/responses`, {
            method: 'POST',
            headers: args.headers,
            body: JSON.stringify(payload),
            signal: controller.signal,
        })
        if (!res.ok) {
            const { message, bodyPreview } = await readErrorResponse(res)
            log('warn', '[PROVIDER][http_error]', {
                traceId: args.traceId ?? null,
                provider: args.providerId,
                model: args.modelId,
                status: res.status,
                statusText: res.statusText,
                bodyPreview,
            })
            if (isOpenAIInvalidFileReference({ status: res.status, message, bodyPreview })) {
                throw new Error(`OPENAI_FILE_REFERENCE_INVALID: ${message}`)
            }
            throw new Error(message)
        }

        const reader = res.body?.getReader()
        if (!reader) return

        const decoder = new TextDecoder('utf-8')
        const debugEvents = process.env.DEBUG_OPENAI_RESPONSES_EVENTS === '1'
        let buffer = ''
        while (true) {
            if (controller.signal.aborted) return
            const { value, done } = await reader.read()
            if (done) break
            buffer += decoder.decode(value, { stream: true })
            const lines = buffer.split(/\r?\n/)
            buffer = lines.pop() ?? ''
            for (const line of lines) {
                const trimmed = line.trim()
                if (!trimmed.startsWith('data:')) continue
                const data = trimmed.slice(5).trim()
                if (!data) continue
                if (data === '[DONE]') return
                let parsed: unknown
                try {
                    parsed = JSON.parse(data)
                } catch {
                    continue
                }
                const parsedResult = parseResponsesSseEvent(parsed, {
                    provider: args.providerId,
                    model: args.modelId,
                })
                if (parsedResult.kind === 'delta') {
                    yield parsedResult.delta
                    continue
                }
                if (parsedResult.kind === 'done') return
                if (debugEvents && parsed && typeof parsed === 'object') {
                    const payloadObj = parsed as Record<string, unknown>
                    const type = typeof payloadObj.type === 'string' ? payloadObj.type : 'unknown'
                    log('debug', '[PROVIDER][responses_event]', {
                        traceId: args.traceId ?? null,
                        provider: args.providerId,
                        model: args.modelId,
                        type,
                    }, { debugFlag: 'DEBUG_PROVIDER_PAYLOAD' })
                }
            }
        }
    } catch (error) {
        if (controller.signal.aborted) return
        if (error instanceof OpenAIResponsesStreamError) throw error
        throw error
    } finally {
        if (args.signal) {
            args.signal.removeEventListener('abort', forwardAbort)
        }
    }
}

async function* streamSse(
    res: Response,
    stats?: StreamStats,
    nameMap?: Record<string, string>,
): AsyncGenerator<string, void> {
    const reader = res.body?.getReader()
    if (!reader) return
    const decoder = new TextDecoder('utf-8')
    let buffer = ''
    const toolCallsByIndex = new Map<number, ToolCallChunk>()
    let toolCallMode = false
    while (true) {
        const { value, done } = await reader.read()
        if (done) break
        buffer += decoder.decode(value, { stream: true })
        const lines = buffer.split(/\r?\n/)
        buffer = lines.pop() ?? ''
        for (const line of lines) {
            const trimmed = line.trim()
            if (!trimmed.startsWith('data:')) continue
            const data = trimmed.slice(5).trim()
            if (!data) continue
            if (data === '[DONE]') return
            let parsed: unknown
            try {
                parsed = JSON.parse(data)
            } catch {
                continue
            }
            const payload = parsed as {
                choices?: Array<{
                    delta?: {
                        content?: string
                        tool_calls?: Array<{
                            index?: number
                            id?: string
                            function?: { name?: string; arguments?: string }
                        }>
                    }
                    finish_reason?: string | null
                }>
            }
            const delta = payload?.choices?.[0]?.delta
            const finishReason = payload?.choices?.[0]?.finish_reason
            const toolDeltas = delta?.tool_calls
            const sawToolDeltas = Array.isArray(toolDeltas) && toolDeltas.length > 0
            if (sawToolDeltas) {
                toolCallMode = true
                for (const call of toolDeltas) {
                    const idx = typeof call.index === 'number' ? call.index : 0
                    const current = toolCallsByIndex.get(idx) ?? {}
                    if (call.id) current.id = call.id
                    const fnName = call.function?.name
                    if (fnName) current.name = nameMap?.[fnName] ?? fnName
                    const args = call.function?.arguments
                    if (typeof args === 'string') {
                        current.arguments = `${current.arguments ?? ''}${args}`
                    }
                    toolCallsByIndex.set(idx, current)
                }
                if (stats) stats.nonTextEvents += 1
            }
            const content = toolCallMode ? undefined : delta?.content
            if (typeof content === 'string' && content.length > 0) {
                if (stats) stats.textEvents += 1
                yield content
            } else if (stats && !sawToolDeltas) {
                stats.nonTextEvents += 1
            }

            if (finishReason === 'tool_calls' && toolCallsByIndex.size > 0) {
                const calls = Array.from(toolCallsByIndex.entries())
                    .sort(([a], [b]) => a - b)
                    .map(([idx, call]) => ({
                        id: call.id ?? `call_${idx + 1}`,
                        name: call.name ?? `tool_${idx + 1}`,
                        arguments: call.arguments ?? '',
                    }))
                    .filter(call => Boolean(call.name))
                if (calls.length > 0) {
                    const payloadJson = JSON.stringify({ tool_calls: calls })
                    log('debug', '[TOOLS][provider_tool_calls_emitted]', { count: calls.length }, { debugFlag: 'DEBUG_TOOLS' })
                    yield payloadJson
                }
                return
            }
        }
    }
    if (toolCallMode && toolCallsByIndex.size > 0) {
        const calls = Array.from(toolCallsByIndex.entries())
            .sort(([a], [b]) => a - b)
            .map(([idx, call]) => ({
                id: call.id ?? `call_${idx + 1}`,
                name: call.name ?? `tool_${idx + 1}`,
                arguments: call.arguments ?? '',
            }))
            .filter(call => Boolean(call.name))
        if (calls.length > 0) {
            const payloadJson = JSON.stringify({ tool_calls: calls })
            log('debug', '[TOOLS][provider_tool_calls_emitted]', { count: calls.length }, { debugFlag: 'DEBUG_TOOLS' })
            yield payloadJson
        }
    }
}

function rethrow(provider: string, err: unknown, httpStatus?: number): never {
    const ne = normalizeError(err, { provider, httpStatus })
    throw new Error(`${ne.code}: ${ne.message}`)
}

export function createOpenAICompatibleProvider(config: OpenAICompatConfig): Provider {
    return {
        id: config.id,
        capabilities: config.capabilities ?? {
            nativeFiles: false,
            supportedMimeTypes: [],
            attachmentTransport: 'none',
        },
        supports: () => true,

        async *stream(
            { modelId, history, params, tools, attachments, inputText }: {
                modelId: string
                history: UIMessage[]
                params?: LLMParams
                tools?: ToolDef[]
                attachments?: TurnAttachment[]
                inputText?: string
            },
            ctx
        ): StreamGen {
            try {
                const traceId = resolveProviderTraceId({
                    traceId: ctx.traceId,
                    providerId: config.id,
                    modelId,
                })
                const files = attachments ?? []
                const supportsNativeFiles = config.capabilities?.nativeFiles === true
                const attachmentTransport = config.capabilities?.attachmentTransport ?? 'none'
                const supportedMimeTypes = config.capabilities?.supportedMimeTypes ?? []
                const route = resolveAttachmentRoute({
                    history,
                    attachments: files,
                    inputText,
                    supportsNativeFiles,
                    attachmentTransport,
                    supportedMimeTypes,
                })
                log('info', '[PROVIDER][route]', {
                    traceId,
                    provider: config.id,
                    model: modelId,
                    supportsNativeFiles: route.supportsNativeFiles,
                    selectedTransport: route.selectedTransport,
                    reason: route.reason,
                    inputFileCount: route.inputFileCount,
                    attachmentTransport,
                })
                if (config.requireApiKey !== false && !ctx.apiKey) {
                    throw new Error('API key missing')
                }
                const baseUrl = resolveBaseUrl(ctx, config)
                const headers = buildHeaders(ctx, config.extraHeaders?.(ctx))
                if (route.selectedTransport === 'reject') {
                    if (route.reason === 'mime_not_supported') {
                        throw new Error('UnsupportedAttachmentType: provider/model does not support one or more attachment MIME types')
                    }
                    if (route.reason === 'transport_not_implemented') {
                        throw new Error(`AttachmentTransportNotImplemented: ${attachmentTransport}`)
                    }
                    throw new Error('ModelDoesNotSupportFiles: provider has no native file/media transport')
                }
                if (route.selectedTransport === 'responses') {
                    for await (const delta of streamWithResponses({
                        baseUrl,
                        modelId,
                        traceId,
                        history: route.normalizedHistory,
                        params,
                        attachments: [],
                        inputText: undefined,
                        headers,
                        providerId: config.id,
                        attachmentTransport,
                        signal: ctx.abortSignal,
                    })) {
                        if (delta) yield delta
                    }
                    return
                }
                const mappedTools = toOpenAITools(tools)
                const messages = route.selectedTransport === 'chat_completions_inline'
                    ? toOpenAIMessagesWithInlineBase64(route.normalizedHistory, supportedMimeTypes, mappedTools?.originalToSanitized)
                    : toOpenAIMessages(route.normalizedHistory, mappedTools?.originalToSanitized)
                if (process.env.DEBUG_TOOLS === '1') {
                    const tail = messages.slice(-8).map((m) => ({
                        role: m.role,
                        contentLen: typeof m.content === 'string' ? m.content.length : 0,
                        tool_call_id: m.tool_call_id,
                        tool_calls: Array.isArray(m.tool_calls)
                            ? m.tool_calls.map((call) => ({
                                id: call.id,
                                type: call.type,
                                function: {
                                    name: call.function?.name,
                                    argumentsLen: typeof call.function?.arguments === 'string'
                                        ? call.function.arguments.length
                                        : 0,
                                },
                            }))
                            : undefined,
                    }))
                    log('debug', '[TOOLS][provider_preview]', {
                        traceId,
                        tail,
                    }, { debugFlag: 'DEBUG_TOOLS' })
                }
                logChatCompletionsPayload({
                    traceId,
                    providerId: config.id,
                    modelId,
                    stream: true,
                    messages,
                })
                const payload = {
                    model: modelId,
                    messages,
                    stream: true,
                    ...normalizeParams(params),
                } as Record<string, unknown>
                if (mappedTools) {
                    payload.tools = mappedTools.tools
                    payload.tool_choice = 'auto'
                }
                const res = await fetch(`${baseUrl}/chat/completions`, {
                    method: 'POST',
                    headers,
                    body: JSON.stringify(payload),
                    signal: ctx.abortSignal,
                })
                if (!res.ok) {
                    const { message, bodyPreview } = await readErrorResponse(res)
                    log('warn', '[PROVIDER][http_error]', {
                        traceId,
                        provider: config.id,
                        model: modelId,
                        status: res.status,
                        statusText: res.statusText,
                        bodyPreview,
                    })
                    throw new Error(message)
                }
                const stats: StreamStats = { textEvents: 0, nonTextEvents: 0 }
                let totalText = 0
                for await (const chunk of streamSse(res, stats, mappedTools?.nameMap)) {
                    totalText += chunk.length
                    yield chunk
                }
                if (totalText === 0) {
                    log('warn', '[PROVIDER][empty_output]', {
                        traceId,
                        provider: config.id,
                        modelId,
                        textEvents: stats.textEvents,
                        nonTextEvents: stats.nonTextEvents,
                    })
                }
            } catch (e) {
                if (e instanceof OpenAIResponsesStreamError) {
                    throw e
                }
                const err = e as Error & { status?: number }
                rethrow(config.id, err, err.status)
            }
        },

        async complete(
            { modelId, history, params, tools, attachments, inputText }: {
                modelId: string
                history: UIMessage[]
                params?: LLMParams
                tools?: ToolDef[]
                attachments?: TurnAttachment[]
                inputText?: string
            },
            ctx
        ): Promise<string> {
            try {
                const traceId = resolveProviderTraceId({
                    traceId: ctx.traceId,
                    providerId: config.id,
                    modelId,
                })
                const files = attachments ?? []
                const supportsNativeFiles = config.capabilities?.nativeFiles === true
                const attachmentTransport = config.capabilities?.attachmentTransport ?? 'none'
                const supportedMimeTypes = config.capabilities?.supportedMimeTypes ?? []
                const route = resolveAttachmentRoute({
                    history,
                    attachments: files,
                    inputText,
                    supportsNativeFiles,
                    attachmentTransport,
                    supportedMimeTypes,
                })
                log('info', '[PROVIDER][route]', {
                    traceId,
                    provider: config.id,
                    model: modelId,
                    supportsNativeFiles: route.supportsNativeFiles,
                    selectedTransport: route.selectedTransport,
                    reason: route.reason,
                    inputFileCount: route.inputFileCount,
                    attachmentTransport,
                })
                if (config.requireApiKey !== false && !ctx.apiKey) {
                    throw new Error('API key missing')
                }
                const baseUrl = resolveBaseUrl(ctx, config)
                const headers = buildHeaders(ctx, config.extraHeaders?.(ctx))
                if (route.selectedTransport === 'reject') {
                    if (route.reason === 'mime_not_supported') {
                        throw new Error('UnsupportedAttachmentType: provider/model does not support one or more attachment MIME types')
                    }
                    if (route.reason === 'transport_not_implemented') {
                        throw new Error(`AttachmentTransportNotImplemented: ${attachmentTransport}`)
                    }
                    throw new Error('ModelDoesNotSupportFiles: provider has no native file/media transport')
                }
                if (route.selectedTransport === 'responses') {
                    return await completeWithResponses({
                        baseUrl,
                        modelId,
                        providerId: config.id,
                        traceId,
                        history: route.normalizedHistory,
                        params,
                        attachments: [],
                        inputText: undefined,
                        headers,
                        signal: ctx.abortSignal,
                    })
                }
                const mappedTools = toOpenAITools(tools)
                const messages = route.selectedTransport === 'chat_completions_inline'
                    ? toOpenAIMessagesWithInlineBase64(route.normalizedHistory, supportedMimeTypes, mappedTools?.originalToSanitized)
                    : toOpenAIMessages(route.normalizedHistory, mappedTools?.originalToSanitized)
                if (process.env.DEBUG_TOOLS === '1') {
                    const tail = messages.slice(-8).map((m) => ({
                        role: m.role,
                        contentLen: typeof m.content === 'string' ? m.content.length : 0,
                        tool_call_id: m.tool_call_id,
                        tool_calls: Array.isArray(m.tool_calls)
                            ? m.tool_calls.map((call) => ({
                                id: call.id,
                                type: call.type,
                                function: {
                                    name: call.function?.name,
                                    argumentsLen: typeof call.function?.arguments === 'string'
                                        ? call.function.arguments.length
                                        : 0,
                                },
                            }))
                            : undefined,
                    }))
                    log('debug', '[TOOLS][provider_preview]', {
                        traceId,
                        tail,
                    }, { debugFlag: 'DEBUG_TOOLS' })
                }
                logChatCompletionsPayload({
                    traceId,
                    providerId: config.id,
                    modelId,
                    stream: false,
                    messages,
                })
                const payload = {
                    model: modelId,
                    messages,
                    stream: false,
                    ...normalizeParams(params),
                } as Record<string, unknown>
                if (mappedTools) {
                    payload.tools = mappedTools.tools
                    payload.tool_choice = 'auto'
                }
                const res = await fetch(`${baseUrl}/chat/completions`, {
                    method: 'POST',
                    headers,
                    body: JSON.stringify(payload),
                    signal: ctx.abortSignal,
                })
                if (!res.ok) {
                    const { message, bodyPreview } = await readErrorResponse(res)
                    log('warn', '[PROVIDER][http_error]', {
                        traceId,
                        provider: config.id,
                        model: modelId,
                        status: res.status,
                        statusText: res.statusText,
                        bodyPreview,
                    })
                    throw new Error(message)
                }
                const data = await res.json() as {
                    choices?: Array<{ message?: { content?: string | null } }>
                }
                return data?.choices?.[0]?.message?.content ?? ''
            } catch (e) {
                const err = e as Error & { status?: number }
                rethrow(config.id, err, err.status)
            }
        },
    }
}
