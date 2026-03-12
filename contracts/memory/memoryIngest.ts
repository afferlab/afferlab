export type MemoryIngestOptions = {
    wait?: 'load' | 'full'
    embeddingProfile?: string
    chunkSize?: number
    chunkOverlap?: number
    tags?: string[]
    type?: string
    sourceMessageId?: string
    indexing?: 'full' | 'chunkOnly' | 'rawOnly'
}

export type MemoryIngestRequest = {
    conversationId: string
    strategyKey?: string
    strategyVersion?: string
    assetId?: string
    filename: string
    mime?: string
    data?: Uint8Array
    text?: string
    options?: MemoryIngestOptions
}

export type MemoryIngestResult = {
    assetId: string
    storageKey?: string
    chunkCount: number
    status: 'completed' | 'failed' | 'loaded'
    reason?: 'no_text' | 'index_disabled' | 'unsupported'
    error?: string
}

export type MemoryIngestProgress = {
    conversationId: string
    assetId: string
    phase: 'parse' | 'chunk' | 'embed' | 'write' | 'loaded' | 'completed' | 'failed'
    done?: number
    total?: number
    status?: 'completed' | 'failed'
}
