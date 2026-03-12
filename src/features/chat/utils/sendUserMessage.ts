// src/utils/sendUserMessage.ts
import { chatStore } from '@/features/chat/state/chatStore'
import type { SendMessagePayload, TurnAttachment } from '@contracts'
import { applyConversationSnapshot } from '@/features/chat/utils/applyConversationSnapshot'
import { touchConversationActivity } from '@/features/chat/utils/touchConversationActivity'
import { v4 as uuidv4 } from 'uuid'
import { chatService } from '@/shared/services/ipc/chatService'

export async function sendUserMessage(
    content: string,
    conversationId: string,
    options?: { forceWebSearch?: boolean; attachments?: TurnAttachment[] }
) {
    const trimmed = content.trim()
    const attachments = options?.attachments ?? []
    if ((!trimmed && attachments.length === 0) || !conversationId) return

    // Single-lane guard: do not send again while the conversation is already streaming
    const busyInfo = await chatService.isConversationBusy(conversationId)
    if (busyInfo?.busy) {
        console.log('[send] conversation is busy, skip')
        return
    }

    const userId = uuidv4()
    const traceId = uuidv4()
    const now = Date.now()

    // 1) Send to the backend (the main process writes to the DB and returns real ids)
    const selected = chatStore.getState().conversations.find((c) => c.id === conversationId)
    const payload: SendMessagePayload = {
        id: userId,
        conversation_id: conversationId,
        role: 'user',
        type: 'text',
        content: trimmed,
        timestamp: now,
        ui_selected_model_id: selected?.model ?? undefined,
        force_web_search: options?.forceWebSearch ?? false,
        attachments,
        traceId,
    }
    const res = await chatService.sendMessage(payload)

    applyConversationSnapshot(res.snapshot)
    touchConversationActivity(conversationId)
    if (res.meta?.started !== false) {
        chatStore.getState().setBusy(res.placeholder.conversation_id, res.placeholder.id)
    }
}
