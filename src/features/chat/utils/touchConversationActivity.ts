import { chatStore } from '@/features/chat/state/chatStore'

export function touchConversationActivity(
    conversationId: string | null | undefined,
    updatedAt: number = Date.now(),
): void {
    if (!conversationId) return
    chatStore.getState().updateConversation(conversationId, { updated_at: updatedAt })
}
