import { v4 as uuidv4 } from 'uuid'
import { getDB } from '../../../db'
import { getAvailableModel, getEffectiveModel } from '../../../core/models/modelRegistry'
import { getProviderCtxSource } from '../../../llm'
import { executeTurn } from '../../../strategies/executeTurn'
import { TurnWriter } from '../../../core/turnWriter'
import { getMainlineHistory } from '../../../core/history/getMainlineHistory'
import { getConversationSnapshot } from '../../../core/conversation/getConversationSnapshot'
import { getReplayBusy } from '../../../core/strategy/replayManager'
import {
    materializeAttachmentParts,
    prepareAttachmentsForSend,
} from '../../attachments/attachmentPreparationService'
import {
    AttachmentCapabilityError,
    summarizeAttachmentError,
    validateAttachmentsBeforeSend,
} from '../../../core/attachments/validateAttachmentsBeforeSend'
import { log } from '../../../core/logging/runtimeLogger'

import type {
    Conversation,
    MessageContentPart,
    SendMessagePayload,
    StartGenResponse,
    StreamTimingTrace,
    UIMessage,
} from '../types'
import type { LLMModelConfig } from '../../llm/types'
import type { TurnAttachment } from '../../attachments/types'

function buildTextPart(text: string): MessageContentPart[] {
    if (!text.trim()) return []
    return [{ type: 'text', text }]
}

