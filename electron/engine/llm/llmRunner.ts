import type { UIMessage } from '../chat/types'
import type { LLMModelConfig, ResolvedModelConfig, ToolDef, TurnAttachment } from './types'
import { callLLMUniversal, callLLMUniversalNonStream } from '../../llm'
import { resolveModelConfig } from '../../core/models/modelRegistry'
import { log } from '../../core/logging/runtimeLogger'
import {
    appendAssistantToolCallsMessage,
    executeToolCalls,
    executeWebFetchCalls,
} from './llmToolLoop'

export type LLMFinishReason = 'stop' | 'length' | 'tool_calls' | 'error' | 'aborted' | 'unknown'

export type ToolCall = {
    id: string
    name: string
    args?: unknown
}

export interface LLMStreamInput {
    model: string
    messages: UIMessage[]
    conversationId?: string
    turnId?: string
    replyId?: string
    traceId?: string
    temperature?: number
    signal?: AbortSignal
    tools?: ToolDef[]
    attachments?: TurnAttachment[]
    inputText?: string
    searchMode?: 'off' | 'native' | 'tool'
}

export interface LLMStreamChunk {
    deltaText: string
}

export interface LLMStreamResult {
    content: string
    finishReason: LLMFinishReason
    usage?: { prompt?: number; completion?: number; total?: number }
    latencyMs?: number
    error?: { code?: string; message?: string }
    toolCalls?: ToolCall[]
    toolCallRounds?: number
    toolCallHistory?: ToolCall[][]
}

const WEB_SEARCH_MAX_FETCH = 3

