import type { ChatAPI, Conversation, SendMessagePayload, StartGenResponse, UIMessage } from '@contracts'
import { withErrorHandling } from './utils'

function requireChatAPI(): ChatAPI {
    if (!window.chatAPI) {
        throw new Error('chatAPI is not available')
    }
    return window.chatAPI
}

export const chatService = {
    api: () => requireChatAPI(),
    getAllConversations: () =>
        withErrorHandling(() => requireChatAPI().getAllConversations()),
    createConversation: () =>
        withErrorHandling(() => requireChatAPI().createConversation()),
    deleteConversation: (id: string) =>
        withErrorHandling(() => requireChatAPI().deleteConversation(id)),
    renameConversation: (id: string, title: string) =>
        withErrorHandling(() => requireChatAPI().renameConversation(id, title)),
    updateConversationModel: (id: string, model: string) =>
        withErrorHandling(() => requireChatAPI().updateConversationModel(id, model)),
    getMessages: (conversationId: string) =>
        withErrorHandling(() => requireChatAPI().getMessages(conversationId) as Promise<UIMessage[]>),
    sendMessage: (payload: SendMessagePayload) =>
        withErrorHandling(() => requireChatAPI().sendMessage(payload) as Promise<StartGenResponse>),
    isConversationBusy: (conversationId: string) =>
        withErrorHandling(() => requireChatAPI().isConversationBusy(conversationId)),
    abortStream: (replyId: string) =>
        withErrorHandling(() => requireChatAPI().abortStream(replyId)),
    getChatItems: (conversationId: string) =>
        withErrorHandling(() => requireChatAPI().getChatItems(conversationId)),
    getTurnAnswers: (turnId: string) =>
        withErrorHandling(() => requireChatAPI().getTurnAnswers(turnId)),
    getConversation: async (conversationId: string): Promise<Conversation | null> => {
        const all = await withErrorHandling(() => requireChatAPI().getAllConversations())
        return all.find(conv => conv.id === conversationId) ?? null
    },
}
