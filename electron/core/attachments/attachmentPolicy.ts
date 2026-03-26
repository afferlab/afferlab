import type { TurnAttachment } from '../../../contracts/index'
import {
    DEFAULT_ATTACHMENT_LIMITS,
    EXT_TO_MIME_FALLBACK,
    GLOBAL_SUPPORTED_MIME_TYPES,
    getAttachmentKind,
    getAttachmentUI,
    isMimeSupported,
    mimeMatchesAllowlist,
    normalizeAttachmentExt,
    normalizeAttachmentMime,
} from '../../../shared/attachments/attachmentPolicy'
import { isPlatformAttachmentSupported } from './attachmentTypeRegistry'

export {
    DEFAULT_ATTACHMENT_LIMITS,
    EXT_TO_MIME_FALLBACK,
    GLOBAL_SUPPORTED_MIME_TYPES,
    getAttachmentKind,
    getAttachmentUI,
    isMimeSupported,
    mimeMatchesAllowlist,
    normalizeAttachmentExt,
    normalizeAttachmentMime,
}

export type PolicyViolationCode =
    | 'UnsupportedAttachmentType'
    | 'AttachmentTooLarge'
    | 'TooManyAttachments'

export type PolicyViolation = {
    code: PolicyViolationCode
    attachmentId?: string
    fileName?: string
    mimeType?: string
    size?: number
    message: string
}

export function validateAttachmentsByPolicy(
    attachments: TurnAttachment[],
    limits: { maxFilesPerTurn?: number; maxFileSizeMB?: number } = DEFAULT_ATTACHMENT_LIMITS,
): PolicyViolation[] {
    if (!attachments.length) return []

    const violations: PolicyViolation[] = []
    const maxFilesPerTurn = limits.maxFilesPerTurn ?? DEFAULT_ATTACHMENT_LIMITS.maxFilesPerTurn
    const maxFileSizeMB = limits.maxFileSizeMB ?? DEFAULT_ATTACHMENT_LIMITS.maxFileSizeMB
    const maxBytes = Number.isFinite(maxFileSizeMB) && maxFileSizeMB > 0
        ? Math.floor(maxFileSizeMB * 1024 * 1024)
        : null

    if (Number.isFinite(maxFilesPerTurn) && maxFilesPerTurn > 0 && attachments.length > maxFilesPerTurn) {
        violations.push({
            code: 'TooManyAttachments',
            message: `Too many attachments (${attachments.length}/${maxFilesPerTurn})`,
        })
    }

    for (const attachment of attachments) {
        const ext = normalizeAttachmentExt(attachment.ext, attachment.name)
        const mimeType = normalizeAttachmentMime(attachment.mimeType, ext, attachment.name)
        if (!isPlatformAttachmentSupported({
            mimeType,
            ext,
            fileName: attachment.name,
        })) {
            violations.push({
                code: 'UnsupportedAttachmentType',
                attachmentId: attachment.id,
                fileName: attachment.name,
                mimeType,
                size: attachment.size,
                message: `Unsupported mime type: ${mimeType}`,
            })
            continue
        }
        if (maxBytes != null && attachment.size > maxBytes) {
            violations.push({
                code: 'AttachmentTooLarge',
                attachmentId: attachment.id,
                fileName: attachment.name,
                mimeType,
                size: attachment.size,
                message: `Attachment too large: ${attachment.name}`,
            })
        }
    }

    return violations
}
