import type { Attachment, MeasureInput, Message } from '../../../../contracts'

const TEXT_CHARS_PER_UNIT = 4
const DOCUMENT_BASE_COST = 24
const DOCUMENT_BYTES_PER_UNIT = 600
const IMAGE_BASE_COST = 160
const IMAGE_BYTES_PER_UNIT = 75_000
const AUDIO_BASE_COST = 220
const AUDIO_BYTES_PER_UNIT = 24_000
const VIDEO_BASE_COST = 320
const VIDEO_BYTES_PER_UNIT = 120_000
const UNKNOWN_ATTACHMENT_BASE_COST = 48
const UNKNOWN_ATTACHMENT_BYTES_PER_UNIT = 1_000

function isRecord(value: unknown): value is Record<string, unknown> {
    return Boolean(value && typeof value === 'object')
}

type AttachmentLike = {
    id: string
    name: string
    size: number
    modality?: unknown
}

function isAttachmentLike(value: unknown): value is AttachmentLike {
    if (!isRecord(value)) return false
    return typeof value.id === 'string'
        && typeof value.name === 'string'
        && typeof value.size === 'number'
        && Number.isFinite(value.size)
}

function toAttachment(input: AttachmentLike): Attachment | (Omit<Attachment, 'modality'> & { modality: string }) {
    const modality = input.modality
    return {
        id: input.id,
        name: input.name,
        size: input.size,
        modality: typeof modality === 'string' ? modality : 'unknown',
    } as Attachment | (Omit<Attachment, 'modality'> & { modality: string })
}

function isAttachmentArray(value: unknown): value is AttachmentLike[] {
    return Array.isArray(value) && value.every(isAttachmentLike)
}

function isMessage(value: unknown): value is Message {
    if (!isRecord(value)) return false
    const role = value.role
    if (role !== 'user' && role !== 'assistant' && role !== 'system' && role !== 'tool') return false
    const content = value.content
    if (typeof content !== 'string' && content !== null) return false
    if (typeof value.attachments === 'undefined') return true
    return isAttachmentArray(value.attachments)
}

function estimateTextCost(text: string | null | undefined): number {
    if (typeof text !== 'string') return 0
    const normalized = text.trim()
    if (!normalized) return 0
    return Math.max(1, Math.ceil(normalized.length / TEXT_CHARS_PER_UNIT))
}

function estimateAttachmentCost(attachment: Attachment | (Omit<Attachment, 'modality'> & { modality: string })): number {
    const size = Number.isFinite(attachment.size) && attachment.size > 0 ? attachment.size : 0
    switch (attachment.modality) {
        case 'document':
            return DOCUMENT_BASE_COST + Math.ceil(size / DOCUMENT_BYTES_PER_UNIT)
        case 'image':
            return IMAGE_BASE_COST + Math.ceil(size / IMAGE_BYTES_PER_UNIT)
        case 'audio':
            return AUDIO_BASE_COST + Math.ceil(size / AUDIO_BYTES_PER_UNIT)
        case 'video':
            return VIDEO_BASE_COST + Math.ceil(size / VIDEO_BYTES_PER_UNIT)
        default:
            return UNKNOWN_ATTACHMENT_BASE_COST + Math.ceil(size / UNKNOWN_ATTACHMENT_BYTES_PER_UNIT)
    }
}

function estimateMessageCost(message: Message): number {
    return estimateTextCost(message.content) + estimateMeasureInput(message.attachments)
}

export function estimateMeasureInput(input: unknown): number {
    if (input == null) return 0
    if (typeof input === 'string') return estimateTextCost(input)
    if (Array.isArray(input)) {
        return input.reduce((sum, item) => sum + estimateMeasureInput(item), 0)
    }
    if (isAttachmentLike(input)) {
        return estimateAttachmentCost(toAttachment(input))
    }
    if (isMessage(input)) {
        return estimateMessageCost(input)
    }
    return 0
}

export function measure(input: MeasureInput): number {
    return estimateMeasureInput(input)
}
