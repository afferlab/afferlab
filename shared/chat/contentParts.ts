import type {
    AttachmentReadBranchName,
    AttachmentReadDiagnostics,
    TurnAttachmentStatus,
} from '../../contracts/attachment'

export type MessageTextPart = {
    type: 'text'
    text: string
}

export type MessageFilePart = {
    type: 'file' | 'image'
    assetId: string
    // runtime-only provider native file reference (never persisted)
    providerFileId?: string
    storageKey?: string
    name: string
    mimeType: string
    size: number
    status?: TurnAttachmentStatus
    width?: number
    height?: number
    duration?: number
    // runtime-only hydration field (never persisted)
    data?: Uint8Array
    // runtime-only diagnostics field (never persisted)
    readDiagnostics?: AttachmentReadDiagnostics
}

export type MessageContentPart = MessageTextPart | MessageFilePart

type PartRecord = Record<string, unknown>
type AttachmentReadReason = NonNullable<AttachmentReadDiagnostics['reason']>
type AttachmentReadBranch = NonNullable<AttachmentReadBranchName>

const ATTACHMENT_READ_REASONS: Set<AttachmentReadReason> = new Set([
    'write_not_completed',
    'storage_key_missing',
    'storage_key_invalid_or_file_missing',
    'storage_key_missing_file',
    'fs_read_error',
    'unsupported_storage_backend',
    'path_only_without_blob',
    'prepare_failed',
    'data_missing',
    'missing_bytes_and_paths',
])

const ATTACHMENT_READ_BRANCHES: Set<AttachmentReadBranch> = new Set([
    'storageKey_ok',
    'materialize_from_filePath',
    'use_data',
    'missing_bytes_and_paths',
    'storage_key_missing_file',
    'fs_read_error',
])

function toAttachmentReadReason(value: unknown): AttachmentReadReason | undefined {
    if (typeof value !== 'string') return undefined
    return ATTACHMENT_READ_REASONS.has(value as AttachmentReadReason)
        ? (value as AttachmentReadReason)
        : undefined
}

function toAttachmentReadBranch(value: unknown): AttachmentReadBranch | undefined {
    if (typeof value !== 'string') return undefined
    return ATTACHMENT_READ_BRANCHES.has(value as AttachmentReadBranch)
        ? (value as AttachmentReadBranch)
        : undefined
}

function asRecord(value: unknown): PartRecord | null {
    if (!value || typeof value !== 'object') return null
    return value as PartRecord
}

function toNumber(value: unknown): number | null {
    if (typeof value !== 'number') return null
    if (!Number.isFinite(value)) return null
    return value
}

function normalizeTextPart(value: unknown): MessageTextPart | null {
    const rec = asRecord(value)
    if (!rec) return null
    if (rec.type !== 'text') return null
    if (typeof rec.text !== 'string') return null
    return { type: 'text', text: rec.text }
}

