import type { AttachmentSourceKind, PrepareAttachmentPayload, TurnAttachment } from '@contracts'
import {
    getAttachmentKind,
    normalizeAttachmentExt,
    normalizeAttachmentMime,
} from '@shared/attachments/attachmentPolicy'

export type DraftTurnAttachment = TurnAttachment

export type IngestAssetInput = {
    files?: FileList | File[] | null
    assetRefs?: DraftTurnAttachment[]
}

export type IngestAssetsForTurnArgs = {
    input: IngestAssetInput
    onAppend: (items: DraftTurnAttachment[]) => void
    onUpdate: (attachmentId: string, patch: Partial<DraftTurnAttachment>) => void
}

type FileWithPath = File & { path?: string }

function normalizeFiles(input: FileList | File[] | null | undefined): File[] {
    if (!input) return []
    if (Array.isArray(input)) return input
    return Array.from(input)
}

export function isAttachmentUploadingForTurn(
    attachment: Pick<DraftTurnAttachment, 'status' | 'ingestionState'>,
): boolean {
    return attachment.status === 'uploading'
        || attachment.ingestionState === 'picking'
        || attachment.ingestionState === 'uploading'
}

function detectSourceKind(file: File): { sourceKind: AttachmentSourceKind; hasPath: boolean; filePath?: string } {
    const maybePath = (file as FileWithPath).path
    const filePath = typeof maybePath === 'string' && maybePath.trim().length > 0
        ? maybePath.trim()
        : undefined
    if (filePath) {
        return { sourceKind: 'electronPath', hasPath: true, filePath }
    }
    return { sourceKind: 'browserFile', hasPath: false }
}

function createSeed(file: File): DraftTurnAttachment {
    const id = `att_${crypto.randomUUID()}`
    const ext = normalizeAttachmentExt(undefined, file.name)
    const mimeType = normalizeAttachmentMime(file.type, ext, file.name)
    const kind = getAttachmentKind(mimeType, ext)
    const source = detectSourceKind(file)
    return {
        id,
        name: file.name || 'attachment',
        mimeType,
        ext,
        size: file.size,
        kind,
        sourceKind: source.sourceKind,
        hasPath: source.hasPath,
        filePath: source.filePath,
        status: 'uploading',
        ready: false,
        ingestionState: 'picking',
        previewUrl: kind === 'image' ? URL.createObjectURL(file) : undefined,
    }
}

async function prepareAttachmentFromFile(file: File, seed: DraftTurnAttachment): Promise<{
    stagedAssetId: string
    stagedStorageKey: string
    stagedBytesLength: number
    sourceKind: AttachmentSourceKind
    hasPath: boolean
    filePath?: string
}> {
    const source = detectSourceKind(file)
    const payload: PrepareAttachmentPayload = {
        name: seed.name,
        mimeType: seed.mimeType,
        ext: seed.ext,
        sourceKind: source.sourceKind,
        filePath: source.filePath,
    }

    if (source.sourceKind === 'browserFile') {
        payload.bytes = new Uint8Array(await file.arrayBuffer())
    } else {
        // Keep bytes fallback for electronPath sources so drag/drop and picker behave consistently
        // even when browser-provided path is not readable in main process.
        payload.bytes = new Uint8Array(await file.arrayBuffer())
    }

    const staged = await window.chatAPI.prepareAttachment(payload)
    return {
        stagedAssetId: staged.assetId,
        stagedStorageKey: staged.storageKey,
        stagedBytesLength: staged.bytesLength,
        sourceKind: staged.sourceKind,
        hasPath: staged.hasPath,
        filePath: staged.filePath,
    }
}

function readErrorCode(error: unknown): string | undefined {
    if (!error || typeof error !== 'object') return undefined
    const detail = (error as { detail?: unknown }).detail
    if (detail && typeof detail === 'object' && typeof (detail as { code?: unknown }).code === 'string') {
        return (detail as { code: string }).code
    }
    return undefined
}

function readErrorMessage(error: unknown): string {
    if (error instanceof Error && error.message.trim()) return error.message
    return 'Failed to prepare attachment'
}