export class LLMRunner {
    async stream(
        input: LLMStreamInput,
        onChunk: (c: LLMStreamChunk) => void,
        opts?: { onToolCall?: (call: ToolCall) => Promise<string>; maxRounds?: number; emitErrorChunk?: boolean }
    ): Promise<LLMStreamResult> {
        const startedAt = Date.now()
        let content = ''
        let finishReason: LLMFinishReason = 'unknown'
        let error: { code?: string; message?: string } | undefined
        const toolCallHistory: ToolCall[][] = []
        const maxRounds = opts?.maxRounds ?? 5
        const emitErrorChunk = opts?.emitErrorChunk !== false
        const TOOLS_DISABLED = false
        const toolDefs: ToolDef[] = TOOLS_DISABLED ? [] : (input.tools ?? [])
        const toolNames = toolDefs.map(tool => tool.name)
        if (process.env.DEBUG_TOOLS === '1') {
            log('debug', '[TOOLS][runner:init]', {
                traceId: input.traceId ?? null,
                conversationId: input.conversationId ?? null,
                turnId: input.turnId ?? null,
                replyId: input.replyId ?? null,
                model: input.model,
                toolCount: toolDefs.length,
                tools: toolNames,
            }, { debugFlag: 'DEBUG_TOOLS' })
        }

        try {
            const resolved = this.resolveModel(input)
            const modelConfig = resolved.model as LLMModelConfig
            if (resolved.availability.available === false) {
                throw new Error(`MODEL_UNAVAILABLE: ${resolved.availability.reasons.join(',')}`)
            }
            if (modelConfig.capabilities?.stream === false) {
                if (input.signal?.aborted) {
                    return { content: '', finishReason: 'aborted', latencyMs: Date.now() - startedAt }
                }
                const full = await callLLMUniversalNonStream(
                    resolved,
                    input.messages,
                    TOOLS_DISABLED ? undefined : toolDefs,
                    { nativeSearch: input.searchMode === 'native' },
                    input.attachments,
                    input.inputText,
                )
                if (input.signal?.aborted) {
                    return { content: '', finishReason: 'aborted', latencyMs: Date.now() - startedAt }
                }
                if (full) {
                    onChunk({ deltaText: full })
                }
                return {
                    content: full ?? '',
                    finishReason: 'stop',
                    latencyMs: Date.now() - startedAt,
                }
            }
            const messages: UIMessage[] = [...input.messages]

            for (let round = 0; round < maxRounds; round++) {
            if (input.signal?.aborted) {
                finishReason = 'aborted'
                break
            }

            if (round > 0) {
                if (process.env.DEBUG_TOOLS === '1') {
                    log('debug', '[TOOLS][round2]', {
                        traceId: input.traceId ?? null,
                        round: round + 1,
                        model: modelConfig.id,
                    }, { debugFlag: 'DEBUG_TOOLS' })
                }
            }

                const roundResult = await this.runRound({
                    modelConfig,
                    messages,
                    conversationId: input.conversationId,
                    turnId: input.turnId,
                    replyId: input.replyId,
                    traceId: input.traceId,
                    searchMode: input.searchMode,
                    signal: input.signal,
                    onChunk,
                    allowToolCalls: !TOOLS_DISABLED
                        && (modelConfig.capabilities?.tools !== false)
                        && toolDefs.length > 0
                        && !!opts?.onToolCall,
                    tools: TOOLS_DISABLED ? [] : toolDefs,
                    resolved,
                    attachments: round === 0 ? input.attachments : undefined,
                    inputText: round === 0 ? input.inputText : undefined,
                    emitErrorChunk,
                })

                if (roundResult.finishReason === 'aborted') {
                    finishReason = 'aborted'
                    break
                }
                if (roundResult.finishReason === 'error') {
                    finishReason = 'error'
                    content = roundResult.content
                    error = roundResult.error
                    break
                }

                if (roundResult.toolCalls && roundResult.toolCalls.length > 0 && opts?.onToolCall) {
                    const normalizedCalls = roundResult.toolCalls.map((call, idx) => ({
                        ...call,
                        id: call.id ?? `call_${idx + 1}`,
                    }))
                    toolCallHistory.push(normalizedCalls)
                    appendAssistantToolCallsMessage(messages, normalizedCalls)

                    const toolRound = await executeToolCalls({
                        messages,
                        calls: normalizedCalls,
                        signal: input.signal,
                        traceId: input.traceId,
                        onToolCall: opts.onToolCall,
                        selectWebFetchUrls: async (toolResultText) => this.selectWebFetchUrls({
                            resolved,
                            toolResultText,
                        }),
                    })
                    if (toolRound.finishReason === 'aborted') {
                        finishReason = 'aborted'
                    }

                    if (toolRound.fetchQueue.length > 0 && finishReason !== 'aborted') {
                        const fetchRound = await executeWebFetchCalls({
                            messages,
                            fetchQueue: toolRound.fetchQueue,
                            signal: input.signal,
                            traceId: input.traceId,
                            onToolCall: opts.onToolCall,
                        })
                        if (fetchRound.finishReason === 'aborted') {
                            finishReason = 'aborted'
                        }
                    }
                    if (process.env.DEBUG_TOOLS === '1') {
                        const tail = messages.slice(-4).map((m) => ({
                            role: m.role,
                            tool_call_id: (m as UIMessage & { tool_call_id?: string }).tool_call_id,
                            hasToolCalls: Array.isArray((m as UIMessage & { tool_calls?: unknown }).tool_calls),
                        }))
                        log('debug', '[TOOLS][round2][messages]', {
                            traceId: input.traceId ?? null,
                            tail,
                        }, { debugFlag: 'DEBUG_TOOLS' })
                    }
                    if (finishReason === 'aborted') break
                    continue
                }

                content = roundResult.content
                finishReason = 'stop'
                break
            }

            if (finishReason === 'unknown' && toolCallHistory.length > 0) {
                finishReason = 'tool_calls'
            } else if (finishReason === 'unknown') {
                finishReason = input.signal?.aborted ? 'aborted' : 'stop'
            }
        } catch (err) {
            const message = err instanceof Error ? err.message : String(err)
            if (input.signal?.aborted || /aborted/i.test(message)) {
                finishReason = 'aborted'
            } else {
                finishReason = 'error'
                const errorChunk = `[error] ${message}`
                if (emitErrorChunk) {
                    try {
                        onChunk({ deltaText: errorChunk })
                    } catch {
                        // swallow to keep error handling consistent
                    }
                    content += errorChunk
                }
            }
            error = this.parseError(message)
        }

        return {
            content,
            finishReason,
            usage: undefined,
            latencyMs: Date.now() - startedAt,
            error,
            toolCalls: toolCallHistory.length ? toolCallHistory[toolCallHistory.length - 1] : undefined,
            toolCallRounds: toolCallHistory.length,
            toolCallHistory: toolCallHistory.length ? toolCallHistory : undefined,
        }
    }

