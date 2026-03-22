import { randomUUID, createHash } from 'node:crypto'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import type { Database } from 'better-sqlite3'
import type { MessageContentPart, TurnAttachment, UIMessage } from '../../../contracts/index'
import { getMessageParts, normalizeMessage } from '../../llm/adapters/messageParts'
import { normalizeAttachmentExt } from './attachmentPolicy'
import { resolveReadableAttachment } from './readableAttachment'
import { AttachmentCapabilityError } from './validateAttachmentsBeforeSend'
import { log } from '../logging/runtimeLogger'
import { selectAssetBlobByAssetId, selectAssetBlobBySha } from '../memory/assetUpsert'

export type ProviderFileRef = {
    id: string
    blobId: string
    providerKey: string
    accountFingerprint: string
    providerFileId: string
    createdAt: number
    lastUsedAt: number
}

type AssetBlobRef = {
    id: string
    sha256: string
}

export interface RemoteFileStore {
    upload(bytes: Uint8Array, mime: string, filename: string): Promise<{ fileId: string }>
    getByBlobId(blobId: string): ProviderFileRef | null
    save(ref: { blobId: string; providerFileId: string }): ProviderFileRef
    invalidateByBlobId(blobId: string): number
}

type OpenAIFileStoreArgs = {
    db: Database
    providerKey: string
    accountFingerprint: string
    apiKey: string
    baseUrl: string
    signal?: AbortSignal
}

function hashHex(input: string | Uint8Array): string {
    return createHash('sha256').update(input).digest('hex')
}

function readProviderStorage(storageKey: string): Uint8Array {
    return new Uint8Array(fs.readFileSync(storageKey))
}

function writeProviderStaging(args: {
    filename?: string
    ext?: string
    bytes: Uint8Array
}): { assetId: string; storageKey: string; bytesLength: number } {
    const assetId = `provider_${randomUUID()}`
    const rawExt = (args.ext ?? path.extname(args.filename ?? '')).replace(/^\./, '')
    const safeExt = rawExt.trim().toLowerCase()
    const fileName = safeExt ? `${assetId}.${safeExt}` : assetId
    const dir = path.join(os.tmpdir(), 'afferlab-provider-file-staging')
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true })
    const storageKey = path.join(dir, fileName)
    fs.writeFileSync(storageKey, Buffer.from(args.bytes))
    return { assetId, storageKey, bytesLength: args.bytes.byteLength }
}

function normalizeBaseUrl(value: string): string {
    return value.trim().replace(/\/+$/, '')
}

function resolveBlobForAssetId(db: Database, assetId: string): AssetBlobRef | null {
    if (typeof assetId !== 'string' || !assetId.trim()) return null
    const row = selectAssetBlobByAssetId(db, assetId.trim())
    if (!row) return null
    return {
        id: row.id,
        sha256: row.sha256,
    }
}

function resolveBlobForPart(args: {
    db: Database
    part: Extract<MessageContentPart, { type: 'file' | 'image' }>
}): AssetBlobRef | null {
    const fromAssetId = resolveBlobForAssetId(args.db, args.part.assetId)
    if (fromAssetId) return fromAssetId
    const bytes = args.part.data
    if (!bytes || bytes.byteLength <= 0) return null
    const sha256 = hashHex(bytes)
    const blob = selectAssetBlobBySha(args.db, sha256)
    if (!blob) return null
    return {
        id: blob.id,
        sha256: blob.sha256,
    }
}

export function buildProviderRefScope(args: {
    providerId: string
    apiKey?: string
    baseUrl?: string
}): { providerKey: string; accountFingerprint: string } | null {
    if (args.providerId !== 'openai') return null
    const apiKey = typeof args.apiKey === 'string' ? args.apiKey.trim() : ''
    if (!apiKey) return null
    const baseUrl = normalizeBaseUrl(args.baseUrl || 'https://api.openai.com/v1')
    return {
        providerKey: `openai:${baseUrl}`,
        accountFingerprint: hashHex(apiKey).slice(0, 32),
    }
}

class OpenAIFileStore implements RemoteFileStore {
    private readonly db: Database
    private readonly providerKey: string
    private readonly accountFingerprint: string
    private readonly apiKey: string
    private readonly baseUrl: string
    private readonly signal?: AbortSignal

    constructor(args: OpenAIFileStoreArgs) {
        this.db = args.db
        this.providerKey = args.providerKey
        this.accountFingerprint = args.accountFingerprint
        this.apiKey = args.apiKey
        this.baseUrl = normalizeBaseUrl(args.baseUrl)
        this.signal = args.signal
    }

