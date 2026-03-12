import type { LLMModelConfig, TurnAttachment } from '../../../contracts/index'
import { DEFAULT_ATTACHMENT_LIMITS, mimeMatchesAllowlist, normalizeAttachmentExt, normalizeAttachmentMime } from './attachmentPolicy'
import { validateAttachmentsByPolicy } from './attachmentPolicy'
import { resolveAttachmentType } from './attachmentTypeRegistry'
import { log } from '../logging/runtimeLogger'

export type AttachmentCapabilityErrorCode =
    | 'UnsupportedAttachmentType'
    | 'AttachmentTooLarge'
    | 'TooManyAttachments'
    | 'ModelDoesNotSupportFiles'
    | 'UploadingInProgress'
    | 'AttachmentUploading'
    | 'AttachmentUploadFailed'
    | 'AttachmentReadFailed'

export type AttachmentValidationViolation = {
    code: AttachmentCapabilityErrorCode
    traceId?: string
    attachmentId?: string
    fileName?: string
    mimeType?: string
    size?: number
    reason?: string
    branchName?: string
    sourceKind?: string
    hasPath?: boolean
    filePath?: string
    storageKey?: string
    assetId?: string
    bytesLength?: number
    exists?: boolean
    fsErrorCode?: string
    stagingResolved?: boolean
    message: string
    stack?: string
}

export type AttachmentValidationDetails = {
    modelId: string
    provider: string
    origin?: 'turn' | 'history'
    selectedModelId?: string
    selectedProviderId?: string
    attachmentTransport?: string
    attachmentCount: number
    supportedMimeTypes: string[]
    maxFileSizeMB?: number
    maxFilesPerTurn?: number
    violations: AttachmentValidationViolation[]
}

export class AttachmentCapabilityError extends Error {
    code: AttachmentCapabilityErrorCode
    details: AttachmentValidationDetails

    constructor(code: AttachmentCapabilityErrorCode, message: string, details: AttachmentValidationDetails) {
        super(message)
        this.name = 'AttachmentCapabilityError'
        this.code = code
        this.details = details
    }
}

function toBytes(maxFileSizeMB?: number): number | null {
    if (!Number.isFinite(maxFileSizeMB) || (maxFileSizeMB ?? 0) <= 0) return null
    return Math.floor((maxFileSizeMB as number) * 1024 * 1024)
}

export function isAttachmentUploadingLike(attachment: Pick<TurnAttachment, 'status' | 'ingestionState'>): boolean {
    return attachment.status === 'uploading'
        || attachment.ingestionState === 'picking'
        || attachment.ingestionState === 'uploading'
}

export function guardAttachmentsUploadReady<T>(args: {
    modelId: string
    provider: string
    attachments: TurnAttachment[]
    selectedModelId?: string
    selectedProviderId?: string
    run: () => T
}): T {
    const uploading = args.attachments.find((item) => isAttachmentUploadingLike(item))
    if (!uploading) return args.run()
    throw new AttachmentCapabilityError(
        'AttachmentUploading',
        `Attachment is still uploading: ${uploading.name}`,
        {
            modelId: args.modelId,
            provider: args.provider,
            selectedModelId: args.selectedModelId ?? 'not resolved',
            selectedProviderId: args.selectedProviderId ?? 'not resolved',
            attachmentCount: args.attachments.length,
            supportedMimeTypes: [],
            violations: [{
                code: 'AttachmentUploading',
                attachmentId: uploading.id,
                fileName: uploading.name,
                mimeType: uploading.mimeType,
                size: uploading.size,
                message: `Attachment is still uploading: ${uploading.name}`,
            }],
        },
    )
}

function buildDetails(model: LLMModelConfig, attachments: TurnAttachment[]): AttachmentValidationDetails {
    return {
        modelId: model.id,
        provider: model.provider,
        attachmentTransport: model.capabilities?.attachmentTransport,
        attachmentCount: attachments.length,
        supportedMimeTypes: model.capabilities?.supportedMimeTypes ?? [],
        maxFileSizeMB: model.capabilities?.maxFileSizeMB,
        maxFilesPerTurn: model.capabilities?.maxFilesPerTurn,
        violations: [],
    }
}

function throwWithFirst(details: AttachmentValidationDetails): never {
    const first = details.violations[0]
    if (first?.code === 'AttachmentReadFailed') {
        log('error', '[ATTACH][read_failed]', {
            modelId: details.modelId,
            provider: details.provider,
            origin: details.origin ?? null,
            selectedModelId: details.selectedModelId ?? 'not resolved',
            selectedProviderId: details.selectedProviderId ?? 'not resolved',
            attachmentTransport: details.attachmentTransport,
            attachmentId: first.attachmentId ?? null,
            sourceKind: first.sourceKind ?? null,
            hasPath: typeof first.hasPath === 'boolean' ? first.hasPath : null,
            fileName: first.fileName ?? null,
            filePath: first.filePath ?? null,
            storageKey: first.storageKey ?? null,
            assetId: first.assetId ?? null,
            bytesLength: typeof first.bytesLength === 'number' ? first.bytesLength : null,
            exists: typeof first.exists === 'boolean' ? first.exists : null,
            fsErrorCode: first.fsErrorCode ?? null,
            stagingResolved: typeof first.stagingResolved === 'boolean' ? first.stagingResolved : null,
            reason: first.reason ?? null,
            branchName: first.branchName ?? null,
            message: first.message ?? null,
            stack: first.stack ?? null,
            traceId: first.traceId ?? null,
        })
    }
    const code = first?.code ?? 'UnsupportedAttachmentType'
    const message = first?.message ?? 'Attachment validation failed'
    throw new AttachmentCapabilityError(code, message, details)
}

