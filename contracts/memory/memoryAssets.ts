export type MemoryAssetRecord = {
    id: string
    memoryId: string
    uri: string
    storageBackend: string
    mimeType?: string | null
    sizeBytes?: number | null
    meta?: string | null
    createdAt: number
    chunkCount?: number
}

export type MemoryAssetDetail = {
    asset: MemoryAssetRecord
    chunkCount: number
    text: string | null
}
