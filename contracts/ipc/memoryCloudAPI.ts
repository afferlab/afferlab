import type { IpcRendererEvent } from 'electron'
import type { MemoryIngestProgress, MemoryIngestRequest, MemoryIngestResult } from '../memory/memoryIngest'
import type { MemoryAssetRecord, MemoryAssetDetail } from '../memory/memoryAssets'

// Preload-exposed window type declarations, following the same style as chatAPI.ts.
declare global {
    interface Window {
        memoryCloudAPI: {
            isEnabled: (conversationId: string) => Promise<{ enabled: boolean }>
            ingestDocument: (payload: MemoryIngestRequest) => Promise<MemoryIngestResult>
            onIngestProgress: (cb: (event: IpcRendererEvent, data: MemoryIngestProgress) => void) => void
            removeIngestProgressListener: () => void
            listAssets: (conversationId: string) => Promise<MemoryAssetRecord[]>
            readAsset: (conversationId: string, assetId: string, maxChars?: number) => Promise<MemoryAssetDetail | null>
            deleteAsset: (conversationId: string, assetId: string) => Promise<{ ok: true }>
            openAsset: (conversationId: string, assetId: string) => Promise<{ ok: true }>
            revealAsset: (conversationId: string, assetId: string) => Promise<{ ok: true }>
        }
    }
}
export {}