    private resolveModel(input: LLMStreamInput): ResolvedModelConfig {
        const runtimeOverrides = input.temperature == null
            ? undefined
            : { params: { temperature: input.temperature } }
        return resolveModelConfig({
            modelId: input.model,
            runtimeOverrides,
        })
    }

    private parseToolJson(toolResultText: string): { value: unknown | null; error?: string; raw?: string } {
        const lines = toolResultText.split('\n')
        let raw = lines[0]?.startsWith('__from_tool=')
            ? lines.slice(1).join('\n').trim()
            : toolResultText.trim()

        raw = raw.replace(/```(?:json)?/gi, '```')
        if (raw.includes('```')) {
            const parts = raw.split('```').map(p => p.trim()).filter(Boolean)
            raw = parts.length ? parts[0] : raw
        }

        const extracted = this.extractFirstJsonObject(raw)
        if (!extracted) return { value: null, error: 'no_json_object', raw }
        try {
            return { value: JSON.parse(extracted), raw }
        } catch (err) {
            const msg = err instanceof Error ? err.message : String(err)
            return { value: null, error: msg, raw }
        }
    }

    private extractFirstJsonObject(input: string): string | null {
        const start = input.indexOf('{')
        if (start === -1) return null
        let depth = 0
        for (let i = start; i < input.length; i++) {
            const ch = input[i]
            if (ch === '{') depth += 1
            if (ch === '}') depth -= 1
            if (depth === 0) return input.slice(start, i + 1)
        }
        return null
    }

    private async selectWebFetchUrls(args: {
        resolved: ResolvedModelConfig
        toolResultText: string
    }): Promise<Array<{ originalUrl: string; finalUrl: string }>> {
        const parsedTool = this.parseToolJson(args.toolResultText)
        const parsed = (parsedTool.value ?? null) as { results?: Array<{ url?: string; finalUrl?: string; title?: string; snippet?: string }> } | null
        if (!parsed || !Array.isArray(parsed.results)) {
            log('debug', '[TOOLS][webselect_parse_fail]', {
                reason: parsedTool.error ?? 'invalid_format',
                head: (parsedTool.raw ?? '').slice(0, 200),
            }, { debugFlag: 'DEBUG_TOOLS' })
        }
        const results = Array.isArray(parsed?.results) ? parsed!.results : []
        const pool = results
            .map((r) => ({
                originalUrl: typeof r.url === 'string' ? r.url : '',
                finalUrl: typeof r.finalUrl === 'string' ? r.finalUrl : (typeof r.url === 'string' ? r.url : ''),
                title: r.title ?? '',
                snippet: r.snippet ?? '',
            }))
            .filter((r) => r.originalUrl && r.finalUrl)
        if (pool.length === 0) return []

        log('debug', '[TOOLS][webselect_start]', {
            candidates: pool.length,
            maxFetch: WEB_SEARCH_MAX_FETCH,
        }, { debugFlag: 'DEBUG_TOOLS' })

        const list = pool
            .map((r, i) => `${i + 1}. ${r.title || '(untitled)'}\n${r.finalUrl}\n${r.snippet ?? ''}`.trim())
            .join('\n\n')

        const messages: UIMessage[] = [
            {
                id: `webselect_system_${Date.now()}`,
                conversation_id: '',
                role: 'system',
                type: 'text',
                content:
                    'You are selecting which search results to open. Return JSON only: {"urls":[...]} using URLs from the list. Do not add commentary.',
                timestamp: Date.now(),
            },
            {
                id: `webselect_user_${Date.now()}`,
                conversation_id: '',
                role: 'user',
                type: 'text',
                content:
                    `Select the most useful links to open from these search results:\n\n${list}\n\nReturn JSON only.`,
                timestamp: Date.now(),
            },
        ]

        let selection = ''
        const startedAt = Date.now()
        try {
            const resolved = {
                ...args.resolved,
                params: { ...args.resolved.params, temperature: 0 },
            }
            selection = (await callLLMUniversalNonStream(resolved, messages, undefined)) ?? ''
        } catch {
            selection = ''
        }
        log('debug', '[TOOLS][webselect_raw]', {
            preview: selection.slice(0, 400),
        }, { debugFlag: 'DEBUG_TOOLS' })
        const parsedSel = this.parseToolJson(selection)
        const payload = parsedSel.value as { urls?: unknown } | null
        if (!payload || !Array.isArray(payload.urls)) {
            log('debug', '[TOOLS][webselect_parse_fail]', {
                reason: parsedSel.error ?? 'invalid_json',
                head: (parsedSel.raw ?? selection).slice(0, 200),
            }, { debugFlag: 'DEBUG_TOOLS' })
        }
        const urls = Array.isArray(payload?.urls) ? payload!.urls.filter((u) => typeof u === 'string') as string[] : []
        const map = new Map<string, { originalUrl: string; finalUrl: string }>()
        for (const item of pool) {
            map.set(item.finalUrl, item)
            map.set(item.originalUrl, item)
        }
        const selected: Array<{ originalUrl: string; finalUrl: string }> = []
        for (const url of urls) {
            const hit = map.get(url)
            if (hit) selected.push(hit)
        }
        if (selected.length === 0) {
            log('debug', '[TOOLS][webselect_fallback_top1]', {
                reason: 'empty_or_invalid',
                ms: Date.now() - startedAt,
            }, { debugFlag: 'DEBUG_TOOLS' })
            return [pool[0]]
        }
        const unique = Array.from(new Map(selected.map((s) => [s.finalUrl, s])).values())
        log('debug', '[TOOLS][webselect_done]', {
            ms: Date.now() - startedAt,
            selectedUrls: unique.map((u) => u.finalUrl),
        }, { debugFlag: 'DEBUG_TOOLS' })
        return unique
    }

    private parseError(message: string): { code?: string; message?: string } {
        const match = /^([A-Z0-9_]+):\s*(.*)$/.exec(message)
        if (!match) return { message }
        return { code: match[1], message: match[2] || message }
    }

    private async runRound(args: {
        modelConfig: LLMModelConfig
        messages: UIMessage[]
        conversationId?: string
        turnId?: string
        replyId?: string
        traceId?: string
        searchMode?: LLMStreamInput['searchMode']
        signal?: AbortSignal
        onChunk: (c: LLMStreamChunk) => void
        allowToolCalls: boolean
        tools: ToolDef[]
        resolved: ResolvedModelConfig
        attachments?: TurnAttachment[]
        inputText?: string
        emitErrorChunk: boolean
    }): Promise<{
        content: string
        finishReason: LLMFinishReason
        toolCalls?: ToolCall[]
        error?: { code?: string; message?: string }
    }> {
        const {
            modelConfig,
            messages,
            searchMode,
            signal,
            onChunk,
            allowToolCalls,
            resolved,
            tools,
            attachments,
            inputText,
            emitErrorChunk,
        } = args
        let content = ''
        let toolCalls: ToolCall[] | undefined
        let error: { code?: string; message?: string } | undefined
        let streamingDecided = false
        let streamEnabled = false
        let buffered = ''
        const maxProbe = 8192

        try {
            if (process.env.DEBUG_TOOLS === '1') {
                log('debug', '[TOOLS][runner]', {
                    traceId: args.traceId ?? null,
                    model: modelConfig.id,
                    toolCount: tools.length,
                    tools: tools.map(tool => tool.name),
                }, { debugFlag: 'DEBUG_TOOLS' })
            }
            let callMessages = this.injectToolResultInstruction(messages, allowToolCalls)
            if (process.env.DEBUG_TOOLS === '1') {
                this.logToolMessageTail(callMessages, modelConfig.id)
            }
            callMessages = this.injectGeminiToolPrompt(modelConfig, callMessages, tools, allowToolCalls)
            const gen = callLLMUniversal(
                resolved,
                callMessages,
                tools,
                {
                    nativeSearch: searchMode === 'native',
                    abortSignal: signal,
                    conversationId: args.conversationId,
                    turnId: args.turnId,
                    replyId: args.replyId,
                    traceId: args.traceId,
                },
                attachments,
                inputText,
            )
            for await (const delta of gen) {
                if (signal?.aborted) throw new Error('Aborted')
                if (!delta) continue
                content += delta

                if (!streamingDecided) {
                    buffered += delta
                    const firstNonWs = buffered.search(/\S/)
                    if (firstNonWs >= 0) {
                        const ch = buffered[firstNonWs]
                        const jsonCandidate = ch === '{' || ch === '['
                        if (!jsonCandidate || !allowToolCalls) {
                            streamingDecided = true
                            streamEnabled = true
                            onChunk({ deltaText: buffered })
                            buffered = ''
                        } else if (buffered.length >= maxProbe) {
                            streamingDecided = true
                            streamEnabled = true
                            onChunk({ deltaText: buffered })
                            buffered = ''
                        } else if (allowToolCalls) {
                            const parsed = this.tryParseToolCalls(buffered)
                        if (parsed) {
                            toolCalls = parsed
                            if (process.env.DEBUG_TOOLS === '1') {
                                log('debug', '[TOOLS][parsed]', {
                                    traceId: args.traceId ?? null,
                                    count: parsed.length,
                                }, { debugFlag: 'DEBUG_TOOLS' })
                            }
                            streamingDecided = true
                            streamEnabled = false
                            break
                        }
                            const parsedNoTools = this.tryParseNonToolJson(buffered)
                            if (parsedNoTools) {
                                streamingDecided = true
                                streamEnabled = true
                                onChunk({ deltaText: buffered })
                                buffered = ''
                            }
                        }
                    }
                } else if (streamEnabled) {
                    onChunk({ deltaText: delta })
                }
            }
        } catch (err) {
            const message = err instanceof Error ? err.message : String(err)
            if (signal?.aborted || /aborted/i.test(message)) {
                return { content, finishReason: 'aborted' }
            }
            const errorChunk = `[error] ${message}`
            if (emitErrorChunk) {
                try {
                    onChunk({ deltaText: errorChunk })
                } catch {
                    // ignore
                }
                content += errorChunk
            }
            error = this.parseError(message)
            return { content, finishReason: 'error', error }
        }

        if (toolCalls && toolCalls.length > 0) {
            return { content, finishReason: 'tool_calls', toolCalls }
        }

        if (buffered) {
            if (!streamingDecided) {
                streamEnabled = true
            }
            if (streamEnabled) {
                onChunk({ deltaText: buffered })
            }
        }
        return { content, finishReason: signal?.aborted ? 'aborted' : 'stop' }
    }

    private tryParseToolCalls(buffer: string): ToolCall[] | null {
        const parsed = this.tryParseJsonPayload(buffer)
        if (!parsed) return null
        const calls = this.normalizeToolCalls(parsed)
        return calls.length ? calls : null
    }

    private tryParseNonToolJson(buffer: string): boolean {
        const parsed = this.tryParseJsonPayload(buffer)
        if (!parsed) return false
        const calls = this.normalizeToolCalls(parsed)
        return calls.length === 0
    }

    private tryParseJsonPayload(buffer: string): unknown | null {
        const trimmed = buffer.trim()
        const jsonText = this.extractJson(trimmed)
        if (!jsonText) return null
        try {
            return JSON.parse(jsonText)
        } catch {
            return null
        }
    }

    private extractJson(text: string): string | null {
        if (text.startsWith('```')) {
            const match = text.match(/```(?:json)?\s*([\s\S]*?)\s*```/i)
            if (match && match[1]) return match[1]
        }
        if (text.startsWith('{') || text.startsWith('[')) return text
        return null
    }

    private normalizeToolCalls(payload: unknown): ToolCall[] {
        if (!payload) return []
        if (Array.isArray(payload)) {
            return payload.map((call, idx) => this.normalizeToolCall(call, idx)).filter(Boolean) as ToolCall[]
        }
        const obj = payload as Record<string, unknown>
        if (Array.isArray(obj.tool_calls)) {
            return obj.tool_calls.map((call, idx) => this.normalizeToolCall(call, idx)).filter(Boolean) as ToolCall[]
        }
        if (obj.tool_call) {
            const call = this.normalizeToolCall(obj.tool_call, 0)
            return call ? [call] : []
        }
        return []
    }

    private normalizeToolCall(payload: unknown, idx: number): ToolCall | null {
        if (!payload || typeof payload !== 'object') return null
        const obj = payload as Record<string, unknown>
        const name = typeof obj.name === 'string'
            ? obj.name
            : typeof obj.function === 'object' && obj.function && typeof (obj.function as { name?: unknown }).name === 'string'
                ? (obj.function as { name: string }).name
                : undefined
        if (!name) return null
        const id = typeof obj.id === 'string' ? obj.id : `call_${idx + 1}`
        const args = obj.args ?? (obj as { arguments?: unknown }).arguments ?? (obj.function as { arguments?: unknown } | undefined)?.arguments
        return { id, name, args }
    }

    private injectToolResultInstruction(messages: UIMessage[], allowToolCalls: boolean): UIMessage[] {
        if (!allowToolCalls) return messages
        if (!messages.some((msg) => (msg as unknown as { role?: string }).role === 'tool')) return messages
        const marker = '[TOOL_RESULT_INSTRUCTION]'
        const already = messages.some(
            msg => msg.role === 'system' && typeof msg.content === 'string' && msg.content.includes(marker),
        )
        if (already) return messages
        const instruction: UIMessage = {
            id: `tool_instruction_${Date.now()}`,
            conversation_id: messages[0]?.conversation_id ?? '',
            role: 'system',
            type: 'text',
            content: [
                marker,
                'When tool results are present, you must use them to answer.',
                'If tool results are empty or errors, explicitly say the tool failed and suggest retry.',
            ].join('\n'),
            timestamp: Date.now(),
        }
        return [instruction, ...messages]
    }

    private injectGeminiToolPrompt(
        model: LLMModelConfig,
        messages: UIMessage[],
        tools: ToolDef[],
        allowToolCalls: boolean,
    ): UIMessage[] {
        if (!allowToolCalls || tools.length === 0) return messages
        if (model.provider !== 'gemini') return messages
        const toolNames = tools.map(tool => tool.name).join(', ')
        const systemPrompt = [
            'Tool use is available for this response.',
            'If you need a tool, respond ONLY with JSON:',
            '{"tool_calls":[{"name":"<tool_name>","arguments":{...}}]}',
            'Otherwise, respond normally.',
            `Available tools: ${toolNames}`,
        ].join('\n')
        const injected: UIMessage = {
            id: 'tool_prompt',
            conversation_id: messages[0]?.conversation_id ?? '',
            role: 'system',
            type: 'text',
            content: systemPrompt,
            timestamp: Date.now(),
        }
        return [injected, ...messages]
    }

    private logToolMessageTail(messages: UIMessage[], modelId: string): void {
        const tail = messages.slice(-6).map((msg) => {
            const contentLen = typeof msg.content === 'string' ? msg.content.length : 0
            const toolCalls = (msg as UIMessage & { tool_calls?: unknown }).tool_calls
            const toolList = Array.isArray(toolCalls) ? toolCalls : []
            const toolCallPreview = toolList.map((call) => {
                const obj = call as Record<string, unknown>
                const func = obj.function as { name?: unknown; arguments?: unknown } | undefined
                const args = func?.arguments ?? obj.arguments
                const nameFromObj = typeof obj.name === 'string' ? obj.name : undefined
                const funcName = typeof func?.name === 'string' ? func?.name : nameFromObj
                const type = typeof obj.type === 'string' ? obj.type : (funcName ? 'function' : undefined)
                const argsLen = typeof args === 'string' ? args.length : JSON.stringify(args ?? {}).length
                return {
                    id: typeof obj.id === 'string' ? obj.id : undefined,
                    type,
                    function: {
                        name: funcName,
                        argumentsLen: argsLen,
                    },
                }
            })
            return {
                role: msg.role,
                contentLen,
                hasToolCalls: toolList.length > 0,
                toolCallsLen: toolList.length,
                tool_call_id: (msg as UIMessage & { tool_call_id?: string }).tool_call_id,
                toolCalls: toolCallPreview.length ? toolCallPreview : undefined,
            }
        })
        log('debug', '[TOOLS][tail]', { model: modelId, tail }, { debugFlag: 'DEBUG_TOOLS' })
    }
}
