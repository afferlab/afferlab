import type { AttachmentReadDiagnostics, TurnAttachmentStatus } from './attachment'

export type MessageTextPart = {
    type: 'text'
    text: string
}

export type MessageFilePart = {
    type: 'file' | 'image'
    assetId: string
    // runtime-only flag for asset-id placeholders created before full attachment hydration
    assetRef?: boolean
    // runtime-only provider native file reference (never persisted)
    providerFileId?: string
    storageKey?: string
    name: string
    mimeType: string
    size: number
    status?: TurnAttachmentStatus
    width?: number
    height?: number
    duration?: number
    // runtime-only hydration field (never persisted)
    data?: Uint8Array
    // runtime-only diagnostics field (never persisted)
    readDiagnostics?: AttachmentReadDiagnostics
}

export type MessageContentPart = MessageTextPart | MessageFilePart