function readErrorDiagnostics(error: unknown, seed: DraftTurnAttachment) {
    if (!error || typeof error !== 'object') {
        return {
            sourceKind: seed.sourceKind ?? 'unknown',
            hasPath: seed.hasPath ?? Boolean(seed.filePath),
            filePath: seed.filePath,
            reason: 'prepare_failed' as const,
            message: readErrorMessage(error),
        }
    }
    const detail = (error as { detail?: unknown }).detail
    if (!detail || typeof detail !== 'object') {
        return {
            sourceKind: seed.sourceKind ?? 'unknown',
            hasPath: seed.hasPath ?? Boolean(seed.filePath),
            filePath: seed.filePath,
            reason: 'prepare_failed' as const,
            message: readErrorMessage(error),
        }
    }
    const record = detail as Record<string, unknown>
    return {
        sourceKind: typeof record.sourceKind === 'string' ? (record.sourceKind as AttachmentSourceKind) : (seed.sourceKind ?? 'unknown'),
        hasPath: typeof record.hasPath === 'boolean' ? record.hasPath : (seed.hasPath ?? Boolean(seed.filePath)),
        filePath: typeof record.path === 'string' ? record.path : seed.filePath,
        storageKey: typeof record.storageKey === 'string' ? record.storageKey : undefined,
        assetId: typeof record.assetId === 'string' ? record.assetId : undefined,
        bytesLength: typeof record.bytesLength === 'number' ? record.bytesLength : undefined,
        exists: typeof record.exists === 'boolean' ? record.exists : undefined,
        fsErrorCode: typeof record.fsErrorCode === 'string' ? record.fsErrorCode : undefined,
        message: typeof record.message === 'string' ? record.message : readErrorMessage(error),
        stack: typeof record.stack === 'string' ? record.stack : undefined,
        reason: 'prepare_failed' as const,
    }
}

export async function ingestAssetsForTurn(args: IngestAssetsForTurnArgs): Promise<void> {
    const files = normalizeFiles(args.input.files)
    const refs = Array.isArray(args.input.assetRefs) ? args.input.assetRefs : []
    if (files.length === 0 && refs.length === 0) return

    if (refs.length > 0) {
        args.onAppend(refs.map((item) => ({
            ...item,
            assetId: item.assetId ?? item.id,
            status: item.status ?? 'ready',
            ready: item.ready ?? true,
            ingestionState: item.ingestionState ?? 'ready',
        })))
    }

    if (files.length === 0) return

    const seeds = files.map(createSeed)
    args.onAppend(seeds)

    for (let i = 0; i < files.length; i += 1) {
        const seed = seeds[i]
        const file = files[i]
        args.onUpdate(seed.id, { ingestionState: 'uploading', status: 'uploading', ready: false })
        try {
            const staged = await prepareAttachmentFromFile(file, seed)
            args.onUpdate(seed.id, {
                assetId: staged.stagedAssetId,
                storageKey: staged.stagedStorageKey,
                sourceKind: staged.sourceKind,
                hasPath: staged.hasPath,
                filePath: staged.filePath,
                size: staged.stagedBytesLength,
                status: 'ready',
                ready: true,
                ingestionState: 'ready',
                errorCode: undefined,
                errorMessage: undefined,
                readDiagnostics: {
                    sourceKind: staged.sourceKind,
                    hasPath: staged.hasPath,
                    filePath: staged.filePath,
                    assetId: staged.stagedAssetId,
                    storageKey: staged.stagedStorageKey,
                    bytesLength: staged.stagedBytesLength,
                    exists: true,
                },
            })
        } catch (error) {
            const diagnostics = readErrorDiagnostics(error, seed)
            args.onUpdate(seed.id, {
                status: 'error',
                ready: false,
                ingestionState: 'failed',
                errorCode: readErrorCode(error) ?? 'AttachmentReadFailed',
                errorMessage: readErrorMessage(error),
                readDiagnostics: diagnostics,
            })
        }
    }
}