export function validateAttachmentsByModelCapabilities(args: {
    model: LLMModelConfig
    attachments: TurnAttachment[]
    origin?: 'turn' | 'history'
    selectedModelId?: string
    selectedProviderId?: string
}): void {
    const { model, attachments } = args
    if (!attachments.length) return

    const details = buildDetails(model, attachments)
    details.origin = args.origin
    details.selectedModelId = args.selectedModelId ?? 'not resolved'
    details.selectedProviderId = args.selectedProviderId ?? 'not resolved'
    const caps = model.capabilities ?? {}
    const transport = caps.attachmentTransport ?? (caps.nativeFiles === true ? 'remote_file_id' : 'none')
    if (caps.nativeFiles !== true || transport === 'none') {
        details.violations.push({
            code: 'ModelDoesNotSupportFiles',
            message: 'Model does not support native attachment transport',
        })
        throwWithFirst(details)
    }
    if (transport !== 'remote_file_id' && transport !== 'inline_base64' && transport !== 'inline_parts') {
        details.violations.push({
            code: 'ModelDoesNotSupportFiles',
            reason: 'transport_not_implemented',
            message: `Attachment transport is not implemented: ${transport}`,
        })
        throwWithFirst(details)
    }

    const maxFilesPerTurn = caps.maxFilesPerTurn
    if (Number.isFinite(maxFilesPerTurn) && (maxFilesPerTurn as number) > 0 && attachments.length > (maxFilesPerTurn as number)) {
        details.violations.push({
            code: 'TooManyAttachments',
            message: `Too many attachments (${attachments.length}/${maxFilesPerTurn})`,
        })
        throwWithFirst(details)
    }

    const supportedMimeTypes = caps.supportedMimeTypes ?? []
    const shouldEnforceMimeAllowlist = transport !== 'remote_file_id'
    const maxBytes = toBytes(caps.maxFileSizeMB)
    for (const attachment of attachments) {
        if (!attachment.data || attachment.data.length === 0) {
            const readDiag = attachment.readDiagnostics
            const reason = readDiag?.reason ?? 'asset_unreadable'
            const detailHint = [
                readDiag?.storageKey ? `storageKey=${readDiag.storageKey}` : null,
                readDiag?.filePath ? `filePath=${readDiag.filePath}` : null,
                typeof readDiag?.exists === 'boolean' ? `exists=${String(readDiag.exists)}` : null,
                readDiag?.fsErrorCode ? `fsErrorCode=${readDiag.fsErrorCode}` : null,
            ].filter(Boolean).join(', ')
            details.violations.push({
                code: 'AttachmentReadFailed',
                attachmentId: attachment.id,
                traceId: (attachment as { traceId?: string }).traceId,
                fileName: attachment.name,
                mimeType: attachment.mimeType,
                size: attachment.size,
                reason,
                branchName: readDiag?.branchName ?? 'missing_bytes_and_paths',
                sourceKind: attachment.sourceKind ?? readDiag?.sourceKind,
                hasPath: attachment.hasPath ?? readDiag?.hasPath ?? Boolean(attachment.filePath ?? readDiag?.filePath),
                filePath: readDiag?.filePath,
                storageKey: attachment.storageKey ?? readDiag?.storageKey,
                assetId: attachment.assetId ?? attachment.id ?? readDiag?.assetId,
                bytesLength: attachment.data?.byteLength ?? readDiag?.bytesLength,
                exists: readDiag?.exists,
                fsErrorCode: readDiag?.fsErrorCode,
                stagingResolved: readDiag?.stagingResolved,
                message: detailHint
                    ? `Attachment is not ready: ${attachment.name} (${detailHint})`
                    : `Attachment is not ready: ${attachment.name}`,
            })
            throwWithFirst(details)
        }
        const ext = normalizeAttachmentExt(attachment.ext, attachment.name)
        const mimeType = normalizeAttachmentMime(attachment.mimeType, ext, attachment.name)
        const platformType = resolveAttachmentType({
            mimeType,
            ext,
            fileName: attachment.name,
        })
        if (!platformType) {
            details.violations.push({
                code: 'UnsupportedAttachmentType',
                attachmentId: attachment.id,
                fileName: attachment.name,
                mimeType,
                size: attachment.size,
                reason: 'platform_not_supported',
                message: `Unsupported file type on this platform: ${attachment.name}`,
            })
            throwWithFirst(details)
        }
        if (shouldEnforceMimeAllowlist && !mimeMatchesAllowlist(mimeType, supportedMimeTypes)) {
            details.violations.push({
                code: 'UnsupportedAttachmentType',
                attachmentId: attachment.id,
                fileName: attachment.name,
                mimeType,
                size: attachment.size,
                reason: 'provider_not_supported',
                message: `Current model does not support ${platformType.kind}: ${mimeType}`,
            })
            throwWithFirst(details)
        }
        if (maxBytes != null && attachment.size > maxBytes) {
            details.violations.push({
                code: 'AttachmentTooLarge',
                attachmentId: attachment.id,
                fileName: attachment.name,
                mimeType,
                size: attachment.size,
                message: `Attachment too large for model: ${attachment.name}`,
            })
            throwWithFirst(details)
        }
    }
}

