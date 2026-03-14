import type { Database } from 'better-sqlite3'
import type { Attachment, LLMMessage, MessageContentPart, RuntimeMessage, ToolCall, ToolChoice, ToolDef, ToolDefinition, UIMessage, RunResult } from '../../../../contracts/index'
import { createToolRegistry } from '../../../core/tools'
import type { LLMStreamResult } from '../../llm/llmRunner'
import { parseMessageContentParts } from '../../../../shared/chat/contentParts'

export function normalizeArgs(args: unknown): Record<string, unknown> {
    if (!args) return {}
    if (typeof args === 'string') {
        try {
            const parsed = JSON.parse(args)
            return parsed && typeof parsed === 'object' ? (parsed as Record<string, unknown>) : {}
        } catch {
            return {}
        }
    }
    if (typeof args === 'object') return args as Record<string, unknown>
    return {}
}

export function normalizeToolCalls(calls: unknown): Array<{ id: string; name: string; args?: unknown }> {
    if (!Array.isArray(calls)) return []
    const out: Array<{ id: string; name: string; args?: unknown }> = []
    for (const entry of calls) {
        if (!entry || typeof entry !== 'object') continue
        const obj = entry as Record<string, unknown>
        const id = typeof obj.id === 'string' ? obj.id : `call_${out.length + 1}`
        const name = typeof obj.name === 'string'
            ? obj.name
            : typeof obj.function === 'object' && obj.function && typeof (obj.function as { name?: unknown }).name === 'string'
                ? (obj.function as { name: string }).name
                : ''
        if (!name) continue
        const args = obj.args ?? (obj as { arguments?: unknown }).arguments
            ?? (obj.function as { arguments?: unknown } | undefined)?.arguments
        out.push({ id, name, args })
    }
    return out
}

function attachmentHintText(attachment: Attachment): string {
    return `File: ${attachment.name}`
}

function toAttachmentPart(attachment: Attachment): MessageContentPart {
    return {
        type: attachment.modality === 'image' ? 'image' : 'file',
        assetId: attachment.id,
        name: attachment.name,
        mimeType: attachment.mimeType ?? 'application/octet-stream',
        size: attachment.size,
    }
}

function buildPartsFromAttachments(message: RuntimeMessage): MessageContentPart[] {
    const attachments = Array.isArray(message.attachments) ? message.attachments : []
    if (attachments.length === 0) return []
    const parts: MessageContentPart[] = []
    if (typeof message.content === 'string' && message.content.trim().length > 0) {
        parts.push({ type: 'text', text: message.content })
    }
    for (const attachment of attachments) {
        parts.push({ type: 'text', text: attachmentHintText(attachment) })
        parts.push(toAttachmentPart(attachment))
    }
    return parts
}

export function toUiMessages(conversationId: string, messages: RuntimeMessage[]): UIMessage[] {
    return messages.map((msg, idx) => {
        const toolCalls = normalizeToolCalls((msg as { tool_calls?: unknown }).tool_calls)
        const content = msg.content ?? ''
        const parsedParts = parseMessageContentParts((msg as RuntimeMessage & { contentParts?: unknown }).contentParts, content)
        const parts = parsedParts.length > 0 ? parsedParts : buildPartsFromAttachments(msg)
        return {
            id: msg.id ?? `ctx_${idx + 1}`,
            conversation_id: msg.conversation_id ?? conversationId,
            role: msg.role,
            type: 'text',
            model: msg.model ?? null,
            parent_id: msg.parent_id,
            content,
            ...(parts.length > 0 ? { contentParts: parts } : {}),
            timestamp: msg.timestamp ?? Date.now(),
            ...(toolCalls.length ? { tool_calls: toolCalls } : {}),
            ...(msg.tool_call_id ? { tool_call_id: msg.tool_call_id } : {}),
        } as UIMessage
    })
}

export async function resolveToolDefs(
    db: Database,
    conversationId: string,
    tools?: ToolDefinition[],
    toolChoice?: ToolChoice,
): Promise<ToolDef[]> {
    if (!tools || tools.length === 0) return []
    if (toolChoice === 'none') return []
    const registry = createToolRegistry(db)
    const available = await registry.listTools({ conversationId })
    const byName = new Map(available.map((tool) => [tool.name, tool]))
    const requestedNames = tools
        .map((tool) => tool.function?.name)
        .filter((name): name is string => typeof name === 'string' && name.length > 0)
    const filteredNames = typeof toolChoice === 'object'
        ? requestedNames.filter((name) => name === toolChoice.function.name)
        : requestedNames
    const uniqueNames = Array.from(new Set(filteredNames))
    return uniqueNames.map((name) => byName.get(name)).filter(Boolean) as ToolDef[]
}

export function toBlueprintToolCall(call: { id: string; name: string; args?: unknown }): ToolCall {
    const args = typeof call.args === 'string' ? call.args : JSON.stringify(call.args ?? {})
    return {
        id: call.id,
        type: 'function',
        function: {
            name: call.name,
            arguments: args,
        },
    }
}

export function buildRunResult(
    inputMessages: LLMMessage[],
    streamResult: LLMStreamResult,
    toolResults: Map<string, { name: string; args: Record<string, unknown>; status: 'ok' | 'error' | 'aborted'; resultText?: string; errorMessage?: string }>,
): RunResult {
    const messages: LLMMessage[] = [...inputMessages]
    const toolCallHistory = streamResult.toolCallHistory ?? []
    for (const round of toolCallHistory) {
        const toolCalls = round.map(call => toBlueprintToolCall(call))
        if (toolCalls.length) {
            messages.push({ role: 'assistant', content: '', tool_calls: toolCalls })
            for (const call of round) {
                const result = toolResults.get(call.id)
                const toolContent = result?.resultText ?? (result?.errorMessage ? `Error: ${result.errorMessage}` : '')
                messages.push({ role: 'tool', content: toolContent ?? '', tool_call_id: call.id })
            }
        }
    }

    if (streamResult.content) {
        messages.push({ role: 'assistant', content: streamResult.content })
    }

    const toolCalls = Array.from(toolResults.entries()).map(([id, result]) => ({
        id,
        name: result.name,
        args: result.args,
        status: result.status,
        resultText: result.resultText,
        errorMessage: result.errorMessage,
    }))

    return {
        content: streamResult.content ?? '',
        finishReason: streamResult.finishReason === 'unknown' ? 'stop' : streamResult.finishReason,
        messages,
        toolCalls: toolCalls.length ? toolCalls : undefined,
        usage: streamResult.usage
            ? {
                inputTokens: streamResult.usage.prompt,
                outputTokens: streamResult.usage.completion,
                totalTokens: streamResult.usage.total,
            }
            : undefined,
        error: streamResult.error ? { code: streamResult.error.code, message: streamResult.error.message } : undefined,
    }
}
