import type { MessageContentPart, TurnAttachment } from '../../../contracts/index'
import { toLegacyAttachmentPart } from '../../llm/adapters/messageParts'
import { messageTextFromParts, serializeMessageContentParts } from '../../../shared/chat/contentParts'

export function buildRewriteUserMessagePayload(args: {
    text: string
    attachments?: TurnAttachment[]
}): {
    content: string
    contentParts: MessageContentPart[]
    serializedContentParts: string | null
} {
    const text = typeof args.text === 'string' ? args.text : ''
    const attachments = Array.isArray(args.attachments) ? args.attachments : []
    const normalizedAttachments = attachments.map((attachment) => {
        const assetId = attachment.assetId ?? attachment.id
        return {
            ...attachment,
            id: assetId,
            assetId,
        }
    })
    const contentParts: MessageContentPart[] = [
        ...(text.trim().length > 0 ? [{ type: 'text' as const, text }] : []),
        ...normalizedAttachments.map(toLegacyAttachmentPart),
    ]
    return {
        content: messageTextFromParts(contentParts, text),
        contentParts,
        serializedContentParts: serializeMessageContentParts(contentParts),
    }
}
