import crypto from 'node:crypto'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import type { Database } from 'better-sqlite3'
import type { AttachmentReadDiagnostics, MessageContentPart, TurnAttachment, UIMessage } from '../../../contracts/index'
import { messageTextFromParts, parseMessageContentParts } from '../../../shared/chat/contentParts'
import { normalizeMessage } from '../../llm/adapters/messageParts'
import { normalizeAttachmentExt } from './attachmentPolicy'
import { resolveReadableAttachment } from './readableAttachment'
import { log } from '../logging/runtimeLogger'

type AssetRow = {
    id: string
    filename?: string | null
    uri?: string | null
    storage_backend?: string | null
    mime_type?: string | null
    size_bytes?: number | null
    meta?: string | null
    blob_bytes?: Buffer | Uint8Array | null
}

type ParsedAssetMeta = {
    filename?: string
    name?: string
    ingest_status?: string
}

type AssetHydrateInfo = {
    name?: string
    mimeType?: string
    size?: number
    storageKey?: string
    data?: Uint8Array
    readDiagnostics?: AttachmentReadDiagnostics
}

function parseAssetMeta(meta?: string | null): ParsedAssetMeta {
    if (!meta) return {}
    try {
        const parsed = JSON.parse(meta) as { filename?: unknown; name?: unknown; ingest_status?: unknown }
        return {
            filename: typeof parsed.filename === 'string' && parsed.filename.trim() ? parsed.filename.trim() : undefined,
            name: typeof parsed.name === 'string' && parsed.name.trim() ? parsed.name.trim() : undefined,
            ingest_status: typeof parsed.ingest_status === 'string' && parsed.ingest_status.trim()
                ? parsed.ingest_status.trim()
                : undefined,
        }
    } catch {
        return {}
    }
}

function logHydrateIssue(tag: string, details: Record<string, unknown>): void {
    log('warn', '[ATTACH][hydrate_issue]', { tag, ...details })
}

function logReplayHydrate(assetId: string, storageKey: string | undefined, bytesLength: number): void {
    log('debug', '[ATTACH][replay_hydrate]', {
        assetId,
        storageKey: storageKey ?? null,
        bytesLength,
    }, { debugFlag: 'DEBUG_ATTACHMENTS' })
}

function readHydrateStorage(storageKey: string): Uint8Array {
    const bytes = fs.readFileSync(storageKey)
    return new Uint8Array(bytes)
}

function writeHydrateStaging(args: {
    filename?: string
    ext?: string
    bytes: Uint8Array
}): { assetId: string; storageKey: string; bytesLength: number } {
    const assetId = `hydrate_${crypto.randomUUID()}`
    const rawExt = (args.ext ?? path.extname(args.filename ?? '')).replace(/^\./, '')
    const safeExt = rawExt.trim().toLowerCase()
    const fileName = safeExt ? `${assetId}.${safeExt}` : assetId
    const dir = path.join(os.tmpdir(), 'afferlab-hydrate-staging')
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true })
    const storageKey = path.join(dir, fileName)
    fs.writeFileSync(storageKey, Buffer.from(args.bytes))
    return {
        assetId,
        storageKey,
        bytesLength: args.bytes.byteLength,
    }
}

function loadAsset(
    db: Database,
    conversationId: string,
    assetId: string,
): AssetHydrateInfo | null {
    const row = db.prepare(`
        SELECT
            ma.id,
            ma.filename,
            ma.uri,
            ma.storage_backend,
            ma.mime_type,
            ma.size_bytes,
            ma.meta,
            ab.bytes AS blob_bytes
        FROM memory_assets
        LEFT JOIN asset_blobs ab ON ab.id = ma.blob_id
        WHERE ma.id = ? AND ma.conversation_id = ?
        LIMIT 1
    `).get(assetId, conversationId) as AssetRow | undefined
    if (!row) return null

    const parsedMeta = parseAssetMeta(row.meta)
    const storageKey = typeof row.uri === 'string' && row.uri.trim().length > 0
        ? row.uri.trim()
        : undefined
    const info: AssetHydrateInfo = {
        name: row.filename ?? parsedMeta.filename ?? parsedMeta.name,
        mimeType: row.mime_type ?? undefined,
        size: typeof row.size_bytes === 'number' ? row.size_bytes : undefined,
        storageKey,
        data: row.blob_bytes
            ? new Uint8Array(
                row.blob_bytes instanceof Uint8Array
                    ? row.blob_bytes
                    : Buffer.from(row.blob_bytes),
            )
            : undefined,
    }

    if (row.storage_backend !== 'file' && !info.data) {
        info.readDiagnostics = {
            reason: 'unsupported_storage_backend',
            storageKey,
            exists: false,
        }
        return info
    }

    if (!storageKey) {
        info.readDiagnostics = {
            reason: 'storage_key_missing',
            storageKey,
            exists: false,
        }
        logHydrateIssue('storage key missing', {
            conversationId,
            assetId,
            storageBackend: row.storage_backend,
        })
        return info
    }
    return info
}

