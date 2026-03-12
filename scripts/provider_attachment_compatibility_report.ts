import fs from 'node:fs'
import path from 'node:path'
import { strict as assert } from 'node:assert'

import type { LLMModelConfig, MessageContentPart, ModelCapabilities, UIMessage } from '@contracts'
import { validateAttachmentsByModelCapabilities, AttachmentCapabilityError } from '../electron/core/attachments/validateAttachmentsBeforeSend'
import { extractFileAttachmentsFromHistory } from '../electron/llm/adapters/messageParts'
import { buildInlineBase64ChatMessages, buildResponsesInput } from '../electron/llm/providers/openaiCompatible'
import { DEFAULT_ATTACHMENT_LIMITS, PROVIDER_ATTACHMENT_CAPS_OVERRIDES } from '../electron/core/attachments/attachmentPolicy'

type ProviderStatus = 'done' | 'partial' | 'unsupported'

type ProviderSmoke = {
    ok: boolean
    payloadKind: 'input_file' | 'inline_image_base64' | 'none'
    hasInlineBase64: boolean
    droppedByReason: string | null
    notes: string[]
}

type ProviderRow = {
    providerId: string
    modelIds: string[]
    supportsNativeFiles: boolean
    attachmentTransport: string
    supportedMimeTypes: string[]
    maxFilesPerTurn: number | null
    maxFileSizeMB: number | null
    sendRouteWithFiles: string
    sendRouteNoFiles: string
    rewriteRouteWithFiles: string
    rewriteRouteNoFiles: string
    smoke: ProviderSmoke
    status: ProviderStatus
    reason: string
    nextStep: string
}

type RawModel = {
    id: string
    name?: string
    provider?: string
    capabilities?: Partial<ModelCapabilities>
}

const DEFAULT_CAPABILITIES: ModelCapabilities = {
    stream: true,
    tools: true,
    json: true,
    vision: false,
    embeddings: false,
    nativeFiles: false,
    supportedMimeTypes: [],
    attachmentTransport: 'none',
}

const KNOWN_PROVIDERS = ['openai', 'gemini', 'anthropic', 'openrouter', 'deepseek', 'ollama', 'lmstudio'] as const

const PROVIDER_CAPS_DEFAULTS: Record<string, Partial<Pick<ModelCapabilities, 'nativeFiles' | 'attachmentTransport' | 'supportedMimeTypes'>>> = {
    openai: {
        nativeFiles: true,
        attachmentTransport: 'remote_file_id',
        supportedMimeTypes: ['image/*', 'application/pdf'],
    },
    openrouter: {
        nativeFiles: true,
        attachmentTransport: 'inline_base64',
        supportedMimeTypes: ['image/*'],
    },
}

function resolveProviderCaps(providerId: string): Pick<ModelCapabilities, 'nativeFiles' | 'supportedMimeTypes' | 'maxFileSizeMB' | 'maxFilesPerTurn' | 'attachmentTransport'> {
    const override = PROVIDER_ATTACHMENT_CAPS_OVERRIDES[providerId] ?? {}
    const defaults = PROVIDER_CAPS_DEFAULTS[providerId] ?? {}
    const nativeFiles = override.nativeFiles ?? defaults.nativeFiles ?? false
    return {
        nativeFiles,
        attachmentTransport: nativeFiles
            ? (override.attachmentTransport ?? defaults.attachmentTransport ?? 'remote_file_id')
            : 'none',
        supportedMimeTypes: nativeFiles
            ? (override.supportedMimeTypes?.length
                ? override.supportedMimeTypes
                : (defaults.supportedMimeTypes?.length ? defaults.supportedMimeTypes : []))
            : [],
        maxFileSizeMB: nativeFiles
            ? (override.maxFileSizeMB ?? DEFAULT_ATTACHMENT_LIMITS.maxFileSizeMB)
            : undefined,
        maxFilesPerTurn: nativeFiles
            ? (override.maxFilesPerTurn ?? DEFAULT_ATTACHMENT_LIMITS.maxFilesPerTurn)
            : undefined,
    }
}

function groupByProvider(models: LLMModelConfig[]): Map<string, LLMModelConfig[]> {
    const map = new Map<string, LLMModelConfig[]>()
    for (const model of models) {
        const key = model.provider
        const list = map.get(key) ?? []
        list.push(model)
        map.set(key, list)
    }
    return map
}