export async function executeSendMessage(args: {
    message: SendMessagePayload
    webContentsId?: number
}): Promise<StartGenResponse> {
    const db = getDB()
    const msg = args.message
    const now = Date.now()
    const trace: StreamTimingTrace = { t0: now }
    const traceId = typeof msg.traceId === 'string' && msg.traceId.trim().length > 0 ? msg.traceId.trim() : uuidv4()
    const replayBusy = getReplayBusy(msg.conversation_id)
    if (replayBusy) {
        throw new Error(`conversation replay in progress: ${replayBusy.sessionId}`)
    }

    let replyId = msg.reply_id || uuidv4()
    log('info', '[SEND]', {
        phase: 'ENTER',
        traceId,
        conversationId: msg.conversation_id,
        replyId,
        hasText: Boolean(msg.content?.trim()),
        attachmentCount: Array.isArray(msg.attachments) ? msg.attachments.length : 0,
    })

    const conversation = db.prepare(`SELECT * FROM conversations WHERE id = ?`)
        .get(msg.conversation_id) as Conversation | undefined
    if (!conversation) throw new Error('conversation not found')

    const dbModelId = conversation.model ?? null
    const uiSelectedModelId = msg.ui_selected_model_id ?? 'unknown'
    const model = getAvailableModel(dbModelId)
    if (!model) {
        const detail = dbModelId ? getEffectiveModel(dbModelId) : undefined
        log('warn', '[SEND]', {
            phase: 'MODEL_UNAVAILABLE',
            traceId,
            conversationId: msg.conversation_id,
            replyId,
            modelId: dbModelId,
            status: detail?.status,
        })
        throw new Error('MODEL_NOT_SELECTED')
    }
    if (!dbModelId || dbModelId !== model.id) {
        db.prepare(`UPDATE conversations SET model = ? WHERE id = ?`)
            .run(model.id, conversation.id)
        conversation.model = model.id
    }
    log('info', '[SEND]', {
        phase: 'MODEL_SELECTED',
        traceId,
        conversationId: msg.conversation_id,
        replyId,
        modelId: model.id,
        provider: model.provider,
    })

    const turnWriter = new TurnWriter(db)
    const started = turnWriter.startTurn({
        conversationId: msg.conversation_id,
        userMessageId: msg.id,
        userContent: msg.content,
        userContentParts: buildTextPart(msg.content ?? ''),
        model: model.id,
        assistantMessageId: replyId,
        timestampMs: now,
    })
    const turnId = started.turnId
    replyId = started.assistantMessageId
    const turnAttachments = Array.isArray(msg.attachments) ? msg.attachments as TurnAttachment[] : []
    for (const attachment of turnAttachments) {
        const tracedAttachment = attachment as TurnAttachment & { traceId?: string }
        tracedAttachment.traceId = traceId
    }
    const selectedModelId = msg.ui_selected_model_id ?? 'not resolved'
    const selectedProviderId = model.provider ?? 'not resolved'

    try {
        const preparedAttachments = prepareAttachmentsForSend({
            db,
            conversationId: msg.conversation_id,
            messageId: started.userMessageId,
            attachments: turnAttachments,
            modelId: model.id,
            provider: model.provider,
            selectedModelId,
            selectedProviderId,
        })
        validateAttachmentsBeforeSend({
            model: model as LLMModelConfig,
            attachments: preparedAttachments,
            origin: 'turn',
            selectedModelId,
            selectedProviderId,
        })
        const userParts: MessageContentPart[] = [
            ...buildTextPart(msg.content ?? ''),
            ...(await materializeAttachmentParts({
                db,
                conversationId: msg.conversation_id,
                userMessageId: started.userMessageId,
                attachments: preparedAttachments,
                modelId: model.id,
                provider: model.provider,
                selectedModelId,
                selectedProviderId,
            })),
        ]
        turnWriter.updateMessageContentParts({
            messageId: started.userMessageId,
            contentParts: userParts,
            timestampMs: Date.now(),
        })
        for (let i = 0; i < turnAttachments.length; i += 1) {
            turnAttachments[i] = preparedAttachments[i]
        }
    } catch (err) {
        if (err instanceof AttachmentCapabilityError) {
            if (process.env.DEBUG_ATTACHMENTS === '1' && err.code === 'AttachmentReadFailed') {
                const first = err.details.violations[0]
                const row = db.prepare(`
                    SELECT content_parts
                    FROM chat_items
                    WHERE id = ?
                    LIMIT 1
                `).get(started.userMessageId) as { content_parts?: string | null } | undefined
                let persistedContentParts: unknown = row?.content_parts ?? null
                if (typeof persistedContentParts === 'string') {
                    try {
                        persistedContentParts = JSON.parse(persistedContentParts)
                    } catch {
                        // keep raw string for diagnostics
                    }
                }
                log('debug', '[ATTACH][read_failed]', {
                    traceId,
                    conversationId: msg.conversation_id,
                    messageId: started.userMessageId,
                    branchName: first?.branchName ?? null,
                    reason: first?.reason ?? null,
                    contentParts: persistedContentParts,
                }, {
                    debugFlag: 'DEBUG_ATTACHMENTS',
                    stream: 'stderr',
                })
            }
            const summary = summarizeAttachmentError(err)
            turnWriter.finalizeTurn({
                turnId: started.turnId,
                assistantMessageId: replyId,
                status: 'error',
                finishReason: 'error',
                finalContent: summary,
                timestampMs: Date.now(),
                error: {
                    code: err.code,
                    message: summary,
                },
                contentParts: {
                    attachmentError: err.details,
                },
            })
            const snapshot = getConversationSnapshot(db, msg.conversation_id)
            return {
                placeholder: {
                    id: replyId,
                    conversation_id: msg.conversation_id,
                    role: 'assistant',
                    type: 'error',
                    content: summary,
                    timestamp: Date.now(),
                    model: model.id,
                    parent_id: started.userMessageId,
                    errorCode: err.code,
                    errorMessage: summary,
                    rawError: err.details,
                } as UIMessage,
                snapshot,
                meta: { turnId: started.turnId, conversationId: msg.conversation_id, started: false },
            }
        }
        throw err
    }

    const ctxSource = getProviderCtxSource(model.provider)
    log('info', '[SEND]', {
        phase: 'BEGIN_STREAM',
        traceId,
        conversationId: msg.conversation_id,
        turnId,
        replyId,
        uiSelectedModelId,
        dbModelId: dbModelId ?? null,
        modelId: model.id,
        provider: model.provider,
        ctxSource,
    })

    const history: UIMessage[] = getMainlineHistory(db, { conversationId: msg.conversation_id })

    log('info', '[SEND]', {
        phase: 'HISTORY_READY',
        traceId,
        conversationId: msg.conversation_id,
        turnId,
        replyId,
        historySize: history.length,
    })

    setImmediate(() => {
        executeTurn({
            conversationId: msg.conversation_id,
            replyId,
            model: model as LLMModelConfig,
            history,
            userMessageId: started.userMessageId,
            webContentsId: args.webContentsId,
            forceWebSearch: msg.force_web_search === true,
            turnId,
            trace,
            traceId,
            attachments: turnAttachments,
            inputText: msg.content,
            mode: 'normal',
        }).catch((err) => log('error', '[SEND]', {
            phase: 'START_FLOW_FAILED',
            traceId,
            conversationId: msg.conversation_id,
            turnId,
            replyId,
            error: err instanceof Error ? err.message : String(err),
        }))
    })

    const snapshot = getConversationSnapshot(db, msg.conversation_id)

    return {
        placeholder: {
            id: replyId,
            conversation_id: msg.conversation_id,
            role: 'assistant',
            type: 'progress',
            content: '',
            timestamp: now,
            model: model.id,
            parent_id: started.userMessageId,
        } as UIMessage,
        snapshot,
        meta: { turnId: started.turnId, conversationId: msg.conversation_id, started: true },
    }
}
