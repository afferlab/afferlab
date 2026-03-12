export type UIMemoryCloudItem = {
    id: string
    title?: string
    type: string                     // 'text.note' | 'file.pdf' | ...
    modality: 'text' | 'image' | 'audio' | 'video' | 'file'
    preview?: string                 // Optional: text preview or thumbnail data URL
    created_at: number
    updated_at: number
    pinned: 0 | 1
}

export type UIMemoryCloudUploadPayload = {
    conversationId: string
    files?: { name: string; type: string; data: Uint8Array }[]
    texts?: string[]
}

export type UIMemoryCloudReorderPayload = {
    conversationId: string
    orderedIds: string[]
}