function normalizeFilePart(value: unknown): MessageFilePart | null {
    const rec = asRecord(value)
    if (!rec) return null
    const type = rec.type === 'image' ? 'image' : rec.type === 'file' ? 'file' : null
    if (!type) return null
    if (typeof rec.assetId !== 'string' || !rec.assetId.trim()) return null
    const name = typeof rec.name === 'string' && rec.name.trim() ? rec.name.trim() : rec.assetId
    const storageKey = typeof rec.storageKey === 'string' && rec.storageKey.trim()
        ? rec.storageKey.trim()
        : undefined
    const mimeType = typeof rec.mimeType === 'string' && rec.mimeType.trim()
        ? rec.mimeType.trim()
        : 'application/octet-stream'
    const providerFileId = typeof rec.providerFileId === 'string' && rec.providerFileId.trim()
        ? rec.providerFileId.trim()
        : undefined
    const size = toNumber(rec.size) ?? 0
    const status = rec.status === 'uploading' || rec.status === 'ready' || rec.status === 'error'
        ? rec.status
        : undefined
    const width = toNumber(rec.width) ?? undefined
    const height = toNumber(rec.height) ?? undefined
    const duration = toNumber(rec.duration) ?? undefined
    const data = rec.data instanceof Uint8Array
        ? rec.data
        : (Array.isArray(rec.data) && rec.data.every((item) => typeof item === 'number'))
            ? Uint8Array.from(rec.data as number[])
            : undefined
    const diagnosticsRaw = rec.readDiagnostics
    const diagnostics = diagnosticsRaw && typeof diagnosticsRaw === 'object'
        ? {
            reason: toAttachmentReadReason((diagnosticsRaw as { reason?: unknown }).reason),
            branchName: toAttachmentReadBranch((diagnosticsRaw as { branchName?: unknown }).branchName),
            filePath: typeof (diagnosticsRaw as { filePath?: unknown }).filePath === 'string'
                ? (diagnosticsRaw as { filePath: string }).filePath
                : undefined,
            storageKey: typeof (diagnosticsRaw as { storageKey?: unknown }).storageKey === 'string'
                ? (diagnosticsRaw as { storageKey: string }).storageKey
                : undefined,
            exists: typeof (diagnosticsRaw as { exists?: unknown }).exists === 'boolean'
                ? (diagnosticsRaw as { exists: boolean }).exists
                : undefined,
            fsErrorCode: typeof (diagnosticsRaw as { fsErrorCode?: unknown }).fsErrorCode === 'string'
                ? (diagnosticsRaw as { fsErrorCode: string }).fsErrorCode
                : undefined,
            stagingResolved: typeof (diagnosticsRaw as { stagingResolved?: unknown }).stagingResolved === 'boolean'
                ? (diagnosticsRaw as { stagingResolved: boolean }).stagingResolved
                : undefined,
        }
        : undefined

    return {
        type,
        assetId: rec.assetId.trim(),
        providerFileId,
        storageKey,
        name,
        mimeType,
        size,
        status,
        width,
        height,
        duration,
        data,
        readDiagnostics: diagnostics,
    }
}

function normalizeFromUnknown(value: unknown): MessageContentPart[] {
    if (!Array.isArray(value)) return []
    const out: MessageContentPart[] = []
    for (const item of value) {
        const text = normalizeTextPart(item)
        if (text) {
            out.push(text)
            continue
        }
        const file = normalizeFilePart(item)
        if (file) out.push(file)
    }
    return out
}

export function parseMessageContentParts(
    raw: unknown,
    fallbackText?: string | null,
): MessageContentPart[] {
    const fallback = typeof fallbackText === 'string' ? fallbackText : ''
    if (Array.isArray(raw)) {
        const parsed = normalizeFromUnknown(raw)
        if (parsed.length > 0) return parsed
    }
    if (typeof raw === 'string' && raw.trim().length > 0) {
        try {
            const parsed = normalizeFromUnknown(JSON.parse(raw))
            if (parsed.length > 0) return parsed
        } catch {
            // not a JSON parts array
        }
    }
    if (fallback.length > 0) return [{ type: 'text', text: fallback }]
    return []
}

export function serializeMessageContentParts(parts: MessageContentPart[] | undefined | null): string | null {
    if (!Array.isArray(parts) || parts.length === 0) return null
    const safe = parts.map((part) => {
        if (part.type === 'text') {
            return { type: 'text' as const, text: part.text }
        }
        return {
            type: part.type,
            assetId: part.assetId,
            storageKey: part.storageKey,
            name: part.name,
            mimeType: part.mimeType,
            size: part.size,
            status: part.status,
            width: part.width,
            height: part.height,
            duration: part.duration,
        }
    })
    return JSON.stringify(safe)
}

export function messageTextFromParts(parts: MessageContentPart[] | undefined | null, fallbackText?: string | null): string {
    if (Array.isArray(parts) && parts.length > 0) {
        const chunks = parts
            .filter((part): part is MessageTextPart => part.type === 'text')
            .map((part) => part.text)
        if (chunks.length > 0) return chunks.join('\n').trim()
        return ''
    }
    return typeof fallbackText === 'string' ? fallbackText : ''
}

export function hasFileParts(parts: MessageContentPart[] | undefined | null): boolean {
    if (!Array.isArray(parts) || parts.length === 0) return false
    return parts.some((part) => part.type === 'file' || part.type === 'image')
}
