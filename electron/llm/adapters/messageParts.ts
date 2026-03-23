import type {
    AttachmentReference,
    MessageContentPart,
    StrategyAttachment,
    TurnAttachment,
    UIMessage,
} from '../../../contracts/index'
import { messageTextFromParts, parseMessageContentParts } from '../../../shared/chat/contentParts'

export function toLegacyAttachmentPart(attachment: TurnAttachment): MessageContentPart {
    const mimeType = attachment.mimeType || 'application/octet-stream'
    const assetId = attachment.assetId ?? attachment.id
    return {
        type: mimeType.toLowerCase().startsWith('image/') ? 'image' : 'file',
        assetId,
        providerFileId: attachment.providerFileId,
        storageKey: attachment.storageKey,
        name: attachment.name || assetId,
        mimeType,
        size: attachment.size ?? 0,
        status: attachment.status,
        data: attachment.data,
    }
}

function isAttachmentReference(attachment: StrategyAttachment): attachment is AttachmentReference {
    return 'assetId' in attachment && !('id' in attachment)
}

function toStrategyAttachmentPart(attachment: StrategyAttachment): MessageContentPart {
    if (isAttachmentReference(attachment)) {
        const assetId = attachment.assetId.trim()
        return {
            type: 'file',
            assetId,
            assetRef: true,
            name: assetId,
            mimeType: 'application/octet-stream',
            size: 0,
        }
    }
    const mimeType = attachment.mimeType || 'application/octet-stream'
    return {
        type: attachment.modality === 'image' ? 'image' : 'file',
        assetId: attachment.id,
        name: attachment.name || attachment.id,
        mimeType,
        size: attachment.size ?? 0,
    }
}

function attachmentHintText(attachment: StrategyAttachment): string {
    if (isAttachmentReference(attachment)) {
        return `File: ${attachment.assetId || 'attachment'}`
    }
    return `File: ${attachment.name || 'attachment'}`
}

export function normalizeMessage(message: UIMessage): UIMessage {
    const base = typeof message.content === 'string' ? message.content : ''
    const withLegacy = message as UIMessage & { contentParts?: unknown; parts?: unknown; attachments?: StrategyAttachment[] }
    if (withLegacy.contentParts != null) {
        const normalized = parseMessageContentParts(withLegacy.contentParts, base)
        return normalized.length > 0
            ? { ...message, contentParts: normalized }
            : { ...message, contentParts: undefined }
    }
    if (withLegacy.parts != null) {
        const normalized = parseMessageContentParts(withLegacy.parts, base)
        return normalized.length > 0
            ? { ...message, contentParts: normalized }
            : message
    }
    if (Array.isArray(withLegacy.attachments) && withLegacy.attachments.length > 0) {
        const normalized: MessageContentPart[] = []
        if (base.trim().length > 0) {
            normalized.push({ type: 'text', text: base })
        }
        for (const attachment of withLegacy.attachments) {
            normalized.push({ type: 'text', text: attachmentHintText(attachment) })
            normalized.push(toStrategyAttachmentPart(attachment))
        }
        return {
            ...message,
            content: base,
            contentParts: normalized,
        }
    }
    return message
}

export function getMessageParts(message: UIMessage): MessageContentPart[] {
    const normalized = normalizeMessage(message)
    const base = typeof normalized.content === 'string' ? normalized.content : ''
    return parseMessageContentParts(normalized.contentParts, base)
}

export function getMessageText(message: UIMessage): string {
    const base = typeof message.content === 'string' ? message.content : ''
    const parts = getMessageParts(message)
    return messageTextFromParts(parts, base)
}

export function hasFilePartsInMessage(message: UIMessage): boolean {
    const parts = getMessageParts(message)
    return parts.some((part) => part.type === 'file' || part.type === 'image')
}

export function hasFilePartsInHistory(history: UIMessage[]): boolean {
    return history.some((message) => hasFilePartsInMessage(message))
}

export function extractFileAttachmentsFromHistory(history: UIMessage[]): TurnAttachment[] {
    const out: TurnAttachment[] = []
    for (const message of history) {
        const parts = getMessageParts(message)
        for (const part of parts) {
            if (part.type !== 'file' && part.type !== 'image') continue
            out.push({
                id: part.assetId,
                assetId: part.assetId,
                providerFileId: part.providerFileId,
                storageKey: part.storageKey,
                name: part.name,
                mimeType: part.mimeType,
                size: part.size,
                kind: part.type === 'image' ? 'image' : 'file',
                data: part.data,
                status: part.status,
                ready: part.status !== 'uploading' && part.status !== 'error',
                readDiagnostics: part.readDiagnostics,
            })
        }
    }
    return out
}

export function appendLegacyAttachmentsToLastUser(
    history: UIMessage[],
    attachments: TurnAttachment[] | undefined,
    inputText?: string,
): UIMessage[] {
    const files = attachments ?? []
    if (files.length === 0 && !inputText) return history

    const next = history.map((item) => ({ ...item }))
    let lastUserIdx = -1
    for (let i = next.length - 1; i >= 0; i -= 1) {
        if (next[i].role === 'user') {
            lastUserIdx = i
            break
        }
    }

    const fileParts = files.map(toLegacyAttachmentPart)
    if (lastUserIdx < 0) {
        next.push({
            id: `legacy_user_${Date.now()}`,
            conversation_id: history[0]?.conversation_id ?? '',
            role: 'user',
            type: 'text',
            content: typeof inputText === 'string' ? inputText : '',
            contentParts: [
                ...(typeof inputText === 'string' && inputText.trim() ? [{ type: 'text' as const, text: inputText }] : []),
                ...fileParts,
            ],
            timestamp: Date.now(),
        })
        return next
    }

    const target = next[lastUserIdx]
    const existing = getMessageParts(target)
    const nextText = typeof inputText === 'string'
        ? inputText
        : messageTextFromParts(existing, target.content)
    target.contentParts = [
        ...(nextText.trim() ? [{ type: 'text' as const, text: nextText }] : []),
        ...existing.filter((part) => part.type !== 'text'),
        ...fileParts,
    ]
    target.content = nextText
    return next
}
