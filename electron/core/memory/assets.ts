import type { Database } from 'better-sqlite3'
import crypto from 'node:crypto'
import type { MemoryAssetRecord, MemoryAssetDetail, Modality, UIMemoryCloudItem } from '../../../contracts/index'
import { assertConversationId, assertStrategyScope, mergeMeta, resolveStrategyScope } from './utils'
import { ensureAssetBlob } from './assetUpsert'

export type MemoryItemCreateInput = {
    conversationId: string
    strategyId: string
    type: string
    modality: Modality
    text?: string
    textRepr?: string
    textReprModel?: string
    content?: string
    sizeTokens?: number
    tags?: unknown[]
    meta?: Record<string, unknown>
    contentHash?: string
    priority?: number
    ttlAt?: number
    pinned?: boolean
    source?: {
        conversationId?: string
        turnId?: string
        messageId?: string
    }
}

export function createMemoryItem(db: Database, input: MemoryItemCreateInput): string {
    assertConversationId(input.conversationId)
    const now = Date.now()
    const id = `mem_${crypto.randomUUID()}`
    const jsonTags = input.tags ? JSON.stringify(input.tags) : null
    const jsonMeta = input.meta ? JSON.stringify(input.meta) : null

    db.prepare(`
        INSERT INTO memory_items(
            id, strategy_id,
            scope_type, scope_id,
            owner_type, owner_id,
            source_conversation_id, source_turn_id, source_message_id,
            type, modality,
            text_repr, text_repr_model,
            content, size_tokens,
            tags, meta, content_hash,
            priority, ttl_at,
            pinned,
            created_at, updated_at
        ) VALUES (
            @id, @strategy_id,
            'conversation', @scope_id,
            'conversation', @owner_id,
            @source_conversation_id, @source_turn_id, @source_message_id,
            @type, @modality,
            @text_repr, @text_repr_model,
            @content, @size_tokens,
            @tags, @meta, @content_hash,
            @priority, @ttl_at,
            @pinned,
            @created_at, @updated_at
        )
    `).run({
        id,
        strategy_id: input.strategyId,
        scope_id: input.conversationId,
        owner_id: input.conversationId,
        source_conversation_id: input.source?.conversationId ?? null,
        source_turn_id: input.source?.turnId ?? null,
        source_message_id: input.source?.messageId ?? null,
        type: input.type,
        modality: input.modality,
        text_repr: input.textRepr ?? input.text ?? null,
        text_repr_model: input.textReprModel ?? null,
        content: input.content ?? input.text ?? null,
        size_tokens: input.sizeTokens ?? null,
        tags: jsonTags,
        meta: jsonMeta,
        content_hash: input.contentHash ?? null,
        priority: input.priority ?? null,
        ttl_at: input.ttlAt ?? null,
        pinned: input.pinned ? 1 : 0,
        created_at: now,
        updated_at: now,
    })

    return id
}

export function listMemoryCloud(
    db: Database,
    args: { conversationId: string; limit?: number; offset?: number; order?: 'newest' | 'priority' },
): UIMemoryCloudItem[] {
    assertConversationId(args.conversationId)
    const filters = [
        'pinned = 1',
        'scope_type = ?',
        'scope_id = ?',
    ]
    const params: Array<string | number> = ['conversation', args.conversationId]

    const orderBy = args.order === 'priority'
        ? 'ORDER BY priority DESC NULLS LAST, updated_at DESC'
        : 'ORDER BY updated_at DESC'
    const limitSQL = typeof args.limit === 'number' ? ' LIMIT ?' : ''
    const offsetSQL = typeof args.offset === 'number' ? ' OFFSET ?' : ''
    if (typeof args.limit === 'number') params.push(args.limit)
    if (typeof args.offset === 'number') params.push(args.offset)

    const rows = db.prepare(`
        SELECT id, type, modality, text_repr, created_at, updated_at, pinned
        FROM memory_items
        WHERE ${filters.join(' AND ')}
        ${orderBy}${limitSQL}${offsetSQL}
    `).all(...params) as Array<{
        id: string
        type: string
        modality: Modality
        text_repr?: string | null
        created_at: number
        updated_at: number
        pinned: 0 | 1
    }>

    return rows.map(r => ({
        id: r.id,
        title: r.text_repr ?? undefined,
        type: r.type,
        modality: r.modality,
        preview: undefined,
        created_at: r.created_at,
        updated_at: r.updated_at,
        pinned: r.pinned,
    }))
}

