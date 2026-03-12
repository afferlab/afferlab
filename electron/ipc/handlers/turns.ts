import { ipcMain } from 'electron'
import { getDB } from '../../db'
import { IPC } from '../channels'
import { getTurnAnswers } from '../../core/conversation/getConversationSnapshot'
import { executeRegenerateMessage } from '../../engine/chat/application/regenerateMessage'
import { executeRewriteFromTurn } from '../../engine/chat/application/rewriteFromTurn'

import type { TurnAttachment } from '../../../contracts/index'

export function registerTurnIPC() {
    ipcMain.handle(IPC.REGENERATE, async (event, { turnId }: { turnId: string }) => {
        return executeRegenerateMessage({
            turnId,
            webContentsId: event.sender?.id,
        })
    })

    ipcMain.handle(
        IPC.REWRITE_FROM_TURN,
        async (
            event,
            {
                turnId,
                newUserText,
                attachments,
                traceId,
            }: {
                turnId: string
                newUserText: string
                attachments?: TurnAttachment[]
                traceId?: string
            },
        ) => {
            return executeRewriteFromTurn({
                turnId,
                newUserText,
                attachments,
                traceId,
                webContentsId: event.sender?.id,
            })
        },
    )

    ipcMain.handle(
        IPC.SWITCH_MODEL,
        async (
            event,
            { turnId, modelId }: { turnId: string; modelId: string },
        ) => executeRegenerateMessage({
            turnId,
            modelId,
            webContentsId: event.sender?.id,
        }),
    )

    ipcMain.handle('get-turn-answers', (_e, turnId: string) => {
        const db = getDB()
        return getTurnAnswers(db, turnId)
    })
}
