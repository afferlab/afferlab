export type TurnAttachmentKind = 'image' | 'audio' | 'video' | 'document' | 'file'
export type TurnAttachmentStatus = 'uploading' | 'ready' | 'error'
export type AssetIngestionState = 'idle' | 'picking' | 'uploading' | 'ready' | 'failed' | 'canceled'
export type AttachmentSourceKind = 'electronPath' | 'browserFile' | 'memoryAsset' | 'unknown'
export type AttachmentReadBranchName =
    | 'storageKey_ok'
    | 'materialize_from_filePath'
    | 'use_data'
    | 'missing_bytes_and_paths'
    | 'storage_key_missing_file'
    | 'fs_read_error'

export type AttachmentReadDiagnostics = {
    reason?:
        | 'write_not_completed'
        | 'storage_key_missing'
        | 'storage_key_invalid_or_file_missing'
        | 'storage_key_missing_file'
        | 'fs_read_error'
        | 'unsupported_storage_backend'
        | 'path_only_without_blob'
        | 'prepare_failed'
        | 'data_missing'
        | 'missing_bytes_and_paths'
    branchName?: AttachmentReadBranchName
    sourceKind?: AttachmentSourceKind
    hasPath?: boolean
    filePath?: string
    storageKey?: string
    assetId?: string
    bytesLength?: number
    exists?: boolean
    fsErrorCode?: string
    stagingResolved?: boolean
    message?: string
    stack?: string
}

export interface TurnAttachment {
    id: string
    name: string
    mimeType: string
    ext?: string
    size: number
    kind: TurnAttachmentKind
    data?: Uint8Array
    filePath?: string
    storageKey?: string
    assetId?: string
    providerFileId?: string
    sourceKind?: AttachmentSourceKind
    hasPath?: boolean
    status?: TurnAttachmentStatus
    ready?: boolean
    ingestionState?: AssetIngestionState
    errorCode?: string
    errorMessage?: string
    previewUrl?: string
    readDiagnostics?: AttachmentReadDiagnostics
}

export type PrepareAttachmentPayload = {
    name: string
    mimeType?: string
    ext?: string
    sourceKind?: AttachmentSourceKind
    filePath?: string
    bytes?: Uint8Array | ArrayBuffer | number[]
}

export type PrepareAttachmentResult = {
    assetId: string
    storageKey: string
    bytesLength: number
    sourceKind: AttachmentSourceKind
    hasPath: boolean
    filePath?: string
}
