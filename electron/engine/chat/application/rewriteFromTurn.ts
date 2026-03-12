import { v4 as uuidv4 } from 'uuid'
import { getDB } from '../../../db'
import { getAvailableModel, getEffectiveModel } from '../../../core/models/modelRegistry'
import { TurnWriter } from '../../../core/turnWriter'
import { getMainlineHistory } from '../../../core/history/getMainlineHistory'
import { executeTurn } from '../../../strategies/executeTurn'
import { getReplayBusy } from '../../../core/strategy/replayManager'
import {
    materializeAttachmentParts,
    prepareAttachmentsForSend,
} from '../../attachments/attachmentPreparationService'
import { validateAttachmentsBeforeSend } from '../../../core/attachments/validateAttachmentsBeforeSend'
import { hydrateMessagePartsWithAssetData } from '../../../core/attachments/hydrateMessageParts'
import { log } from '../../../core/logging/runtimeLogger'
import {
    messageTextFromParts,
    parseMessageContentParts,
    serializeMessageContentParts,
} from '../../../../shared/chat/contentParts'

import type {
    MessageContentPart,
    StartGenResponse,
    StreamTimingTrace,
    UIMessage,
} from '../types'
import type { LLMModelConfig } from '../../llm/types'
import type { TurnAttachment } from '../../attachments/types'

function summarizeHistoryFileParts(history: UIMessage[]): {
    historyCount: number
    filePartCountTotal: number
    assetIds: string[]
} {
    const assetIds: string[] = []
    let filePartCountTotal = 0
    for (const message of history) {
        const parts = parseMessageContentParts(message.contentParts, message.content)
        for (const part of parts) {
            if (part.type !== 'file' && part.type !== 'image') continue
            filePartCountTotal += 1
            if (typeof part.assetId === 'string' && part.assetId.trim().length > 0) {
                assetIds.push(part.assetId)
            }
        }
    }
    return {
        historyCount: history.length,
        filePartCountTotal,
        assetIds: Array.from(new Set(assetIds)),
    }
}

function toTurnAttachmentKind(mimeType?: string): TurnAttachment['kind'] {
    const mime = typeof mimeType === 'string' ? mimeType.toLowerCase() : ''
    if (mime.startsWith('image/')) return 'image'
    if (mime.startsWith('audio/')) return 'audio'
    if (mime.startsWith('video/')) return 'video'
    return 'document'
}