    async upload(bytes: Uint8Array, mime: string, filename: string): Promise<{ fileId: string }> {
        const form = new FormData()
        form.append('purpose', 'assistants')
        form.append('file', new Blob([Buffer.from(bytes)], { type: mime || 'application/octet-stream' }), filename || 'attachment')
        const res = await fetch(`${this.baseUrl}/files`, {
            method: 'POST',
            headers: {
                Authorization: `Bearer ${this.apiKey}`,
            },
            body: form,
            signal: this.signal,
        })
        if (!res.ok) {
            const body = await res.text()
            throw new Error(`OpenAI file upload failed: ${res.status} ${res.statusText} ${body.slice(0, 240)}`)
        }
        const payload = await res.json() as { id?: unknown }
        if (typeof payload.id !== 'string' || !payload.id.trim()) {
            throw new Error('OpenAI file upload failed: missing file id')
        }
        return { fileId: payload.id.trim() }
    }

    getByBlobId(blobId: string): ProviderFileRef | null {
        const row = this.db.prepare(`
            SELECT id, blob_id, provider_key, account_fingerprint, provider_file_id, created_at, last_used_at
            FROM provider_file_refs
            WHERE provider_key = ? AND account_fingerprint = ? AND blob_id = ?
            LIMIT 1
        `).get(this.providerKey, this.accountFingerprint, blobId) as {
            id: string
            blob_id: string
            provider_key: string
            account_fingerprint: string
            provider_file_id: string
            created_at: number
            last_used_at: number
        } | undefined
        if (!row) return null
        const now = Date.now()
        this.db.prepare(`
            UPDATE provider_file_refs
            SET last_used_at = ?
            WHERE id = ?
        `).run(now, row.id)
        return {
            id: row.id,
            blobId: row.blob_id,
            providerKey: row.provider_key,
            accountFingerprint: row.account_fingerprint,
            providerFileId: row.provider_file_id,
            createdAt: row.created_at,
            lastUsedAt: now,
        }
    }

    save(ref: { blobId: string; providerFileId: string }): ProviderFileRef {
        const now = Date.now()
        const id = randomUUID()
        this.db.prepare(`
            INSERT INTO provider_file_refs (
                id, blob_id, provider_key, account_fingerprint, provider_file_id, created_at, last_used_at
            ) VALUES (?, ?, ?, ?, ?, ?, ?)
            ON CONFLICT(provider_key, account_fingerprint, blob_id)
            DO UPDATE SET provider_file_id = excluded.provider_file_id, last_used_at = excluded.last_used_at
        `).run(
            id,
            ref.blobId,
            this.providerKey,
            this.accountFingerprint,
            ref.providerFileId,
            now,
            now,
        )
        const row = this.getByBlobId(ref.blobId)
        if (row) return row
        return {
            id,
            blobId: ref.blobId,
            providerKey: this.providerKey,
            accountFingerprint: this.accountFingerprint,
            providerFileId: ref.providerFileId,
            createdAt: now,
            lastUsedAt: now,
        }
    }

    invalidateByBlobId(blobId: string): number {
        const result = this.db.prepare(`
            DELETE FROM provider_file_refs
            WHERE provider_key = ? AND account_fingerprint = ? AND blob_id = ?
        `).run(this.providerKey, this.accountFingerprint, blobId) as { changes?: number }
        return typeof result?.changes === 'number' ? result.changes : 0
    }
}

function toAttachment(part: Extract<MessageContentPart, { type: 'file' | 'image' }>): TurnAttachment {
    return {
        id: part.assetId,
        assetId: part.assetId,
        storageKey: part.storageKey,
        filePath: part.storageKey,
        name: part.name || part.assetId,
        mimeType: part.mimeType || 'application/octet-stream',
        ext: normalizeAttachmentExt(undefined, part.name),
        size: Number.isFinite(part.size) ? part.size : 0,
        kind: part.type === 'image' ? 'image' : 'file',
        data: part.data,
        status: part.status,
        ready: part.status !== 'uploading' && part.status !== 'error',
        sourceKind: 'memoryAsset',
        hasPath: Boolean(part.storageKey),
        readDiagnostics: part.readDiagnostics,
    }
}

function ensureReadableAttachment(part: Extract<MessageContentPart, { type: 'file' | 'image' }>): TurnAttachment {
    const attachment = toAttachment(part)
    const resolved = resolveReadableAttachment({
        attachment,
        canonicalAssetId: part.assetId,
        resolvedStorageKey: part.storageKey,
        stagingResolved: false,
        normalizeAttachmentExt,
        readAttachmentStaging: readProviderStorage,
        writeAttachmentStaging: writeProviderStaging,
    })
    if (resolved.ok) return resolved.attachment
    throw new Error(`AttachmentReadFailed:${resolved.branchName}:${resolved.reason}:${attachment.name}`)
}

