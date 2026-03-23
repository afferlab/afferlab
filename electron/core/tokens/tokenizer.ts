import type { MessageContentPart } from '../../../contracts/index'
import { parseMessageContentParts } from '../../../shared/chat/contentParts'

export type AttachmentTokenEstimate = {
    textTokens: number
    attachmentTokens: number
    safetyMarginTokens: number
    totalTokens: number
    attachmentCount: number
}

type TokenizableMessage = {
    content?: string | null
    parts?: unknown
    contentParts?: unknown
    attachments?: Array<{ name?: string; assetId?: string }>
}

const DEFAULT_NON_TEXT_ATTACHMENT_TOKENS = Number(process.env.ATTACHMENT_NON_TEXT_TOKEN_BUDGET ?? 1200)
const DEFAULT_SAFETY_MARGIN_RATIO = Number(process.env.ATTACHMENT_TOKEN_SAFETY_MARGIN ?? 0.15)

function normalizeParts(message: TokenizableMessage): MessageContentPart[] {
    const fallback = typeof message.content === 'string' ? message.content : ''
    const rawParts = Array.isArray(message.parts) ? message.parts : message.contentParts
    return parseMessageContentParts(rawParts, fallback)
}

function estimateBinaryPartTokens(part: Extract<MessageContentPart, { type: 'file' | 'image' }>): number {
    const mime = (part.mimeType || '').toLowerCase()
    const size = Number.isFinite(part.size) ? Math.max(0, part.size) : 0

    if (mime.startsWith('text/') || mime.includes('json') || mime.includes('xml') || mime.includes('csv') || mime.includes('markdown')) {
        const approxChars = Math.max(0, Math.floor(size * 0.8))
        return Math.max(64, estimateTokens('x'.repeat(Math.min(8000, approxChars))))
    }
    if (mime === 'application/pdf') {
        const fromSize = Math.floor(size / 80)
        return Math.max(900, Math.min(12000, fromSize || 1800))
    }
    if (mime.startsWith('image/')) return Math.max(600, DEFAULT_NON_TEXT_ATTACHMENT_TOKENS)
    if (mime.startsWith('audio/')) return Math.max(900, DEFAULT_NON_TEXT_ATTACHMENT_TOKENS + 400)
    if (mime.startsWith('video/')) return Math.max(1200, DEFAULT_NON_TEXT_ATTACHMENT_TOKENS + 800)
    return Math.max(500, DEFAULT_NON_TEXT_ATTACHMENT_TOKENS)
}

export function estimateTokens(text: string): number {
    if (!text) return 0
    let latin = 0
    let cjk = 0
    for (const ch of text) {
        const code = ch.codePointAt(0) ?? 0
        if (
            (code >= 0x4E00 && code <= 0x9FFF) ||
            (code >= 0x3400 && code <= 0x4DBF) ||
            (code >= 0xF900 && code <= 0xFAFF)
        ) cjk += 1
        else latin += 1
    }
    const est = Math.ceil(latin * 0.75 + cjk * 1.6)
    return Math.ceil(est * 1.1)
}

export function messagePlainTextWithAttachmentPlaceholders(message: TokenizableMessage): string {
    const fallback = typeof message.content === 'string' ? message.content : ''
    const parts = normalizeParts(message)
    if (parts.length === 0) {
        const attachments = Array.isArray(message.attachments) ? message.attachments : []
        if (attachments.length === 0) return fallback
        const lines = [fallback, ...attachments.map((attachment) => `File: ${attachment.name ?? attachment.assetId ?? 'attachment'}`)]
            .filter((line) => typeof line === 'string' && line.trim().length > 0)
        return lines.join('\n')
    }
    return parts.map((part) => {
        if (part.type === 'text') return part.text
        return `File: ${part.name}`
    }).join('\n')
}

export function estimateMessageTokensWithAttachments(message: TokenizableMessage): AttachmentTokenEstimate {
    const fallback = typeof message.content === 'string' ? message.content : ''
    const parts = normalizeParts(message)
    if (parts.length === 0) {
        const textTokens = estimateTokens(fallback)
        return {
            textTokens,
            attachmentTokens: 0,
            safetyMarginTokens: 0,
            totalTokens: textTokens,
            attachmentCount: 0,
        }
    }

    let textTokens = 0
    let attachmentTokens = 0
    let attachmentCount = 0
    for (const part of parts) {
        if (part.type === 'text') {
            textTokens += estimateTokens(part.text)
            continue
        }
        attachmentCount += 1
        attachmentTokens += estimateBinaryPartTokens(part)
    }
    const safetyRatio = Number.isFinite(DEFAULT_SAFETY_MARGIN_RATIO) && DEFAULT_SAFETY_MARGIN_RATIO > 0
        ? DEFAULT_SAFETY_MARGIN_RATIO
        : 0.15
    const safetyMarginTokens = attachmentTokens > 0 ? Math.ceil(attachmentTokens * safetyRatio) : 0
    return {
        textTokens,
        attachmentTokens,
        safetyMarginTokens,
        totalTokens: textTokens + attachmentTokens + safetyMarginTokens,
        attachmentCount,
    }
}

export function estimateTokensForMessages(messages: TokenizableMessage[]): number {
    return messages.reduce((sum, message) => sum + estimateMessageTokensWithAttachments(message).totalTokens, 0)
}
