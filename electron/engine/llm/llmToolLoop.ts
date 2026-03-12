import { log } from '../../core/logging/runtimeLogger'

import type { ToolCall, LLMFinishReason } from './llmRunner'
import type { UIMessage } from '../../../contracts/index'

const WEB_SEARCH_MAX_FETCH = 3

export function appendAssistantToolCallsMessage(messages: UIMessage[], normalizedCalls: ToolCall[]): void {
    const toolMsg = {
        role: 'assistant',
        content: '',
        tool_calls: normalizedCalls,
    } as unknown as UIMessage
    messages.push(toolMsg)
}

export async function executeToolCalls(args: {
    messages: UIMessage[]
    calls: ToolCall[]
    signal?: AbortSignal
    traceId?: string
    onToolCall: (call: ToolCall) => Promise<string>
    selectWebFetchUrls: (toolResultText: string) => Promise<Array<{ originalUrl: string; finalUrl: string }>>
}): Promise<{
    finishReason?: Extract<LLMFinishReason, 'aborted'>
    fetchQueue: Array<{ originalUrl: string; finalUrl: string }>
}> {
    const fetchQueue: Array<{ originalUrl: string; finalUrl: string }> = []
    for (const [idx, call] of args.calls.entries()) {
        if (args.signal?.aborted) {
            return { finishReason: 'aborted', fetchQueue }
        }
        let resultText: unknown = ''
        try {
            resultText = await args.onToolCall(call)
        } catch (err) {
            const msg = err instanceof Error ? err.message : String(err)
            resultText = `Error: ${msg}`
        }
        const toolContent = typeof resultText === 'string'
            ? resultText
            : JSON.stringify(resultText ?? '')
        const toolCallId = call.id ?? `call_${idx + 1}`
        const toolResult = {
            role: 'tool',
            content: toolContent,
            tool_call_id: toolCallId,
        } as unknown as UIMessage
        args.messages.push(toolResult)
        if (process.env.DEBUG_TOOLS === '1') {
            log('debug', '[TOOLS][result]', {
                traceId: args.traceId ?? null,
                tool_call_id: toolCallId,
                length: toolContent.length,
                preview: toolContent.slice(0, 200),
            }, { debugFlag: 'DEBUG_TOOLS' })
        }

        if (call.name === 'builtin.web_search' && toolContent) {
            const selectedUrls = await args.selectWebFetchUrls(toolContent)
            if (selectedUrls.length > 0) {
                fetchQueue.push(...selectedUrls)
            }
        }
    }

    return { fetchQueue }
}

export async function executeWebFetchCalls(args: {
    messages: UIMessage[]
    fetchQueue: Array<{ originalUrl: string; finalUrl: string }>
    signal?: AbortSignal
    traceId?: string
    onToolCall: (call: ToolCall) => Promise<string>
}): Promise<{
    finishReason?: Extract<LLMFinishReason, 'aborted'>
}> {
    const cappedFetchUrls = args.fetchQueue.slice(0, WEB_SEARCH_MAX_FETCH)
    if (cappedFetchUrls.length === 0) return {}

    const fetchCalls = cappedFetchUrls.map((entry, fetchIdx) => ({
        id: `fetch_${fetchIdx + 1}`,
        name: 'builtin.web_fetch',
        args: { urls: [entry.originalUrl] },
    }))
    appendAssistantToolCallsMessage(args.messages, fetchCalls)

    for (const fetchCall of fetchCalls) {
        if (args.signal?.aborted) {
            return { finishReason: 'aborted' }
        }
        const originalUrl = (fetchCall.args as { urls?: string[] } | undefined)?.urls?.[0] ?? ''
        const finalUrl = cappedFetchUrls.find((entry) => entry.originalUrl === originalUrl)?.finalUrl ?? originalUrl
        if (process.env.DEBUG_TOOLS === '1') {
            log('debug', '[TOOLS][webfetch_schedule]', {
                traceId: args.traceId ?? null,
                url: originalUrl,
                finalUrl,
            }, { debugFlag: 'DEBUG_TOOLS' })
        }
        let fetchText: unknown = ''
        try {
            fetchText = await args.onToolCall(fetchCall)
        } catch (err) {
            const msg = err instanceof Error ? err.message : String(err)
            fetchText = `Error: ${msg}`
        }
        const fetchContent = typeof fetchText === 'string'
            ? fetchText
            : JSON.stringify(fetchText ?? '')
        const fetchResult = {
            role: 'tool',
            content: fetchContent,
            tool_call_id: fetchCall.id,
        } as unknown as UIMessage
        args.messages.push(fetchResult)
        if (process.env.DEBUG_TOOLS === '1') {
            log('debug', '[TOOLS][result]', {
                traceId: args.traceId ?? null,
                tool_call_id: fetchCall.id,
                length: fetchContent.length,
                preview: fetchContent.slice(0, 200),
            }, { debugFlag: 'DEBUG_TOOLS' })
        }
    }

    return {}
}