function loadModelsFromJson(): LLMModelConfig[] {
    const filePath = path.resolve(process.cwd(), 'electron/config/models.json')
    const raw = JSON.parse(fs.readFileSync(filePath, 'utf-8')) as RawModel[]
    const out: LLMModelConfig[] = []
    for (const item of raw) {
        if (!item || typeof item.id !== 'string' || item.id.trim().length === 0) continue
        const provider = typeof item.provider === 'string' ? item.provider : 'gemini'
        const providerCaps = resolveProviderCaps(provider)
        const capabilities = {
            ...DEFAULT_CAPABILITIES,
            ...providerCaps,
            ...(item.capabilities ?? {}),
        }
        out.push({
            id: item.id,
            label: item.name ?? item.id,
            name: item.name ?? item.id,
            provider,
            kind: 'chat',
            capabilities,
            defaults: {},
            params: {},
            requirements: {},
        } satisfies LLMModelConfig)
    }
    return out
}

function createSyntheticModel(providerId: string): LLMModelConfig {
    const caps = {
        ...DEFAULT_CAPABILITIES,
        ...resolveProviderCaps(providerId),
    }
    return {
        id: `${providerId}:synthetic`,
        label: `${providerId}:synthetic`,
        name: `${providerId}:synthetic`,
        provider: providerId,
        kind: 'chat',
        capabilities: caps,
        defaults: {},
        params: {},
        requirements: {},
    }
}

function toRepresentativeModel(models: LLMModelConfig[]): LLMModelConfig {
    const sorted = [...models].sort((a, b) => a.id.localeCompare(b.id))
    return sorted[0]
}

function buildSampleHistory(): UIMessage[] {
    const filePart: MessageContentPart = {
        type: 'file',
        assetId: 'asset_smoke_pdf',
        providerFileId: 'file_smoke_001',
        storageKey: 'sha256_smoke_001.pdf',
        name: 'smoke.pdf',
        mimeType: 'application/pdf',
        size: 625,
        status: 'ready',
        data: new Uint8Array([1, 2, 3, 4, 5]),
    }
    return [{
        id: 'msg_smoke_user',
        conversation_id: 'conv_smoke',
        role: 'user',
        type: 'text',
        content: 'Read the file.',
        contentParts: [
            { type: 'text', text: 'Read the file.' },
            filePart,
        ],
        timestamp: Date.now(),
    }]
}

function buildInlineImageHistory(): UIMessage[] {
    const imagePart: MessageContentPart = {
        type: 'image',
        assetId: 'asset_smoke_png',
        name: 'smoke.png',
        mimeType: 'image/png',
        size: 128,
        status: 'ready',
        data: new Uint8Array([137, 80, 78, 71, 1, 2, 3, 4]),
    }
    return [{
        id: 'msg_smoke_inline_user',
        conversation_id: 'conv_smoke_inline',
        role: 'user',
        type: 'text',
        content: 'Describe this image.',
        contentParts: [
            { type: 'text', text: 'Describe this image.' },
            imagePart,
        ],
        timestamp: Date.now(),
    }]
}

function routeWithFiles(model: LLMModelConfig): string {
    const caps = model.capabilities ?? {}
    const native = caps.nativeFiles === true
    const transport = caps.attachmentTransport ?? (native ? 'remote_file_id' : 'none')
    if (native && transport === 'remote_file_id') {
        return 'responses(reason=native_files_available)'
    }
    if (native && transport === 'inline_base64') {
        const onlyImage = (caps.supportedMimeTypes ?? []).every((mime) => mime === 'image/*' || mime.startsWith('image/'))
        if (onlyImage) return 'chat_completions(reason=native_files_available)'
        return 'reject(reason=transport_not_implemented)'
    }
    return 'reject(reason=model_does_not_support_files)'
}

function routeNoFiles(model: LLMModelConfig): string {
    if (model.provider === 'openai' || model.provider === 'openrouter' || model.provider === 'deepseek' || model.provider === 'lmstudio') {
        return 'chat_completions(reason=no_file_parts)'
    }
    if (model.provider === 'gemini') return 'gemini_sdk_chat(reason=no_file_parts)'
    if (model.provider === 'anthropic') return 'anthropic_messages(reason=no_file_parts)'
    if (model.provider === 'ollama') return 'ollama_chat(reason=no_file_parts)'
    return 'provider_default(reason=no_file_parts)'
}

