import { ipcMain } from 'electron'
import { getDB } from '../../db'
import { streamManager } from '../../engine/chat/streaming/StreamManager'
import { IPC } from '../channels'
import { getReplayBusy } from '../../core/strategy/replayManager'
import { prepareAttachmentInMain } from '../../engine/attachments/attachmentPreparationService'
import { executeSendMessage } from '../../engine/chat/application/sendMessage'
import { messageTextFromParts, parseMessageContentParts } from '../../../shared/chat/contentParts'

import type {
    ChatItemRow,
    PrepareAttachmentPayload,
    SendMessagePayload,
    UIMessage,
} from '../../../contracts/index'

export function registerMessageIPC() {
    ipcMain.handle(IPC.GET_MESSAGES, async (_e, conversationId: string) => {
        const db = await getDB()

        const rows = db.prepare(`
            SELECT * FROM chat_items
            WHERE conversation_id = ?
            ORDER BY tseq
        `).all(conversationId) as ChatItemRow[]

        const out: UIMessage[] = []
        const toUiType = (status?: string): UIMessage['type'] =>
            status === 'progress' ? 'progress'
                : status === 'stopped' ? 'stopped'
                    : status === 'error' ? 'error'
                        : 'text'

        for (const r of rows) {
            const userParts = parseMessageContentParts(r.user_content_parts, r.user_text ?? '')
            out.push({
                id: r.user_msg_id,
                conversation_id: r.conversation_id,
                role: 'user',
                type: 'text',
                model: null,
                content: messageTextFromParts(userParts, r.user_text ?? ''),
                contentParts: userParts,
                timestamp: r.user_time ?? r.turn_created_at ?? Date.now(),
            })

            if (r.asst_msg_id) {
                const asstParts = parseMessageContentParts(r.asst_content_parts, r.asst_text ?? '')
                const dbStatus = db.prepare(`SELECT status FROM messages WHERE id = ?`)
                    .get(r.asst_msg_id) as { status?: string } | undefined

                out.push({
                    id: r.asst_msg_id,
                    conversation_id: r.conversation_id,
                    role: 'assistant',
                    type: toUiType(dbStatus?.status),
                    model: r.asst_model ?? undefined,
                    parent_id: r.user_msg_id,
                    content: messageTextFromParts(asstParts, r.asst_text ?? ''),
                    contentParts: asstParts,
                    timestamp: r.asst_time ?? r.turn_updated_at ?? r.user_time ?? Date.now(),
                })
            }
        }
        return out
    })

    ipcMain.handle(IPC.GET_CHAT_ITEMS, async (_e, conversationId: string) => {
        const db = await getDB()
        return db.prepare(`
            SELECT * FROM chat_items
            WHERE conversation_id = ?
            ORDER BY tseq
        `).all(conversationId) as ChatItemRow[]
    })

    ipcMain.handle(IPC.ATTACHMENT_PREPARE, (_e, payload: PrepareAttachmentPayload) => (
        prepareAttachmentInMain(payload)
    ))

    ipcMain.handle(IPC.SEND_MESSAGE, async (event, msg: SendMessagePayload) => (
        executeSendMessage({
            message: msg,
            webContentsId: event.sender?.id,
        })
    ))

    ipcMain.handle(IPC.ABORT_STREAM, (_e, payload: string | { replyId?: string }) => {
        const replyId = typeof payload === 'string' ? payload : payload?.replyId
        if (!replyId) return
        streamManager.abort(replyId)
    })

    ipcMain.handle(IPC.IS_CONV_BUSY, (_e, convId: string) => {
        const streamBusy = streamManager.isConversationBusy(convId)
        if (streamBusy?.busy) return streamBusy
        const replayBusy = getReplayBusy(convId)
        if (replayBusy) return { busy: true as const }
        return { busy: false as const }
    })
}
