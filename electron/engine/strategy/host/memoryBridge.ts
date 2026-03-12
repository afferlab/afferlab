import type { MemoryChunkSearchRequest, MemoryIngestRequest, MemoryQueryOptions } from '../../../../contracts/index'
import { getDB } from '../../../db'
import { listAssets, deleteAsset, listMemoryCloud, deleteMemoryItem, retireMemoriesBySourceMessage } from '../../../core/memory/memoryStore'
import { strategyMemoryIngest, strategyMemoryReadAsset, strategyMemorySearch } from '../../../core/strategy/strategyMemory'

export function createMemoryBridge() {
    return {
        executeMemorySearch: async ({ conversationId, ...req }: MemoryChunkSearchRequest & { conversationId: string }) => {
            const db = getDB()
            return strategyMemorySearch(db, {
                conversationId,
                query: req.query,
                options: {
                    topK: req.topK,
                    embeddingProfile: req.embeddingProfile,
                },
            })
        },
        executeMemoryListAssets: async ({ conversationId }: { conversationId: string }) => {
            const db = getDB()
            return listAssets(db, { conversationId })
        },
        executeMemoryReadAsset: async ({ conversationId, assetId, maxChars }: { conversationId: string; assetId: string; maxChars?: number }) => {
            const db = getDB()
            return strategyMemoryReadAsset(db, { conversationId, assetId, maxChars })
        },
        executeMemoryDeleteAsset: async ({ conversationId, assetId }: { conversationId: string; assetId: string }) => {
            const db = getDB()
            deleteAsset(db, { conversationId, assetId })
            return { ok: true as const }
        },
        ingestDocument: async (req: MemoryIngestRequest) => {
            const db = getDB()
            return strategyMemoryIngest(db, req)
        },
        memoryQuery: async ({ conversationId, options }: { conversationId: string; options?: MemoryQueryOptions }) => {
            const db = getDB()
            const limit = options?.limit
            const offset = options?.offset
            return listMemoryCloud(db, { conversationId, limit, offset, order: 'newest' })
        },
        memoryRetireBySourceMessage: async ({ conversationId, messageId }: { conversationId: string; messageId: string }) => {
            const db = getDB()
            const retired = retireMemoriesBySourceMessage(db, { conversationId, messageId })
            return { retired }
        },
        memoryRetireMemory: async ({ conversationId, memoryId }: { conversationId: string; memoryId: string }) => {
            const db = getDB()
            deleteMemoryItem(db, { conversationId, memoryId })
            return { retired: true }
        },
    }
}
