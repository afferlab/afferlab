import type { Database } from 'better-sqlite3'
import fs from 'node:fs'
import crypto from 'node:crypto'
import type { StrategyScope } from '../../../contracts/index'
import { readAssetTextAnyStrategy } from './assets'
import { chunkDocumentText, DEFAULT_CHUNK_OVERLAP, DEFAULT_CHUNK_SIZE, normalizeText } from './pipeline/chunking'
import { embedTextsWithProfile, normalizeEmbedding, resolveEmbeddingProfile } from './pipeline/embedding'
import { assertConversationId, assertStrategyScope } from './utils'

export async function reindexConversationMemory(
    db: Database,
    args: {
        conversationId: string
        strategyKey: string
        strategyVersion: string
        embeddingProfile?: string
    },
): Promise<{ assetCount: number; chunkCount: number }> {
    assertConversationId(args.conversationId)
    const scope: StrategyScope = {
        conversationId: args.conversationId,
        strategyKey: args.strategyKey,
        strategyVersion: args.strategyVersion,
    }
    assertStrategyScope(scope)

    const assets = db.prepare(`
        SELECT id, uri, storage_backend, mime_type, meta
        FROM memory_assets
        WHERE conversation_id = ?
        ORDER BY created_at ASC
    `).all(args.conversationId) as Array<{
        id: string
        uri: string
        storage_backend: string
        mime_type?: string | null
        meta?: string | null
    }>

    let totalChunks = 0
    for (const asset of assets) {
        let text = ''
        if (asset.storage_backend === 'file' && asset.uri) {
            try {
                text = fs.readFileSync(asset.uri, 'utf8')
            } catch {
                text = ''
            }
        }
        if (!text) {
            text = readAssetTextAnyStrategy(db, { conversationId: args.conversationId, assetId: asset.id }) ?? ''
        }
        const normalized = normalizeText(text)
        if (!normalized) continue

        const profile = resolveEmbeddingProfile(args.embeddingProfile)
        const chunkSize = DEFAULT_CHUNK_SIZE
        const overlap = DEFAULT_CHUNK_OVERLAP
        const chunks = chunkDocumentText(normalized, chunkSize, overlap)
        if (!chunks.length) continue

        const embedded = await embedTextsWithProfile(profile, chunks)
        const vectors = embedded.vectors.map((v) => normalizeEmbedding(profile, v))

        const tx = db.transaction(() => {
            db.prepare(`
                DELETE FROM memory_chunk_vectors
                WHERE chunk_id IN (
                    SELECT id FROM memory_chunks
                    WHERE asset_id = ? AND conversation_id = ?
                      AND strategy_key = ? AND strategy_version = ?
                )
            `).run(asset.id, args.conversationId, scope.strategyKey, scope.strategyVersion)

            db.prepare(`
                DELETE FROM memory_chunks
                WHERE asset_id = ? AND conversation_id = ?
                  AND strategy_key = ? AND strategy_version = ?
            `).run(asset.id, args.conversationId, scope.strategyKey, scope.strategyVersion)

            for (let i = 0; i < chunks.length; i++) {
                const textChunk = chunks[i]
                const hash = crypto.createHash('sha1').update(textChunk).digest('hex')
                const chunkId = `chunk_${crypto.randomUUID()}`
                db.prepare(`
                    INSERT OR IGNORE INTO memory_chunks(
                        id, asset_id, conversation_id, strategy_key, strategy_version, idx, text, hash, tokens, meta_json, created_at
                    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                `).run(
                    chunkId,
                    asset.id,
                    args.conversationId,
                    scope.strategyKey,
                    scope.strategyVersion,
                    i,
                    textChunk,
                    hash,
                    null,
                    null,
                    Date.now()
                )

                const row = db.prepare(`
                    SELECT id FROM memory_chunks
                    WHERE asset_id = ? AND hash = ? AND conversation_id = ?
                      AND strategy_key = ? AND strategy_version = ?
                `).get(asset.id, hash, args.conversationId, scope.strategyKey, scope.strategyVersion) as { id: string } | undefined
                const finalChunkId = row?.id ?? chunkId

                const vec = vectors[i]
                if (!vec) continue
                const vecBuf = Buffer.from(new Uint8Array(vec.buffer, vec.byteOffset, vec.byteLength))
                db.prepare(`
                    INSERT INTO memory_chunk_vectors(
                        id, chunk_id, conversation_id, strategy_key, strategy_version, embedding_profile, vector, dim, created_at
                    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
                `).run(
                    `vec_${crypto.randomUUID()}`,
                    finalChunkId,
                    args.conversationId,
                    scope.strategyKey,
                    scope.strategyVersion,
                    profile.name,
                    vecBuf,
                    vec.length,
                    Date.now()
                )
            }
        })
        tx()
        totalChunks += chunks.length
    }

    return { assetCount: assets.length, chunkCount: totalChunks }
}