export function updateMemoryItem(
    db: Database,
    args: {
        conversationId: string
        memoryId: string
        title?: string
        tags?: unknown[]
        meta?: Record<string, unknown>
        priority?: number
        ttlAt?: number
    }
): void {
    assertConversationId(args.conversationId)
    const now = Date.now()
    db.prepare(`
        UPDATE memory_items
        SET text_repr = COALESCE(@title, text_repr),
            tags = COALESCE(@tags, tags),
            meta = COALESCE(@meta, meta),
            priority = COALESCE(@priority, priority),
            ttl_at = COALESCE(@ttl_at, ttl_at),
            updated_at = @updated_at
        WHERE id = @id
          AND scope_type = 'conversation'
          AND scope_id = @scope_id
    `).run({
        id: args.memoryId,
        scope_id: args.conversationId,
        title: args.title ?? null,
        tags: args.tags ? JSON.stringify(args.tags) : null,
        meta: args.meta ? JSON.stringify(args.meta) : null,
        priority: args.priority ?? null,
        ttl_at: args.ttlAt ?? null,
        updated_at: now,
    })
}

export function setMemoryPinned(
    db: Database,
    args: { conversationId: string; memoryId: string; pinned: boolean },
): void {
    assertConversationId(args.conversationId)
    const now = Date.now()
    db.prepare(`
        UPDATE memory_items
        SET pinned = ?, updated_at = ?
        WHERE id = ?
          AND scope_type = 'conversation'
          AND scope_id = ?
    `).run(args.pinned ? 1 : 0, now, args.memoryId, args.conversationId)
}

export function deleteMemoryItem(
    db: Database,
    args: { conversationId: string; memoryId: string },
): void {
    assertConversationId(args.conversationId)
    db.prepare(`
        DELETE FROM memory_items
        WHERE id = ?
          AND scope_type = 'conversation'
          AND scope_id = ?
    `).run(args.memoryId, args.conversationId)
}

export function retireMemoriesBySourceMessage(
    db: Database,
    args: { conversationId: string; messageId: string },
): number {
    assertConversationId(args.conversationId)
    const res = db.prepare(`
        DELETE FROM memory_items
        WHERE scope_type = 'conversation'
          AND scope_id = ?
          AND source_message_id = ?
    `).run(args.conversationId, args.messageId)
    return res.changes ?? 0
}

export function listAssets(
    db: Database,
    args: { conversationId: string },
): MemoryAssetRecord[] {
    assertConversationId(args.conversationId)
    const scope = resolveStrategyScope(db, args.conversationId)
    assertStrategyScope(scope)
    const rows = db.prepare(`
        SELECT
            a.id,
            a.memory_id,
            a.uri,
            a.storage_backend,
            a.mime_type,
            a.size_bytes,
            a.meta,
            a.created_at,
            (
                SELECT COUNT(1)
                FROM memory_chunks mc
                WHERE mc.asset_id = a.id
                  AND mc.conversation_id = a.conversation_id
                  AND mc.strategy_key = ?
                  AND mc.strategy_version = ?
            ) AS chunk_count
        FROM memory_assets a
        WHERE a.conversation_id = ?
        ORDER BY a.created_at DESC
    `).all(scope.strategyKey, scope.strategyVersion, args.conversationId) as Array<{
        id: string
        memory_id: string
        uri: string
        storage_backend: string
        mime_type?: string | null
        size_bytes?: number | null
        meta?: string | null
        created_at: number
        chunk_count?: number
    }>
    return rows.map((row) => ({
        id: row.id,
        memoryId: row.memory_id,
        uri: row.uri,
        storageBackend: row.storage_backend,
        mimeType: row.mime_type ?? null,
        sizeBytes: row.size_bytes ?? null,
        meta: row.meta ?? null,
        createdAt: row.created_at,
        chunkCount: row.chunk_count ?? 0,
    }))
}

export function deleteAsset(
    db: Database,
    args: { conversationId: string; assetId: string },
): void {
    assertConversationId(args.conversationId)
    const tx = db.transaction(() => {
        db.prepare(`
            DELETE FROM memory_vectors
            WHERE asset_id = ? AND conversation_id = ?
        `).run(args.assetId, args.conversationId)

        db.prepare(`
            DELETE FROM memory_chunk_vectors
            WHERE chunk_id IN (
                SELECT id FROM memory_chunks
                WHERE asset_id = ? AND conversation_id = ?
            )
        `).run(args.assetId, args.conversationId)

        db.prepare(`
            DELETE FROM memory_chunks
            WHERE asset_id = ? AND conversation_id = ?
        `).run(args.assetId, args.conversationId)

        db.prepare(`
            DELETE FROM memory_assets
            WHERE id = ? AND conversation_id = ?
        `).run(args.assetId, args.conversationId)
    })
    tx()
}

