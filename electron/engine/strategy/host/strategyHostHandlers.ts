import type { Attachment, LLMMessage, MessageContentPart, UIMessage } from '../../../../contracts/index'
import { WorkerManager, type HostHandlers } from '../../../workers/strategy/WorkerManager'
import { getDB } from '../../../db'
import { getMainlineHistory } from '../../../core/history/getMainlineHistory'
import { deleteStrategyState, getStrategyState, hasStrategyState, setStrategyState } from '../../../core/strategy/stateStore'
import { resolveModelConfig } from '../../../core/models/modelRegistry'
import { callLLMUniversalNonStream } from '../../../llm'
import { LLMRunner, type LLMStreamResult } from '../../llm/llmRunner'
import { createToolRegistry } from '../../../core/tools'
import { createMemoryBridge } from './memoryBridge'
import { buildRunResult, normalizeArgs, resolveToolDefs, toUiMessages } from './tooling'
import { emitStrategyDevEvent } from '../dev/devEventBus'
import { messageTextFromParts, parseMessageContentParts } from '../../../../shared/chat/contentParts'
import { estimateTokens } from '../../../core/tokens/tokenizer'

export function historyKey(conversationId: string, turnId?: string) {
    return `${conversationId}:${turnId ?? 'unknown'}`
}

export function excludeMessageById(messages: UIMessage[], messageId?: string | null): UIMessage[] {
    if (!messageId) return messages
    return messages.filter((message) => message.id !== messageId)
}

function isMessageFilePart(part: MessageContentPart): part is Extract<MessageContentPart, { type: 'file' | 'image' }> {
    return part.type === 'file' || part.type === 'image'
}

function toAttachmentModality(part: Extract<MessageContentPart, { type: 'file' | 'image' }>): Attachment['modality'] {
    if (part.type === 'image') return 'image'
    const mime = (part.mimeType || '').toLowerCase()
    if (mime.startsWith('audio/')) return 'audio'
    if (mime.startsWith('video/')) return 'video'
    return 'document'
}