function runProviderSmoke(model: LLMModelConfig): ProviderSmoke {
    const transport = model.capabilities?.attachmentTransport ?? 'none'
    const history = transport === 'inline_base64'
        ? buildInlineImageHistory()
        : buildSampleHistory()
    const attachments = extractFileAttachmentsFromHistory(history)
    const notes: string[] = []

    try {
        validateAttachmentsByModelCapabilities({
            model,
            attachments,
            origin: 'history',
            selectedModelId: model.id,
            selectedProviderId: model.provider,
        })
        notes.push('validateAttachmentsByModelCapabilities=pass')
    } catch (error) {
        if (error instanceof AttachmentCapabilityError) {
            assert.equal(error.code, 'ModelDoesNotSupportFiles')
            notes.push(`validateAttachmentsByModelCapabilities=reject(${error.code})`)
            return {
                ok: true,
                payloadKind: 'none',
                hasInlineBase64: false,
                droppedByReason: 'ModelDoesNotSupportFiles',
                notes,
            }
        }
        throw error
    }

    if (transport === 'remote_file_id') {
        const built = buildResponsesInput(history, [], undefined)
        const blocks = built.input.flatMap((item) => item.content)
        const inputFileCount = blocks.filter((part) => part.type === 'input_file').length
        const inlineBase64Detected = JSON.stringify(built.input).includes('inline_base64')
        assert.ok(inputFileCount > 0, 'expected input_file blocks for native file provider')
        assert.equal(inlineBase64Detected, false, 'inline_base64 should not appear in payload')
        notes.push(`responses.input_file.count=${inputFileCount}`)
        return {
            ok: true,
            payloadKind: 'input_file',
            hasInlineBase64: inlineBase64Detected,
            droppedByReason: null,
            notes,
        }
    }
    if (transport === 'inline_base64') {
        const messages = buildInlineBase64ChatMessages({
            history,
            attachments: [],
            inputText: undefined,
            supportedMimeTypes: model.capabilities?.supportedMimeTypes ?? [],
        })
        const imageBlocks = messages
            .flatMap((msg) => Array.isArray(msg.content) ? msg.content : [])
            .filter((part): part is { type: 'image_url'; image_url: { url: string } } =>
                Boolean(part)
                && typeof part === 'object'
                && (part as { type?: unknown }).type === 'image_url',
            )
        assert.ok(imageBlocks.length > 0, 'expected image_url inline blocks for inline_base64 transport')
        assert.ok(imageBlocks.every((part) => part.image_url.url.startsWith('data:image/')), 'expected data:image/* base64 URL')
        notes.push(`chat_completions.inline_image.count=${imageBlocks.length}`)
        return {
            ok: true,
            payloadKind: 'inline_image_base64',
            hasInlineBase64: true,
            droppedByReason: null,
            notes,
        }
    }
    notes.push(`transport_not_implemented(${transport})`)
    return {
        ok: false,
        payloadKind: 'none',
        hasInlineBase64: false,
        droppedByReason: 'transport_not_implemented',
        notes,
    }
}

function evaluateStatus(row: Omit<ProviderRow, 'status' | 'reason' | 'nextStep'>): Pick<ProviderRow, 'status' | 'reason' | 'nextStep'> {
    if (row.supportsNativeFiles && row.attachmentTransport === 'remote_file_id' && row.smoke.payloadKind === 'input_file') {
        return {
            status: 'done',
            reason: 'native file_id payload works in dry-run smoke',
            nextStep: 'Add one integration smoke with mocked provider 404->auto-reupload to harden resilience.',
        }
    }
    if (row.supportsNativeFiles && row.attachmentTransport === 'inline_base64' && row.smoke.payloadKind === 'inline_image_base64') {
        return {
            status: 'partial',
            reason: 'inline_base64(image/*) payload works in dry-run smoke',
            nextStep: 'Expand inline support for non-image MIMEs or add remote_file_id transport.',
        }
    }
    if (!row.supportsNativeFiles) {
        return {
            status: 'unsupported',
            reason: row.smoke.droppedByReason
                ? `attachments are explicitly rejected (${row.smoke.droppedByReason})`
                : 'attachments are not supported',
            nextStep: 'Enable nativeFiles + provider file API path, or keep explicit reject UX.',
        }
    }
    return {
        status: 'partial',
        reason: 'capabilities exist but smoke did not produce input_file payload',
        nextStep: 'Align transport with remote_file_id and ensure provider payload uses input_file.',
    }
}

function fmtStatus(status: ProviderStatus): string {
    if (status === 'done') return '✅ Supported'
    if (status === 'partial') return '⚠️ Partial'
    return '❌ Unsupported'
}