export function readAsset(
    db: Database,
    args: { conversationId: string; assetId: string; maxChars?: number },
): MemoryAssetDetail | null {
    assertConversationId(args.conversationId)
    const scope = resolveStrategyScope(db, args.conversationId)
    assertStrategyScope(scope)
    const row = db.prepare(`
        SELECT id, memory_id, uri, storage_backend, mime_type, size_bytes, meta, created_at
        FROM memory_assets
        WHERE id = ? AND conversation_id = ?
    `).get(args.assetId, args.conversationId) as {
        id: string
        memory_id: string
        uri: string
        storage_backend: string
        mime_type?: string | null
        size_bytes?: number | null
        meta?: string | null
        created_at: number
    } | undefined
    if (!row) return null

    const countRow = db.prepare(`
        SELECT COUNT(1) AS cnt
        FROM memory_chunks
        WHERE asset_id = ? AND conversation_id = ?
          AND strategy_key = ? AND strategy_version = ?
    `).get(args.assetId, args.conversationId, scope.strategyKey, scope.strategyVersion) as { cnt?: number } | undefined

    let text = readAssetText(db, {
        conversationId: args.conversationId,
        assetId: args.assetId,
        strategyKey: scope.strategyKey,
        strategyVersion: scope.strategyVersion,
    })
    if (typeof args.maxChars === 'number' && args.maxChars >= 0 && text) {
        if (text.length > args.maxChars) text = text.slice(0, args.maxChars)
    }

    return {
        asset: {
            id: row.id,
            memoryId: row.memory_id,
            uri: row.uri,
            storageBackend: row.storage_backend,
            mimeType: row.mime_type ?? null,
            sizeBytes: row.size_bytes ?? null,
            meta: row.meta ?? null,
            createdAt: row.created_at,
        },
        chunkCount: countRow?.cnt ?? 0,
        text,
    }
}

export function readAssetText(
    db: Database,
    args: { conversationId: string; assetId: string; strategyKey?: string; strategyVersion?: string },
): string | null {
    assertConversationId(args.conversationId)
    const scope = resolveStrategyScope(db, args.conversationId, args)
    assertStrategyScope(scope)
    const rows = db.prepare(`
        SELECT text
        FROM memory_chunks
        WHERE asset_id = ?
          AND conversation_id = ?
          AND strategy_key = ?
          AND strategy_version = ?
        ORDER BY idx ASC
    `).all(args.assetId, args.conversationId, scope.strategyKey, scope.strategyVersion) as Array<{ text: string }>
    if (!rows.length) return null
    return rows.map(r => r.text).join('\n\n')
}

export function readAssetTextAnyStrategy(
    db: Database,
    args: { conversationId: string; assetId: string },
): string | null {
    assertConversationId(args.conversationId)
    const rows = db.prepare(`
        SELECT text
        FROM memory_chunks
        WHERE asset_id = ?
          AND conversation_id = ?
        ORDER BY strategy_key, strategy_version, idx ASC
    `).all(args.assetId, args.conversationId) as Array<{ text: string }>
    if (!rows.length) return null
    return rows.map(r => r.text).join('\n\n')
}

export function updateAssetMeta(
    db: Database,
    args: { conversationId: string; assetId: string; meta: Record<string, unknown> },
): void {
    assertConversationId(args.conversationId)
    const row = db.prepare(`SELECT meta FROM memory_assets WHERE id = ? AND conversation_id = ?`)
        .get(args.assetId, args.conversationId) as { meta?: string | null } | undefined
    const next = mergeMeta(row?.meta ?? null, args.meta)
    db.prepare(`UPDATE memory_assets SET meta = ? WHERE id = ? AND conversation_id = ?`)
        .run(next, args.assetId, args.conversationId)
}

export function createAssetRecord(
    db: Database,
    args: {
        conversationId: string
        memoryId: string
        uri: string
        filename?: string
        mimeType?: string | null
        sizeBytes?: number | null
        data?: Uint8Array
        meta?: Record<string, unknown>
    },
): string {
    assertConversationId(args.conversationId)
    const assetId = `asset_${crypto.randomUUID()}`
    const hasUri = Boolean(args.uri)
    const storageBackend = hasUri ? 'file' : 'local'
    const storageUri = hasUri ? args.uri : ''
    const blob = args.data
        ? ensureAssetBlob({
            db,
            bytes: args.data,
            mimeType: args.mimeType ?? null,
            createdAt: Date.now(),
        })
        : null
    db.prepare(`
        INSERT INTO memory_assets(
            id, memory_id, conversation_id, blob_id, filename, uri, storage_backend, mime_type, size_bytes, meta, created_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
        assetId,
        args.memoryId,
        args.conversationId,
        blob?.id ?? null,
        args.filename ?? null,
        storageUri,
        storageBackend,
        args.mimeType ?? null,
        args.sizeBytes ?? null,
        args.meta ? JSON.stringify(args.meta) : null,
        Date.now()
    )
    return assetId
}
