import type { IpcRendererEvent } from 'electron'
import { IPC } from '../ipc/channels'
import type { MemoryAssetDetail, MemoryAssetRecord, MemoryIngestProgress, MemoryIngestRequest, MemoryIngestResult } from '../../contracts/index'
import { safeInvoke, safeOn, safeRemoveAll } from './ipcHelpers'

export function createMemoryCloudAPI() {
    return {
        isEnabled: (conversationId: string) =>
            safeInvoke<{ enabled: boolean }>(IPC.MEMORY_CLOUD_IS_ENABLED, conversationId),

        ingestDocument: (payload: MemoryIngestRequest) =>
            safeInvoke<MemoryIngestResult>(IPC.MEMORY_INGEST_DOCUMENT, payload),

        onIngestProgress: (cb: (e: IpcRendererEvent, d: MemoryIngestProgress) => void) =>
            safeOn<MemoryIngestProgress>(IPC.MEMORY_INGEST_PROGRESS, cb),
        removeIngestProgressListener: () =>
            safeRemoveAll(IPC.MEMORY_INGEST_PROGRESS),

        listAssets: (conversationId: string) =>
            safeInvoke<MemoryAssetRecord[]>(IPC.MEMORY_ASSET_LIST, { conversationId }),

        readAsset: (conversationId: string, assetId: string, maxChars?: number) =>
            safeInvoke<MemoryAssetDetail | null>(IPC.MEMORY_ASSET_READ, { conversationId, assetId, maxChars }),

        deleteAsset: (conversationId: string, assetId: string) =>
            safeInvoke<{ ok: true }>(IPC.MEMORY_ASSET_DELETE, { conversationId, assetId }),

        openAsset: (conversationId: string, assetId: string) =>
            safeInvoke<{ ok: true }>(IPC.MEMORY_ASSET_OPEN, { conversationId, assetId }),

        revealAsset: (conversationId: string, assetId: string) =>
            safeInvoke<{ ok: true }>(IPC.MEMORY_ASSET_REVEAL, { conversationId, assetId }),
    }
}