function buildAttachmentUploadError(args: {
    part: Extract<MessageContentPart, { type: 'file' | 'image' }>
    providerId: string
    modelId: string
    selectedModelId?: string
    selectedProviderId?: string
    cause: unknown
}): AttachmentCapabilityError {
    const causeMessage = args.cause instanceof Error ? args.cause.message : String(args.cause)
    const readDiag = args.part.readDiagnostics
    const size = Number.isFinite(args.part.size) ? args.part.size : 0
    return new AttachmentCapabilityError(
        'AttachmentUploadFailed',
        `Failed to upload attachment: ${args.part.name}`,
        {
            modelId: args.modelId,
            provider: args.providerId,
            selectedModelId: args.selectedModelId ?? args.modelId,
            selectedProviderId: args.selectedProviderId ?? args.providerId,
            attachmentCount: 1,
            supportedMimeTypes: [],
            violations: [{
                code: 'AttachmentUploadFailed',
                attachmentId: args.part.assetId,
                fileName: args.part.name,
                mimeType: args.part.mimeType,
                size,
                reason: 'provider_upload_failed',
                branchName: readDiag?.branchName ?? 'provider_upload_failed',
                sourceKind: 'memoryAsset',
                hasPath: Boolean(args.part.storageKey),
                filePath: readDiag?.filePath,
                storageKey: args.part.storageKey ?? readDiag?.storageKey,
                assetId: args.part.assetId,
                bytesLength: args.part.data?.byteLength ?? readDiag?.bytesLength,
                exists: readDiag?.exists,
                fsErrorCode: readDiag?.fsErrorCode,
                stagingResolved: readDiag?.stagingResolved,
                message: causeMessage,
                stack: args.cause instanceof Error ? args.cause.stack : undefined,
            }],
        },
    )
}

export function createRemoteFileStore(args: {
    db: Database
    providerId: string
    baseUrl?: string
    apiKey?: string
    signal?: AbortSignal
}): RemoteFileStore | null {
    if (args.providerId !== 'openai') return null
    const apiKey = typeof args.apiKey === 'string' ? args.apiKey.trim() : ''
    if (!apiKey) throw new Error('API key missing for provider file upload')
    const baseUrl = normalizeBaseUrl(args.baseUrl || 'https://api.openai.com/v1')
    const scope = buildProviderRefScope({
        providerId: args.providerId,
        apiKey,
        baseUrl,
    })
    if (!scope) throw new Error('Unable to resolve provider file scope')
    return new OpenAIFileStore({
        db: args.db,
        providerKey: scope.providerKey,
        accountFingerprint: scope.accountFingerprint,
        apiKey,
        baseUrl,
        signal: args.signal,
    })
}

export async function invalidateProviderFileRefsForMessages(args: {
    db: Database
    providerId: string
    apiKey?: string
    baseUrl?: string
    messages: UIMessage[]
    signal?: AbortSignal
}): Promise<{ invalidatedCount: number; shaCount: number }> {
    let store: RemoteFileStore | null = null
    try {
        store = createRemoteFileStore({
            db: args.db,
            providerId: args.providerId,
            apiKey: args.apiKey,
            baseUrl: args.baseUrl,
            signal: args.signal,
        })
    } catch {
        store = null
    }
    if (!store) return { invalidatedCount: 0, shaCount: 0 }
    const blobIds = new Set<string>()
    for (const message of args.messages) {
        const normalized = normalizeMessage(message)
        const parts = getMessageParts(normalized)
        for (const part of parts) {
            if (part.type !== 'file' && part.type !== 'image') continue
            const blob = resolveBlobForPart({ db: args.db, part })
            if (blob?.id) blobIds.add(blob.id)
        }
    }
    let invalidatedCount = 0
    for (const blobId of blobIds) {
        invalidatedCount += store.invalidateByBlobId(blobId)
    }
    return {
        invalidatedCount,
        shaCount: blobIds.size,
    }
}

