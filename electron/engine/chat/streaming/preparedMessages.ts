import type { TurnAttachment, UIMessage } from '../../../../contracts/index'
import { toLegacyAttachmentPart } from '../../../llm/adapters/messageParts'
import { parseMessageContentParts } from '../../../../shared/chat/contentParts'

export function buildPreparedMessagesForStream(args: {
    strategyMessages: UIMessage[]
    parentUserId: string
    conversationId: string
    inputText?: string
    attachments?: TurnAttachment[]
}): UIMessage[] {
    const currentParts = [
        ...(typeof args.inputText === 'string' && args.inputText.trim().length > 0
            ? [{ type: 'text' as const, text: args.inputText }]
            : []),
        ...((args.attachments ?? []).map(toLegacyAttachmentPart)),
    ]
    if (currentParts.length === 0) return args.strategyMessages
    const existingIdx = args.strategyMessages.findIndex((message) => message.id === args.parentUserId)
    if (existingIdx >= 0) {
        const existing = args.strategyMessages[existingIdx]
        const existingParts = parseMessageContentParts(existing.contentParts, existing.content)
        const existingFilePartCount = existingParts.filter((part) => part.type === 'file' || part.type === 'image').length
        const incomingFilePartCount = currentParts.filter((part) => part.type === 'file' || part.type === 'image').length
        if (incomingFilePartCount <= 0 || existingFilePartCount > 0) {
            return args.strategyMessages
        }
        const next = [...args.strategyMessages]
        next[existingIdx] = {
            ...existing,
            content: typeof args.inputText === 'string' ? args.inputText : existing.content,
            contentParts: currentParts,
        }
        return next
    }

    return [
        ...args.strategyMessages,
        {
            id: args.parentUserId,
            conversation_id: args.conversationId,
            role: 'user',
            type: 'text',
            content: typeof args.inputText === 'string' ? args.inputText : '',
            contentParts: currentParts,
            timestamp: Date.now(),
        } as UIMessage,
    ]
}