function partToAttachment(part: Extract<MessageContentPart, { type: 'file' | 'image' }>): TurnAttachment {
    return {
        id: part.assetId,
        assetId: part.assetId,
        storageKey: part.storageKey,
        filePath: part.storageKey,
        name: part.name,
        mimeType: part.mimeType,
        ext: normalizeAttachmentExt(undefined, part.name),
        size: part.size,
        kind: part.type === 'image' ? 'image' : 'file',
        data: part.data,
        status: part.status,
        ready: part.status !== 'uploading' && part.status !== 'error',
        sourceKind: 'memoryAsset',
        hasPath: typeof part.storageKey === 'string' && part.storageKey.trim().length > 0,
        readDiagnostics: part.readDiagnostics,
    }
}

function fromResolvedAttachment(
    part: Extract<MessageContentPart, { type: 'file' | 'image' }>,
    attachment: TurnAttachment,
): Extract<MessageContentPart, { type: 'file' | 'image' }> {
    return {
        ...part,
        storageKey: attachment.storageKey ?? part.storageKey,
        size: attachment.size ?? part.size,
        data: attachment.data ?? part.data,
        readDiagnostics: attachment.readDiagnostics ?? part.readDiagnostics,
    }
}

function hydrateViaReadableResolver(args: {
    part: Extract<MessageContentPart, { type: 'file' | 'image' }>
    resolvedStorageKey?: string
    stagingResolved: boolean
}): {
    ok: boolean
    part: Extract<MessageContentPart, { type: 'file' | 'image' }>
} {
    const attachment = partToAttachment(args.part)
    const resolved = resolveReadableAttachment({
        attachment,
        canonicalAssetId: args.part.assetId,
        resolvedStorageKey: args.resolvedStorageKey,
        stagingResolved: args.stagingResolved,
        normalizeAttachmentExt,
        readAttachmentStaging: readHydrateStorage,
        writeAttachmentStaging: writeHydrateStaging,
    })
    if (resolved.ok) {
        const next = fromResolvedAttachment(args.part, resolved.attachment)
        const bytesLength = next.data?.byteLength ?? 0
        logReplayHydrate(args.part.assetId, next.storageKey, bytesLength)
        return { ok: true, part: next }
    }
    return {
        ok: false,
        part: fromResolvedAttachment(args.part, resolved.attachment),
    }
}

function hydrateParts(
    db: Database,
    conversationId: string,
    parts: MessageContentPart[],
    cache: Map<string, AssetHydrateInfo | null>,
): MessageContentPart[] {
    return parts.map((part) => {
        if (part.type === 'text') return part
        if (part.data && part.data.length > 0) return part
        const directResolved = hydrateViaReadableResolver({
            part,
            resolvedStorageKey: part.storageKey,
            stagingResolved: false,
        })
        if (directResolved.ok) return directResolved.part
        const cached = cache.has(part.assetId)
            ? cache.get(part.assetId) ?? null
            : (() => {
                const loaded = loadAsset(db, conversationId, part.assetId)
                cache.set(part.assetId, loaded)
                return loaded
            })()
        if (!cached) return directResolved.part
        const merged = {
            ...part,
            name: cached.name ?? part.name,
            mimeType: cached.mimeType ?? part.mimeType,
            size: cached.size ?? part.size,
            data: part.data ?? cached.data,
            storageKey: part.storageKey ?? cached.storageKey,
            readDiagnostics: cached.readDiagnostics ?? part.readDiagnostics,
        }
        const resolvedFromAsset = hydrateViaReadableResolver({
            part: merged,
            resolvedStorageKey: merged.storageKey,
            stagingResolved: false,
        })
        if (!resolvedFromAsset.ok && resolvedFromAsset.part.readDiagnostics?.branchName == null) {
            resolvedFromAsset.part.readDiagnostics = {
                ...resolvedFromAsset.part.readDiagnostics,
                branchName: 'missing_bytes_and_paths',
                reason: resolvedFromAsset.part.readDiagnostics?.reason ?? 'missing_bytes_and_paths',
                assetId: resolvedFromAsset.part.assetId,
                storageKey: resolvedFromAsset.part.storageKey,
            }
        }
        if (!resolvedFromAsset.ok) {
            logHydrateIssue('resolver failed', {
                conversationId,
                assetId: resolvedFromAsset.part.assetId,
                storageKey: resolvedFromAsset.part.storageKey ?? null,
                branchName: resolvedFromAsset.part.readDiagnostics?.branchName ?? null,
                reason: resolvedFromAsset.part.readDiagnostics?.reason ?? null,
            })
        }
        return resolvedFromAsset.part
    })
}

export function hydrateMessagePartsWithAssetData(args: {
    db: Database
    conversationId: string
    messages: UIMessage[]
}): UIMessage[] {
    const cache = new Map<string, AssetHydrateInfo | null>()
    return args.messages.map((message) => {
        const normalized = normalizeMessage(message)
        const parts = parseMessageContentParts(normalized.contentParts, normalized.content)
        if (parts.length === 0) return normalized
        const hydrated = hydrateParts(args.db, args.conversationId, parts, cache)
        return {
            ...normalized,
            content: messageTextFromParts(hydrated, normalized.content),
            contentParts: hydrated,
        }
    })
}
