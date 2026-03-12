import { v4 as uuidv4 } from 'uuid'
import { getDB } from '../../../db'
import { getAvailableModel, getEffectiveModel } from '../../../core/models/modelRegistry'
import { TurnWriter } from '../../../core/turnWriter'
import { getMainlineHistory } from '../../../core/history/getMainlineHistory'
import { executeTurn } from '../../../strategies/executeTurn'
import { getReplayBusy } from '../../../core/strategy/replayManager'
import { log } from '../../../core/logging/runtimeLogger'
import { messageTextFromParts, parseMessageContentParts } from '../../../../shared/chat/contentParts'

import type { MessageContentPart, StartGenResponse, StreamTimingTrace, UIMessage } from '../types'
import type { LLMModelConfig } from '../../llm/types'
import type { TurnAttachment } from '../../attachments/types'

function toTurnAttachmentKind(part: Extract<MessageContentPart, { type: 'file' | 'image' }>): TurnAttachment['kind'] {
    return part.type === 'image' ? 'image' : 'file'
}

function loadOriginalUserInput(args: {
    db: ReturnType<typeof getDB>
    userMessageId: string
}): {
    inputText: string
    attachments: TurnAttachment[]
} {
    const row = args.db.prepare(`
        SELECT content, content_parts
        FROM messages
        WHERE id = ? AND role = 'user'
        LIMIT 1
    `).get(args.userMessageId) as {
        content?: string | null
        content_parts?: string | null
    } | undefined
    if (!row) throw new Error('user message not found')

    const parts = parseMessageContentParts(row.content_parts, row.content ?? '')
    const attachments: TurnAttachment[] = parts
        .filter((part): part is Extract<MessageContentPart, { type: 'file' | 'image' }> => (
            part.type === 'file' || part.type === 'image'
        ))
        .map((part) => ({
            id: part.assetId,
            assetId: part.assetId,
            providerFileId: part.providerFileId,
            storageKey: part.storageKey,
            filePath: part.storageKey,
            name: part.name,
            mimeType: part.mimeType,
            size: part.size,
            kind: toTurnAttachmentKind(part),
            data: part.data,
            status: part.status ?? 'ready',
            ready: part.status !== 'uploading' && part.status !== 'error',
            sourceKind: 'memoryAsset',
            hasPath: Boolean(part.storageKey),
            readDiagnostics: part.readDiagnostics,
        }))

    return {
        inputText: messageTextFromParts(parts, row.content ?? ''),
        attachments,
    }
}

export async function executeRegenerateMessage(args: {
    turnId: string
    modelId?: string
    webContentsId?: number
}): Promise<StartGenResponse> {
    const db = getDB()
    const now = Date.now()
    const traceId = uuidv4()
    const trace: StreamTimingTrace = { t0: now }
    const turnWriter = new TurnWriter(db)

    const turn = db.prepare(`
      SELECT t.id, t.conversation_id, t.user_message_id, t.tseq, c.model as conv_model
      FROM turns t JOIN conversations c ON c.id = t.conversation_id
      WHERE t.id = ?
    `).get(args.turnId) as {
        id: string
        conversation_id: string
        user_message_id: string
        tseq: number
        conv_model: string
    } | undefined
    if (!turn) throw new Error('turn not found')

    const busy = getReplayBusy(turn.conversation_id)
    if (busy) {
        throw new Error(`conversation replay in progress: ${busy.sessionId}`)
    }

    const requestedModelId = args.modelId ?? turn.conv_model
    const model = getAvailableModel(requestedModelId)
    if (!model) {
        const detail = requestedModelId ? getEffectiveModel(requestedModelId) : undefined
        log('warn', '[SEND]', {
            phase: 'REGENERATE_MODEL_UNAVAILABLE',
            traceId,
            turnId: args.turnId,
            conversationId: turn.conversation_id,
            modelId: requestedModelId,
            status: detail?.status,
        })
        throw new Error('MODEL_NOT_SELECTED')
    }

    if (!turn.conv_model || turn.conv_model !== model.id) {
        db.prepare(`UPDATE conversations SET model = ? WHERE id = ?`)
            .run(model.id, turn.conversation_id)
        db.prepare(`UPDATE app_settings SET last_used_model_id = ?, updated_at = ? WHERE id = 'singleton'`)
            .run(model.id, Date.now())
    }

    const originalUserInput = loadOriginalUserInput({
        db,
        userMessageId: turn.user_message_id,
    })
    const replyId = uuidv4()
    const tx = db.transaction(() => {
        turnWriter.startAssistantReply({
            conversationId: turn.conversation_id,
            turnId: args.turnId,
            userMessageId: turn.user_message_id,
            assistantMessageId: replyId,
            model: model.id,
            replyGroupId: args.turnId,
            timestampMs: now,
        })
    })
    tx()

    const snapshot = turnWriter.pruneAndSnapshot({
        conversationId: turn.conversation_id,
        fromTurnSeq: turn.tseq,
    })

    const history = getMainlineHistory(db, {
        conversationId: turn.conversation_id,
        cutoffTseq: turn.tseq,
        includeCutoffTurn: false,
    }) as UIMessage[]

    setImmediate(() => {
        executeTurn({
            conversationId: turn.conversation_id,
            replyId,
            model: model as LLMModelConfig,
            history,
            userMessageId: turn.user_message_id,
            webContentsId: args.webContentsId,
            turnId: args.turnId,
            trace,
            traceId,
            inputText: originalUserInput.inputText,
            attachments: originalUserInput.attachments,
            mode: 'regen',
        }).catch((err: unknown) => log('error', '[SEND]', {
            phase: 'REGENERATE_START_FAILED',
            traceId,
            turnId: args.turnId,
            conversationId: turn.conversation_id,
            error: err instanceof Error ? err.message : String(err),
        }))
    })

    return {
        placeholder: {
            id: replyId,
            conversation_id: turn.conversation_id,
            role: 'assistant',
            type: 'progress',
            content: '',
            timestamp: now,
            model: model.id,
            parent_id: turn.user_message_id,
        } as UIMessage,
        snapshot,
        meta: { turnId: args.turnId, conversationId: turn.conversation_id },
    }
}