export async function resolveProviderFileRef(args: {
    db: Database
    store: RemoteFileStore
    part: Extract<MessageContentPart, { type: 'file' | 'image' }>
    providerId: string
    modelId: string
    selectedModelId?: string
    selectedProviderId?: string
}): Promise<{ fileId: string; blobId: string; blobSha256: string; reused: boolean; hydrated: TurnAttachment }> {
    try {
        const hydrated = ensureReadableAttachment(args.part)
        const bytes = hydrated.data ?? new Uint8Array()
        if (bytes.byteLength <= 0) {
            const branchName = hydrated.readDiagnostics?.branchName ?? 'missing_bytes_and_paths'
            throw new Error(`AttachmentReadFailed:${branchName}:missing_bytes_and_paths:${hydrated.name}`)
        }
        const blob = resolveBlobForPart({
            db: args.db,
            part: {
                ...args.part,
                data: bytes,
            },
        })
        if (!blob) {
            throw new Error(`AttachmentBlobMissing:${args.part.assetId}`)
        }
        const hit = args.store.getByBlobId(blob.id)
        if (hit) {
            return {
                fileId: hit.providerFileId,
                blobId: blob.id,
                blobSha256: blob.sha256,
                reused: true,
                hydrated,
            }
        }
        const uploaded = await args.store.upload(bytes, hydrated.mimeType, hydrated.name)
        args.store.save({
            blobId: blob.id,
            providerFileId: uploaded.fileId,
        })
        return {
            fileId: uploaded.fileId,
            blobId: blob.id,
            blobSha256: blob.sha256,
            reused: false,
            hydrated,
        }
    } catch (error) {
        if (error instanceof AttachmentCapabilityError) throw error
        throw buildAttachmentUploadError({
            part: args.part,
            providerId: args.providerId,
            modelId: args.modelId,
            selectedModelId: args.selectedModelId,
            selectedProviderId: args.selectedProviderId,
            cause: error,
        })
    }
}

export async function attachProviderFileIdsToMessages(args: {
    db: Database
    providerId: string
    modelId?: string
    selectedModelId?: string
    selectedProviderId?: string
    apiKey?: string
    baseUrl?: string
    messages: UIMessage[]
    signal?: AbortSignal
    resolveProviderFileRefImpl?: typeof resolveProviderFileRef
}): Promise<UIMessage[]> {
    const resolveImpl = args.resolveProviderFileRefImpl ?? resolveProviderFileRef
    let store: RemoteFileStore | null = null
    try {
        store = createRemoteFileStore({
            db: args.db,
            providerId: args.providerId,
            apiKey: args.apiKey,
            baseUrl: args.baseUrl,
            signal: args.signal,
        })
    } catch (error) {
        throw new AttachmentCapabilityError(
            'AttachmentUploadFailed',
            'Failed to upload attachment.',
            {
                modelId: args.modelId ?? args.selectedModelId ?? 'unknown',
                provider: args.providerId,
                selectedModelId: args.selectedModelId ?? args.modelId ?? 'unknown',
                selectedProviderId: args.selectedProviderId ?? args.providerId,
                attachmentCount: 0,
                supportedMimeTypes: [],
                violations: [{
                    code: 'AttachmentUploadFailed',
                    message: error instanceof Error ? error.message : String(error),
                }],
            },
        )
    }
    if (!store) return args.messages
    const out: UIMessage[] = []
    for (const message of args.messages) {
        const normalized = normalizeMessage(message)
        const parts = getMessageParts(normalized)
        if (!parts.some((part) => part.type === 'file' || part.type === 'image')) {
            out.push(normalized)
            continue
        }
        const nextParts: MessageContentPart[] = []
        for (const part of parts) {
            if (part.type !== 'file' && part.type !== 'image') {
                nextParts.push(part)
                continue
            }
            const resolved = await resolveImpl({
                db: args.db,
                store,
                part,
                providerId: args.providerId,
                modelId: args.modelId ?? args.selectedModelId ?? 'unknown',
                selectedModelId: args.selectedModelId ?? args.modelId ?? 'unknown',
                selectedProviderId: args.selectedProviderId ?? args.providerId,
            })
            log('debug', '[PROVIDER_FILE_REFS][bind]', {
                assetId: part.assetId ?? null,
                blobId: resolved.blobId,
                sha256: resolved.blobSha256,
                fileId: resolved.fileId,
                reused: resolved.reused,
            }, { debugFlag: 'DEBUG_ATTACHMENTS' })
            nextParts.push({
                ...part,
                storageKey: resolved.hydrated.storageKey ?? part.storageKey,
                size: resolved.hydrated.size ?? part.size,
                data: resolved.hydrated.data ?? part.data,
                readDiagnostics: resolved.hydrated.readDiagnostics ?? part.readDiagnostics,
                providerFileId: resolved.fileId,
            })
        }
        out.push({
            ...normalized,
            contentParts: nextParts,
        })
    }
    return out
}
