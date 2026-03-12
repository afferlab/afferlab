import type { MemoryAssetDetail, MemoryAssetRecord, MemoryIngestProgress, MemoryIngestRequest, MemoryIngestResult } from '@contracts'
import { withErrorHandling } from './utils'

function requireMemoryCloudAPI() {
    if (!window.memoryCloudAPI) {
        throw new Error('memoryCloudAPI is not available')
    }
    return window.memoryCloudAPI
}

export const memoryCloudService = {
    isEnabled: (conversationId: string) =>
        withErrorHandling(() => requireMemoryCloudAPI().isEnabled(conversationId)),
    ingestDocument: (payload: MemoryIngestRequest) =>
        withErrorHandling(() => requireMemoryCloudAPI().ingestDocument(payload) as Promise<MemoryIngestResult>),
    listAssets: (conversationId: string) =>
        withErrorHandling(() => requireMemoryCloudAPI().listAssets(conversationId) as Promise<MemoryAssetRecord[]>),
    readAsset: (conversationId: string, assetId: string, maxChars?: number) =>
        withErrorHandling(() => requireMemoryCloudAPI().readAsset(conversationId, assetId, maxChars) as Promise<MemoryAssetDetail | null>),
    deleteAsset: (conversationId: string, assetId: string) =>
        withErrorHandling(() => requireMemoryCloudAPI().deleteAsset(conversationId, assetId)),
    openAsset: (conversationId: string, assetId: string) =>
        withErrorHandling(() => requireMemoryCloudAPI().openAsset(conversationId, assetId)),
    revealAsset: (conversationId: string, assetId: string) =>
        withErrorHandling(() => requireMemoryCloudAPI().revealAsset(conversationId, assetId)),
    onIngestProgress: (cb: (event: unknown, data: MemoryIngestProgress) => void) =>
        requireMemoryCloudAPI().onIngestProgress(cb),
    removeIngestProgressListener: () =>
        requireMemoryCloudAPI().removeIngestProgressListener?.(),
}