export function summarizeAttachmentError(error: AttachmentCapabilityError): string {
    switch (error.code) {
        case 'UploadingInProgress':
            return 'Wait for uploads to finish.'
        case 'AttachmentUploading':
            return 'Attachment is still uploading.'
        case 'AttachmentReadFailed':
            return 'Failed to prepare attachment.'
        case 'AttachmentUploadFailed':
            return 'Failed to upload attachment.'
        case 'ModelDoesNotSupportFiles':
            return 'Current model does not support file attachments.'
        case 'TooManyAttachments':
            return 'Too many attachments for this turn.'
        case 'AttachmentTooLarge':
            return 'Attachment exceeds model file size limit.'
        case 'UnsupportedAttachmentType':
            return 'Current model does not support this file type.'
        default:
            return 'Attachment validation failed.'
    }
}

export function validateAttachmentsBeforeSend(args: {
    model: LLMModelConfig
    attachments: TurnAttachment[]
    origin?: 'turn' | 'history'
    selectedModelId?: string
    selectedProviderId?: string
}): void {
    const { model, attachments } = args
    if (!attachments.length) return

    const details = buildDetails(model, attachments)
    details.origin = args.origin
    details.selectedModelId = args.selectedModelId ?? 'not resolved'
    details.selectedProviderId = args.selectedProviderId ?? 'not resolved'
    guardAttachmentsUploadReady({
        modelId: model.id,
        provider: model.provider,
        attachments,
        selectedModelId: details.selectedModelId,
        selectedProviderId: details.selectedProviderId,
        run: () => undefined,
    })
    const unreadable = attachments.find((item) => !item.data || item.data.length === 0)
    if (unreadable) {
        const readDiag = unreadable.readDiagnostics
        const reason = readDiag?.reason ?? 'attachment_not_ready'
        const detailHint = [
            readDiag?.storageKey ? `storageKey=${readDiag.storageKey}` : null,
            readDiag?.filePath ? `filePath=${readDiag.filePath}` : null,
            typeof readDiag?.exists === 'boolean' ? `exists=${String(readDiag.exists)}` : null,
            readDiag?.fsErrorCode ? `fsErrorCode=${readDiag.fsErrorCode}` : null,
        ].filter(Boolean).join(', ')
        details.violations = [{
            code: 'AttachmentReadFailed',
            attachmentId: unreadable.id,
            fileName: unreadable.name,
            mimeType: unreadable.mimeType,
            size: unreadable.size,
            reason,
            branchName: readDiag?.branchName ?? 'missing_bytes_and_paths',
            sourceKind: unreadable.sourceKind ?? readDiag?.sourceKind,
            hasPath: unreadable.hasPath ?? readDiag?.hasPath ?? Boolean(unreadable.filePath ?? readDiag?.filePath),
            filePath: readDiag?.filePath,
            storageKey: unreadable.storageKey ?? readDiag?.storageKey,
            assetId: unreadable.assetId ?? unreadable.id ?? readDiag?.assetId,
            bytesLength: unreadable.data?.byteLength ?? readDiag?.bytesLength,
            exists: readDiag?.exists,
            fsErrorCode: readDiag?.fsErrorCode,
            stagingResolved: readDiag?.stagingResolved,
            message: detailHint
                ? `Attachment is not ready: ${unreadable.name} (${detailHint})`
                : `Attachment is not ready: ${unreadable.name}`,
        }]
        throwWithFirst(details)
    }

    const policyViolations = validateAttachmentsByPolicy(attachments, {
        maxFilesPerTurn: DEFAULT_ATTACHMENT_LIMITS.maxFilesPerTurn,
        maxFileSizeMB: DEFAULT_ATTACHMENT_LIMITS.maxFileSizeMB,
    })
    if (policyViolations.length > 0) {
        details.violations = policyViolations.map((item) => ({
            ...item,
        }))
        throwWithFirst(details)
    }

    validateAttachmentsByModelCapabilities({
        model,
        attachments,
        selectedModelId: args.selectedModelId,
        selectedProviderId: args.selectedProviderId,
    })
}
