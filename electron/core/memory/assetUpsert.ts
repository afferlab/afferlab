import crypto from 'node:crypto'
import type { Database } from 'better-sqlite3'

export type AssetBlobRow = {
    id: string
    sha256: string
    size: number
    mime_type?: string | null
    created_at: number
}

export type MemoryAssetRow = {
    id: string
    memory_id: string
    conversation_id: string
    blob_id?: string | null
    filename?: string | null
    uri: string
    storage_backend: string
    mime_type?: string | null
    size_bytes?: number | null
    meta?: string | null
}

function hashBytes(bytes: Uint8Array): string {
    return crypto.createHash('sha256').update(bytes).digest('hex')
}

export function selectAssetBlobBySha(db: Database, sha256: string): AssetBlobRow | null {
    const row = db.prepare(`
        SELECT id, sha256, size, mime_type, created_at
        FROM asset_blobs
        WHERE sha256 = ?
        LIMIT 1
    `).get(sha256) as AssetBlobRow | undefined
    return row ?? null
}

export function ensureAssetBlob(args: {
    db: Database
    bytes: Uint8Array
    sha256?: string
    mimeType?: string | null
    createdAt: number
}): AssetBlobRow {
    const sha256 = typeof args.sha256 === 'string' && args.sha256.trim()
        ? args.sha256.trim()
        : hashBytes(args.bytes)
    const tx = args.db.transaction(() => {
        args.db.prepare(`
            INSERT INTO asset_blobs(id, sha256, bytes, size, mime_type, created_at)
            VALUES (?, ?, ?, ?, ?, ?)
            ON CONFLICT(sha256) DO NOTHING
        `).run(
            `blob_${crypto.randomUUID()}`,
            sha256,
            Buffer.from(args.bytes),
            args.bytes.byteLength,
            args.mimeType ?? null,
            args.createdAt,
        )
        const selected = selectAssetBlobBySha(args.db, sha256)
        if (!selected) {
            throw new Error(`asset_blobs upsert failed: sha256=${sha256}`)
        }
        return selected
    })
    return tx()
}

export function selectAssetByConversationAndBlob(
    db: Database,
    conversationId: string,
    blobId: string,
): MemoryAssetRow | null {
    const row = db.prepare(`
        SELECT id, memory_id, conversation_id, blob_id, filename, uri, storage_backend, mime_type, size_bytes, meta
        FROM memory_assets
        WHERE conversation_id = ? AND blob_id = ?
        LIMIT 1
    `).get(conversationId, blobId) as MemoryAssetRow | undefined
    return row ?? null
}

export function selectAssetBlobByAssetId(
    db: Database,
    assetId: string,
): (AssetBlobRow & { asset_id: string; conversation_id: string }) | null {
    const row = db.prepare(`
        SELECT
            ab.id,
            ab.sha256,
            ab.size,
            ab.mime_type,
            ab.created_at,
            ma.id AS asset_id,
            ma.conversation_id
        FROM memory_assets ma
        JOIN asset_blobs ab ON ab.id = ma.blob_id
        WHERE ma.id = ?
        LIMIT 1
    `).get(assetId) as (AssetBlobRow & { asset_id: string; conversation_id: string }) | undefined
    return row ?? null
}

export function insertOrReuseConversationAsset(args: {
    db: Database
    row: {
        id: string
        memoryId: string
        conversationId: string
        blobId: string
        filename: string
        uri: string
        storageBackend: string
        mimeType: string
        sha256: string
        sizeBytes: number
        metaJson: string
        createdAt: number
    }
}): { asset: MemoryAssetRow; inserted: boolean } {
    const tx = args.db.transaction(() => {
        const inserted = args.db.prepare(`
            INSERT OR IGNORE INTO memory_assets(
                id,
                memory_id,
                conversation_id,
                blob_id,
                filename,
                uri,
                storage_backend,
                mime_type,
                sha256,
                size_bytes,
                meta,
                created_at
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        `).run(
            args.row.id,
            args.row.memoryId,
            args.row.conversationId,
            args.row.blobId,
            args.row.filename,
            args.row.uri,
            args.row.storageBackend,
            args.row.mimeType,
            args.row.sha256,
            args.row.sizeBytes,
            args.row.metaJson,
            args.row.createdAt,
        ).changes > 0
        const selected = selectAssetByConversationAndBlob(args.db, args.row.conversationId, args.row.blobId)
        if (!selected) {
            throw new Error(`memory_assets upsert failed: conversation=${args.row.conversationId} blob=${args.row.blobId}`)
        }
        return {
            asset: selected,
            inserted: inserted && selected.id === args.row.id,
        }
    })
    return tx()
}