function toMarkdown(rows: ProviderRow[]): string {
    const lines: string[] = []
    lines.push('# Provider Attachment Compatibility Report')
    lines.push('')
    lines.push(`Generated at: ${new Date().toISOString()}`)
    lines.push('')
    lines.push('## Provider Matrix')
    lines.push('')
    lines.push('| Provider | Models | supportsNativeFiles | attachmentTransport | supportedMimeTypes | maxFilesPerTurn | maxFileSizeMB | send route (with files) | send route (no files) | rewrite route (with files) | rewrite route (no files) | Smoke |')
    lines.push('| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |')
    for (const row of rows) {
        const smokeLabel = row.smoke.payloadKind === 'input_file'
            ? 'payload=input_file, inline_base64=false'
            : row.smoke.payloadKind === 'inline_image_base64'
                ? 'payload=image_url(data:image/*;base64,...)'
                : `reject=${row.smoke.droppedByReason ?? 'unknown'}`
        lines.push(`| ${row.providerId} | ${row.modelIds.join(', ')} | ${String(row.supportsNativeFiles)} | ${row.attachmentTransport} | ${row.supportedMimeTypes.length > 0 ? row.supportedMimeTypes.join('<br/>') : '(none)'} | ${row.maxFilesPerTurn ?? '-'} | ${row.maxFileSizeMB ?? '-'} | ${row.sendRouteWithFiles} | ${row.sendRouteNoFiles} | ${row.rewriteRouteWithFiles} | ${row.rewriteRouteNoFiles} | ${smokeLabel} |`)
    }
    lines.push('')
    lines.push('## Support Summary')
    lines.push('')
    lines.push('| Provider | Status | Reason | Next Step |')
    lines.push('| --- | --- | --- | --- |')
    for (const row of rows) {
        lines.push(`| ${row.providerId} | ${fmtStatus(row.status)} | ${row.reason} | ${row.nextStep} |`)
    }
    lines.push('')
    lines.push('## Smoke Details')
    lines.push('')
    for (const row of rows) {
        lines.push(`- ${row.providerId}: ${row.smoke.notes.join('; ')}`)
    }
    lines.push('')
    lines.push('## Notes')
    lines.push('')
    lines.push('- send and rewrite use the same StreamManager provider pipeline, so the route result is identical.')
    lines.push('- This smoke report is dry-run only and does not trigger external network requests.')
    lines.push('- The smoke covers both remote_file_id and inline_base64(image/*) transport modes.')
    return `${lines.join('\n')}\n`
}

function buildRows(): ProviderRow[] {
    const models = loadModelsFromJson()
    const groups = groupByProvider(models)
    const rows: ProviderRow[] = []
    const providerIds = Array.from(new Set<string>([
        ...Array.from(groups.keys()),
        ...KNOWN_PROVIDERS,
    ])).sort((a, b) => a.localeCompare(b))
    for (const providerId of providerIds) {
        const providerModels = groups.get(providerId) ?? []
        const model = providerModels.length > 0 ? toRepresentativeModel(providerModels) : createSyntheticModel(providerId)
        const caps = model.capabilities ?? {}
        const rowBase = {
            providerId,
            modelIds: providerModels.length > 0
                ? providerModels.map((item) => item.id).sort((a, b) => a.localeCompare(b))
                : ['(dynamic/no-static-model)'],
            supportsNativeFiles: caps.nativeFiles === true,
            attachmentTransport: caps.attachmentTransport ?? (caps.nativeFiles === true ? 'remote_file_id' : 'none'),
            supportedMimeTypes: caps.supportedMimeTypes ?? [],
            maxFilesPerTurn: Number.isFinite(caps.maxFilesPerTurn) ? Number(caps.maxFilesPerTurn) : null,
            maxFileSizeMB: Number.isFinite(caps.maxFileSizeMB) ? Number(caps.maxFileSizeMB) : null,
            sendRouteWithFiles: routeWithFiles(model),
            sendRouteNoFiles: routeNoFiles(model),
            rewriteRouteWithFiles: routeWithFiles(model),
            rewriteRouteNoFiles: routeNoFiles(model),
            smoke: runProviderSmoke(model),
        }
        const status = evaluateStatus(rowBase)
        rows.push({
            ...rowBase,
            ...status,
        })
    }
    return rows
}

function main(): void {
    const rows = buildRows()
    const markdown = toMarkdown(rows)
    const target = path.resolve(process.cwd(), 'docs/audits/provider_attachment_compatibility_report.md')
    fs.mkdirSync(path.dirname(target), { recursive: true })
    fs.writeFileSync(target, markdown, 'utf-8')
    process.stdout.write(markdown)
}

main()
