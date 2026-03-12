import type { MessageContentPart, TurnAttachment, UIMessage } from '@contracts'
import { normalizeAttachmentExt } from '@shared/attachments/attachmentPolicy'

function isFilePart(part: MessageContentPart): part is Extract<MessageContentPart, { type: 'file' | 'image' }> {
    return part.type === 'file' || part.type === 'image'
}

export function buildDraftAttachmentsFromMessage(message: UIMessage): TurnAttachment[] {
    const parts = Array.isArray(message.contentParts) ? message.contentParts : []
    const out: TurnAttachment[] = []
    for (const part of parts) {
        if (!isFilePart(part)) continue
        const assetId = typeof part.assetId === 'string' ? part.assetId.trim() : ''
        if (!assetId) continue
        const name = part.name || assetId
        out.push({
            id: assetId,
            assetId,
            storageKey: part.storageKey,
            name,
            mimeType: part.mimeType || 'application/octet-stream',
            ext: normalizeAttachmentExt(undefined, name),
            size: Number.isFinite(part.size) ? part.size : 0,
            kind: part.type === 'image' ? 'image' : 'file',
            data: part.data,
            status: 'ready',
            ready: true,
            ingestionState: 'ready',
            readDiagnostics: {
                sourceKind: 'memoryAsset',
                hasPath: false,
                storageKey: part.storageKey,
                assetId,
                bytesLength: part.data?.byteLength,
            },
        })
    }
    return out
}
