import fs from 'node:fs'
import type { TurnAttachment } from '../../../contracts/index'

export type ResolveReadableAttachmentResult =
    | {
        ok: true
        branchName: 'storageKey_ok' | 'materialize_from_filePath' | 'use_data'
        attachment: TurnAttachment
    }
    | {
        ok: false
        branchName: 'missing_bytes_and_paths' | 'storage_key_missing_file' | 'fs_read_error'
        reason: string
        codeMessage: string
        attachment: TurnAttachment
    }

export function resolveReadableAttachment(args: {
    attachment: TurnAttachment
    canonicalAssetId: string
    resolvedStorageKey?: string
    stagingResolved: boolean
    normalizeAttachmentExt: (ext?: string, name?: string) => string
    readAttachmentStaging: (storageKey: string) => Uint8Array
    writeAttachmentStaging: (input: { filename?: string; ext?: string; bytes: Uint8Array }) => {
        assetId: string
        storageKey: string
        bytesLength: number
    }
    existsSync?: (target: string) => boolean
    readFileSync?: (target: string) => Buffer
}): ResolveReadableAttachmentResult {
    const attachment = args.attachment
    const readDiag = attachment.readDiagnostics
    const existsSync = args.existsSync ?? fs.existsSync
    const readFileSyncImpl = args.readFileSync ?? fs.readFileSync
    const sourceKind = attachment.sourceKind ?? readDiag?.sourceKind ?? 'unknown'
    const hasPath = attachment.hasPath ?? readDiag?.hasPath ?? Boolean(attachment.filePath ?? readDiag?.filePath)
    const filePath = attachment.filePath ?? readDiag?.filePath
    const storageKey = args.resolvedStorageKey ?? attachment.storageKey ?? readDiag?.storageKey

    if (args.resolvedStorageKey) {
        const exists = existsSync(args.resolvedStorageKey)
        if (!exists) {
            return {
                ok: false,
                branchName: 'storage_key_missing_file',
                reason: 'storage_key_missing_file',
                codeMessage: `Attachment storage key not found: ${attachment.name}`,
                attachment: {
                    ...attachment,
                    id: args.canonicalAssetId,
                    assetId: args.canonicalAssetId,
                    storageKey: args.resolvedStorageKey,
                    readDiagnostics: {
                        ...readDiag,
                        branchName: 'storage_key_missing_file',
                        reason: 'storage_key_missing_file',
                        sourceKind,
                        hasPath,
                        filePath,
                        storageKey: args.resolvedStorageKey,
                        assetId: args.canonicalAssetId,
                        exists: false,
                        stagingResolved: args.stagingResolved,
                    },
                },
            }
        }
        try {
            const data = args.readAttachmentStaging(args.resolvedStorageKey)
            return {
                ok: true,
                branchName: 'storageKey_ok',
                attachment: {
                    ...attachment,
                    id: args.canonicalAssetId,
                    assetId: args.canonicalAssetId,
                    storageKey: args.resolvedStorageKey,
                    data,
                    size: attachment.size || data.byteLength,
                    readDiagnostics: {
                        ...readDiag,
                        branchName: 'storageKey_ok',
                        sourceKind,
                        hasPath,
                        filePath,
                        storageKey: args.resolvedStorageKey,
                        assetId: args.canonicalAssetId,
                        exists: true,
                        bytesLength: data.byteLength,
                        stagingResolved: args.stagingResolved,
                    },
                },
            }
        } catch (error) {
            const fsError = error as NodeJS.ErrnoException
            return {
                ok: false,
                branchName: 'fs_read_error',
                reason: 'fs_read_error',
                codeMessage: `Failed to read attachment storage: ${attachment.name}`,
                attachment: {
                    ...attachment,
                    id: args.canonicalAssetId,
                    assetId: args.canonicalAssetId,
                    storageKey: args.resolvedStorageKey,
                    readDiagnostics: {
                        ...readDiag,
                        branchName: 'fs_read_error',
                        reason: 'fs_read_error',
                        sourceKind,
                        hasPath,
                        filePath,
                        storageKey: args.resolvedStorageKey,
                        assetId: args.canonicalAssetId,
                        exists: true,
                        fsErrorCode: typeof fsError?.code === 'string' ? fsError.code : undefined,
                        message: fsError?.message ?? String(error),
                        stack: fsError?.stack,
                        stagingResolved: args.stagingResolved,
                    },
                },
            }
        }
    }

    if (filePath) {
        const exists = existsSync(filePath)
        if (exists) {
            try {
                const fromPath = new Uint8Array(readFileSyncImpl(filePath))
                const ext = args.normalizeAttachmentExt(attachment.ext, attachment.name)
                const staged = args.writeAttachmentStaging({
                    filename: attachment.name,
                    ext,
                    bytes: fromPath,
                })
                const data = args.readAttachmentStaging(staged.storageKey)
                return {
                    ok: true,
                    branchName: 'materialize_from_filePath',
                    attachment: {
                        ...attachment,
                        id: args.canonicalAssetId,
                        assetId: args.canonicalAssetId,
                        storageKey: staged.storageKey,
                        data,
                        size: attachment.size || data.byteLength,
                        readDiagnostics: {
                            ...readDiag,
                            branchName: 'materialize_from_filePath',
                            reason: 'storage_key_missing',
                            sourceKind,
                            hasPath: true,
                            filePath,
                            storageKey: staged.storageKey,
                            assetId: args.canonicalAssetId,
                            exists: true,
                            bytesLength: data.byteLength,
                            stagingResolved: true,
                        },
                    },
                }
            } catch (error) {
                const fsError = error as NodeJS.ErrnoException
                return {
                    ok: false,
                    branchName: 'fs_read_error',
                    reason: 'fs_read_error',
                    codeMessage: `Failed to read attachment path: ${attachment.name}`,
                    attachment: {
                        ...attachment,
                        id: args.canonicalAssetId,
                        assetId: args.canonicalAssetId,
                        storageKey,
                        readDiagnostics: {
                            ...readDiag,
                            branchName: 'fs_read_error',
                            reason: 'fs_read_error',
                            sourceKind,
                            hasPath: true,
                            filePath,
                            storageKey,
                            assetId: args.canonicalAssetId,
                            exists: true,
                            fsErrorCode: typeof fsError?.code === 'string' ? fsError.code : undefined,
                            message: fsError?.message ?? String(error),
                            stack: fsError?.stack,
                            stagingResolved: args.stagingResolved,
                        },
                    },
                }
            }
        }
    }

    if (attachment.data && attachment.data.byteLength > 0) {
        return {
            ok: true,
            branchName: 'use_data',
            attachment: {
                ...attachment,
                id: args.canonicalAssetId,
                assetId: args.canonicalAssetId,
                size: attachment.size || attachment.data.byteLength,
                readDiagnostics: {
                    ...readDiag,
                    branchName: 'use_data',
                    sourceKind,
                    hasPath,
                    filePath,
                    storageKey,
                    assetId: args.canonicalAssetId,
                    bytesLength: attachment.data.byteLength,
                    exists: filePath ? existsSync(filePath) : readDiag?.exists,
                    stagingResolved: args.stagingResolved,
                },
            },
        }
    }

    return {
        ok: false,
        branchName: 'missing_bytes_and_paths',
        reason: 'missing_bytes_and_paths',
        codeMessage: `Attachment has no readable bytes: ${attachment.name}`,
        attachment: {
            ...attachment,
            id: args.canonicalAssetId,
            assetId: args.canonicalAssetId,
            storageKey,
            readDiagnostics: {
                ...readDiag,
                branchName: 'missing_bytes_and_paths',
                reason: 'missing_bytes_and_paths',
                sourceKind,
                hasPath,
                filePath,
                storageKey,
                assetId: args.canonicalAssetId,
                bytesLength: attachment.data?.byteLength ?? readDiag?.bytesLength,
                exists: filePath ? existsSync(filePath) : readDiag?.exists,
                stagingResolved: args.stagingResolved,
                message: 'storageKey/filePath/data are all unavailable at send-time',
            },
        },
    }
}