export function buildStrategyHostHandlers(args: {
    historyCache: Map<string, UIMessage[]>
    llmRunner: LLMRunner
}): HostHandlers {
    return {
        getHistory: async ({ conversationId, turnId }) => {
            const cached = args.historyCache.get(historyKey(conversationId, turnId))
            if (turnId) {
                const db = getDB()
                const row = db.prepare(`
                    SELECT user_message_id, tseq
                    FROM turns
                    WHERE id = ? AND conversation_id = ?
                `).get(turnId, conversationId) as { user_message_id?: string; tseq?: number | null } | undefined

                if (cached) return excludeMessageById(cached, row?.user_message_id)

                if (row?.tseq != null) {
                    const history = getMainlineHistory(db, {
                        conversationId,
                        cutoffTseq: row.tseq,
                        includeCutoffTurn: true,
                    }) as UIMessage[]
                    return excludeMessageById(history, row.user_message_id)
                }

                const history = getMainlineHistory(db, { conversationId }) as UIMessage[]
                return excludeMessageById(history, row?.user_message_id)
            }

            if (cached) return cached
            const db = getDB()
            return getMainlineHistory(db, { conversationId }) as UIMessage[]
        },
        getTurnUserInput: async ({ conversationId, turnId }) => {
            const db = getDB()
            const row = db.prepare(`
                SELECT m.content AS content, m.content_parts AS content_parts
                FROM turns t
                JOIN messages m ON m.id = t.user_message_id
                WHERE t.id = ? AND t.conversation_id = ?
            `).get(turnId, conversationId) as { content?: string | null; content_parts?: string | null } | undefined
            if (row) {
                const parts = parseMessageContentParts(row.content_parts, row.content ?? '')
                const attachments: Attachment[] = parts
                    .filter(isMessageFilePart)
                    .map((part) => ({
                        id: part.assetId,
                        name: part.name,
                        size: part.size,
                        modality: toAttachmentModality(part),
                        mimeType: part.mimeType,
                    }))
                return {
                    text: messageTextFromParts(parts, row.content ?? ''),
                    attachments,
                }
            }
            const history = getMainlineHistory(db, { conversationId }) as UIMessage[]
            const lastUser = [...history].reverse().find((message) => message.role === 'user')
            return { text: typeof lastUser?.content === 'string' ? lastUser.content : '', attachments: [] }
        },
        measureTokens: async ({ text }) => {
            const content = typeof text === 'string' ? text : ''
            return estimateTokens(content)
        },
        executeTool: async ({ call, conversationId, turnId }) => {
            const name = call?.name
            if (typeof name !== 'string') {
                throw new Error('tool name missing')
            }
            const db = getDB()
            const registry = createToolRegistry(db)
            const result = await registry.executeToolCall(
                { conversationId, turnId },
                { id: call.id, name, args: call.args },
            )
            return result.resultText
        },
        ...createMemoryBridge(),
        stateGet: async ({ conversationId, strategyId, key }) => {
            const db = getDB()
            return getStrategyState(db, {
                strategyId,
                scopeType: 'conversation',
                scopeId: conversationId,
                key,
            })
        },
        stateSet: async ({ conversationId, strategyId, key, value }) => {
            const db = getDB()
            setStrategyState(db, {
                strategyId,
                scopeType: 'conversation',
                scopeId: conversationId,
                key,
                value,
            })
            return { ok: true }
        },
        stateDelete: async ({ conversationId, strategyId, key }) => {
            const db = getDB()
            deleteStrategyState(db, {
                strategyId,
                scopeType: 'conversation',
                scopeId: conversationId,
                key,
            })
            return { ok: true }
        },
        stateHas: async ({ conversationId, strategyId, key }) => {
            const db = getDB()
            return hasStrategyState(db, {
                strategyId,
                scopeType: 'conversation',
                scopeId: conversationId,
                key,
            })
        },
        llmCall: async ({ conversationId, model, messages, tools, toolChoice, temperature }) => {
            const resolved = resolveModelConfig({
                modelId: model.id,
                conversationId,
                runtimeOverrides: temperature == null ? undefined : { params: { temperature } },
            })
            const mappedTools = await resolveToolDefs(getDB(), conversationId, tools, toolChoice)
            const content = await callLLMUniversalNonStream(resolved, toUiMessages(conversationId, messages), mappedTools)
            return { role: 'assistant', content: content ?? '' } as LLMMessage
        },
        runLLMLoop: async ({ conversationId, turnId, model, messages, tools, toolChoice, maxRounds, temperature }) => {
            const mappedTools = await resolveToolDefs(getDB(), conversationId, tools, toolChoice)
            const callMessages = toUiMessages(conversationId, messages)
            const toolResults = new Map<string, {
                name: string
                args: Record<string, unknown>
                status: 'ok' | 'error' | 'aborted'
                resultText?: string
                errorMessage?: string
            }>()
            const streamResult = await args.llmRunner.stream(
                {
                    model: model.id,
                    messages: callMessages,
                    tools: mappedTools,
                    temperature: temperature ?? undefined,
                },
                () => {},
                {
                    maxRounds,
                    onToolCall: async (call) => {
                        const db = getDB()
                        const registry = createToolRegistry(db)
                        const allowed = mappedTools.map((tool) => tool.name)
                        if (!allowed.includes(call.name)) {
                            const msg = `Error: tool not allowed (${call.name})`
                            toolResults.set(call.id, {
                                name: call.name,
                                args: normalizeArgs(call.args),
                                status: 'error',
                                errorMessage: msg,
                            })
                            return msg
                        }
                        try {
                            const result = await registry.executeToolCall(
                                { conversationId, turnId },
                                { id: call.id, name: call.name, args: call.args },
                            )
                            toolResults.set(call.id, {
                                name: call.name,
                                args: normalizeArgs(call.args),
                                status: 'ok',
                                resultText: result.resultText,
                            })
                            return result.resultText
                        } catch (err) {
                            const msg = err instanceof Error ? err.message : String(err)
                            toolResults.set(call.id, {
                                name: call.name,
                                args: normalizeArgs(call.args),
                                status: 'error',
                                errorMessage: msg,
                            })
                            return `Error: ${msg}`
                        }
                    },
                },
            )
            return buildRunResult(messages, streamResult as LLMStreamResult, toolResults)
        },
        onDevEvent: (event) => {
            emitStrategyDevEvent(event)
        },
    }
}

export function createStrategyWorkerManager(args: {
    historyCache: Map<string, UIMessage[]>
    llmRunner: LLMRunner
}): WorkerManager {
    return new WorkerManager(buildStrategyHostHandlers(args))
}