export async function executeRewriteFromTurn(args: {
    turnId: string
    newUserText: string
    attachments?: TurnAttachment[]
    traceId?: string
    webContentsId?: number
}): Promise<StartGenResponse> {
    const db = getDB()
    const now = Date.now()
    const resolvedTraceId = typeof args.traceId === 'string' && args.traceId.trim().length > 0
        ? args.traceId.trim()
        : uuidv4()
    const trace: StreamTimingTrace = { t0: now }
    const turnWriter = new TurnWriter(db)
    log('info', '[REWRITE]', {
        phase: 'ENTER',
        traceId: resolvedTraceId,
        turnId: args.turnId,
        textLength: args.newUserText?.length ?? 0,
        at: now,
        attachmentCount: Array.isArray(args.attachments) ? args.attachments.length : 0,
    })

    const rewriteText = typeof args.newUserText === 'string' ? args.newUserText : ''
    const rewriteAttachments = Array.isArray(args.attachments) ? args.attachments as TurnAttachment[] : []

    const row = db.prepare(`
      SELECT t.id, t.conversation_id, t.user_message_id, t.tseq
      FROM turns t WHERE t.id = ?
    `).get(args.turnId) as {
        id: string
        conversation_id: string
        user_message_id: string
        tseq: number
    } | undefined
    if (!row) throw new Error('turn not found')

    const busy = getReplayBusy(row.conversation_id)
    if (busy) {
        throw new Error(`conversation replay in progress: ${busy.sessionId}`)
    }

    const conv = db.prepare(`SELECT model FROM conversations WHERE id = ?`)
        .get(row.conversation_id) as { model: string } | undefined
    if (!conv) throw new Error('conversation not found')

    const model = getAvailableModel(conv.model)
    if (!model) {
        const detail = conv.model ? getEffectiveModel(conv.model) : undefined
        log('warn', '[REWRITE]', {
            phase: 'MODEL_UNAVAILABLE',
            traceId: resolvedTraceId,
            turnId: args.turnId,
            conversationId: row.conversation_id,
            modelId: conv.model,
            status: detail?.status,
        })
        throw new Error('MODEL_NOT_SELECTED')
    }
    if (!conv.model || conv.model !== model.id) {
        db.prepare(`UPDATE conversations SET model = ? WHERE id = ?`)
            .run(model.id, row.conversation_id)
    }

    const selectedModelId = model.id
    const selectedProviderId = model.provider
    let rewriteContentParts: MessageContentPart[] = rewriteText.trim().length > 0
        ? [{ type: 'text', text: rewriteText }]
        : []

    if (rewriteAttachments.length > 0) {
        const preparedAttachments = prepareAttachmentsForSend({
            db,
            conversationId: row.conversation_id,
            messageId: row.user_message_id,
            attachments: rewriteAttachments,
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
        const attachmentParts = await materializeAttachmentParts({
            db,
            conversationId: row.conversation_id,
            userMessageId: row.user_message_id,
            attachments: preparedAttachments,
            modelId: model.id,
            provider: model.provider,
            selectedModelId,
            selectedProviderId,
        })
        rewriteContentParts = [...rewriteContentParts, ...attachmentParts]
    }

    const rewritePayload = {
        contentParts: rewriteContentParts,
        content: messageTextFromParts(rewriteContentParts, rewriteText),
        serializedContentParts: serializeMessageContentParts(rewriteContentParts),
    }
    const stageAssetIdsBeforeWrite = rewriteContentParts
        .filter((part): part is Extract<MessageContentPart, { type: 'file' | 'image' }> => (
            part.type === 'file' || part.type === 'image'
        ))
        .map((part) => part.assetId)
        .filter((assetId): assetId is string => typeof assetId === 'string' && assetId.startsWith('stage_'))
    if (stageAssetIdsBeforeWrite.length > 0) {
        log('warn', '[REWRITE][WARN]', {
            traceId: resolvedTraceId,
            turnId: args.turnId,
            conversationId: row.conversation_id,
            reason: 'stage_asset_prevented_before_write',
            stageAssetIds: stageAssetIdsBeforeWrite,
        })
        throw new Error('REWRITE_STAGE_ASSET_BLOCKED')
    }

    const replyId = uuidv4()
    const tx = db.transaction(() => {
        log('info', '[REWRITE]', {
            phase: 'PRUNE_START',
            traceId: resolvedTraceId,
            turnId: args.turnId,
            conversationId: row.conversation_id,
            tseq: row.tseq,
        })
        db.prepare(`
        UPDATE messages
        SET content=?, content_parts=?, updated_at=?, status='completed', type='text'
        WHERE id=? AND role='user'
      `).run(
            rewritePayload.content,
            rewritePayload.serializedContentParts,
            now,
            row.user_message_id,
        )
        turnWriter.clearAssistantRepliesForTurn(args.turnId)

        turnWriter.startAssistantReply({
            conversationId: row.conversation_id,
            turnId: args.turnId,
            userMessageId: row.user_message_id,
            assistantMessageId: replyId,
            model: model.id,
            replyGroupId: args.turnId,
            timestampMs: now,
        })
        log('info', '[REWRITE]', {
            phase: 'PRUNE_DONE',
            traceId: resolvedTraceId,
            turnId: args.turnId,
            replyId,
        })
    })
    tx()

    log('info', '[REWRITE]', {
        phase: 'DB_WRITE_DONE',
        traceId: resolvedTraceId,
        turnId: args.turnId,
        replyId,
        conversationId: row.conversation_id,
    })

    const readbackRow = db.prepare(`
            SELECT content_parts
            FROM messages
            WHERE id = ? AND role = 'user'
            LIMIT 1
        `).get(row.user_message_id) as { content_parts?: string | null } | undefined
    const readbackParts = parseMessageContentParts(readbackRow?.content_parts ?? null, '')
    const readbackFileParts = readbackParts.filter(
        (part): part is Extract<MessageContentPart, { type: 'file' | 'image' }> => (
            part.type === 'file' || part.type === 'image'
        ),
    )
    const readbackAssetIds = readbackFileParts
        .map((part) => (typeof part.assetId === 'string' ? part.assetId : ''))
        .filter(Boolean)
    log('info', '[REWRITE][DB_READBACK]', {
        traceId: resolvedTraceId,
        conversationId: row.conversation_id,
        turnId: args.turnId,
        messageId: row.user_message_id,
        partsCount: readbackParts.length,
        filePartCount: readbackFileParts.length,
        assetIds: readbackAssetIds,
    })
    const stageAssetIds = readbackAssetIds.filter((assetId) => assetId.startsWith('stage_'))
    if (stageAssetIds.length > 0) {
        log('warn', '[REWRITE][WARN]', {
            traceId: resolvedTraceId,
            conversationId: row.conversation_id,
            turnId: args.turnId,
            messageId: row.user_message_id,
            reason: 'stage_asset_persisted',
            stageAssetIds,
        })
    }

    const rewriteReadbackAttachments: TurnAttachment[] = readbackFileParts.map((part) => ({
        id: part.assetId,
        assetId: part.assetId,
        storageKey: part.storageKey,
        name: part.name,
        mimeType: part.mimeType,
        size: part.size,
        kind: toTurnAttachmentKind(part.mimeType),
        status: 'ready',
        ready: true,
        ingestionState: 'ready',
        readDiagnostics: part.readDiagnostics,
    }))

    let refreshedHistory = getMainlineHistory(db, {
        conversationId: row.conversation_id,
        cutoffTseq: row.tseq,
    }) as UIMessage[]
    refreshedHistory = hydrateMessagePartsWithAssetData({
        db,
        conversationId: row.conversation_id,
        messages: refreshedHistory,
    })
    let refreshedSummary = summarizeHistoryFileParts(refreshedHistory)
    log('info', '[REWRITE][HISTORY_REFRESH]', {
        traceId: resolvedTraceId,
        conversationId: row.conversation_id,
        turnId: args.turnId,
        historyCount: refreshedSummary.historyCount,
        filePartCountTotal: refreshedSummary.filePartCountTotal,
        assetIds: refreshedSummary.assetIds,
        source: 'cutoff',
    })
    if (readbackFileParts.length > 0 && refreshedSummary.filePartCountTotal === 0) {
        log('warn', '[REWRITE][WARN]', {
            traceId: resolvedTraceId,
            conversationId: row.conversation_id,
            turnId: args.turnId,
            reason: 'history_stale_after_rewrite',
            readbackFilePartCount: readbackFileParts.length,
            readbackAssetIds,
        })
        refreshedHistory = getMainlineHistory(db, {
            conversationId: row.conversation_id,
        }) as UIMessage[]
        refreshedHistory = hydrateMessagePartsWithAssetData({
            db,
            conversationId: row.conversation_id,
            messages: refreshedHistory,
        })
        refreshedSummary = summarizeHistoryFileParts(refreshedHistory)
        log('info', '[REWRITE][HISTORY_REFRESH]', {
            traceId: resolvedTraceId,
            conversationId: row.conversation_id,
            turnId: args.turnId,
            historyCount: refreshedSummary.historyCount,
            filePartCountTotal: refreshedSummary.filePartCountTotal,
            assetIds: refreshedSummary.assetIds,
            source: 'full_refetch',
        })
    }

    const snapshot = turnWriter.pruneAndSnapshot({
        conversationId: row.conversation_id,
        fromTurnSeq: row.tseq,
    })

    setImmediate(() => {
        log('info', '[REWRITE]', {
            phase: 'STREAM_ENQUEUE',
            traceId: resolvedTraceId,
            turnId: args.turnId,
            replyId,
            conversationId: row.conversation_id,
        })
        executeTurn({
            conversationId: row.conversation_id,
            replyId,
            model: model as LLMModelConfig,
            history: refreshedHistory,
            userMessageId: row.user_message_id,
            webContentsId: args.webContentsId,
            turnId: args.turnId,
            trace,
            traceId: resolvedTraceId,
            inputText: rewriteText,
            attachments: rewriteReadbackAttachments,
            mode: 'rewrite',
        }).catch((err: unknown) => log('error', '[REWRITE]', {
            phase: 'START_FAILED',
            traceId: resolvedTraceId,
            turnId: args.turnId,
            conversationId: row.conversation_id,
            error: err instanceof Error ? err.message : String(err),
        }))
    })

    return {
        placeholder: {
            id: replyId,
            conversation_id: row.conversation_id,
            role: 'assistant',
            type: 'progress',
            content: '',
            timestamp: Date.now(),
            model: model.id,
            parent_id: row.user_message_id,
            turn_id: args.turnId,
            cutoff_tseq: row.tseq,
        } as unknown as UIMessage,
        snapshot,
        meta: { turnId: args.turnId, conversationId: row.conversation_id },
    }
}
