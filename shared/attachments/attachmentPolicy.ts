import type { TurnAttachment, TurnAttachmentKind } from '../../contracts/attachment'

export type AttachmentPolicyLimits = {
    maxFilesPerTurn: number
    maxFileSizeMB: number
}

export type AttachmentIconName =
    | 'image'
    | 'audio'
    | 'video'
    | 'pdf'
    | 'doc'
    | 'sheet'
    | 'slide'
    | 'code'
    | 'text'
    | 'json'
    | 'archive'
    | 'file'

export type AttachmentUIDescriptor = {
    iconName: AttachmentIconName
    colorToken: 'red' | 'orange' | 'amber' | 'blue' | 'green' | 'gray' | 'neutral'
    label: string
}

export const DEFAULT_ATTACHMENT_LIMITS: AttachmentPolicyLimits = {
    maxFilesPerTurn: 8,
    maxFileSizeMB: 20,
}

export const GLOBAL_SUPPORTED_MIME_TYPES: string[] = [
    'image/*',
    'audio/*',
    'video/*',
    'application/pdf',
    'text/plain',
    'text/markdown',
    'text/csv',
    'text/xml',
    'application/json',
    'application/xml',
    'application/zip',
    'application/x-zip-compressed',
    'application/msword',
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    'application/vnd.ms-excel',
    'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    'application/vnd.ms-powerpoint',
    'application/vnd.openxmlformats-officedocument.presentationml.presentation',
    'application/octet-stream',
]

export const EXT_TO_MIME_FALLBACK: Record<string, string> = {
    jpg: 'image/jpeg',
    jpeg: 'image/jpeg',
    png: 'image/png',
    webp: 'image/webp',
    gif: 'image/gif',
    bmp: 'image/bmp',
    svg: 'image/svg+xml',
    mp3: 'audio/mpeg',
    wav: 'audio/wav',
    m4a: 'audio/mp4',
    aac: 'audio/aac',
    mp4: 'video/mp4',
    mov: 'video/quicktime',
    webm: 'video/webm',
    pdf: 'application/pdf',
    txt: 'text/plain',
    md: 'text/markdown',
    csv: 'text/csv',
    json: 'application/json',
    xml: 'application/xml',
    zip: 'application/zip',
    doc: 'application/msword',
    docx: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    xls: 'application/vnd.ms-excel',
    xlsx: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    ppt: 'application/vnd.ms-powerpoint',
    pptx: 'application/vnd.openxmlformats-officedocument.presentationml.presentation',
}

const TEXT_EXTENSIONS = new Set([
    'txt',
    'md',
    'csv',
    'log',
    'yaml',
    'yml',
    'ini',
    'toml',
])

const CODE_EXTENSIONS = new Set([
    'js',
    'jsx',
    'ts',
    'tsx',
    'py',
    'go',
    'rs',
    'java',
    'kt',
    'swift',
    'c',
    'cpp',
    'h',
    'hpp',
    'css',
    'scss',
    'html',
    'sql',
    'sh',
    'bash',
    'zsh',
])

const DOC_MIME = new Set([
    'application/msword',
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
])

const SHEET_MIME = new Set([
    'application/vnd.ms-excel',
    'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
])

const SLIDE_MIME = new Set([
    'application/vnd.ms-powerpoint',
    'application/vnd.openxmlformats-officedocument.presentationml.presentation',
])

export function normalizeAttachmentExt(ext?: string, fileName?: string): string {
    const value = (ext ?? '').trim().replace(/^\./, '').toLowerCase()
    if (value) return value
    const name = (fileName ?? '').trim()
    const idx = name.lastIndexOf('.')
    if (idx <= 0 || idx === name.length - 1) return ''
    return name.slice(idx + 1).toLowerCase()
}

export function normalizeAttachmentMime(mimeType?: string, ext?: string, fileName?: string): string {
    const raw = (mimeType ?? '').trim().toLowerCase()
    if (raw) return raw
    const resolvedExt = normalizeAttachmentExt(ext, fileName)
    return EXT_TO_MIME_FALLBACK[resolvedExt] ?? 'application/octet-stream'
}

export function mimeMatchesAllowlist(mimeType: string, allowlist: string[]): boolean {
    const mime = normalizeAttachmentMime(mimeType)
    if (!allowlist.length) return false
    for (const item of allowlist) {
        const rule = normalizeAttachmentMime(item)
        if (rule === '*/*') return true
        if (rule.endsWith('/*')) {
            const prefix = rule.slice(0, rule.indexOf('/'))
            if (mime.startsWith(`${prefix}/`)) return true
            continue
        }
        if (rule === mime) return true
    }
    return false
}

export function isMimeSupported(mimeType?: string, ext?: string, allowlist: string[] = GLOBAL_SUPPORTED_MIME_TYPES): boolean {
    const mime = normalizeAttachmentMime(mimeType, ext)
    return mimeMatchesAllowlist(mime, allowlist)
}

export function getAttachmentKind(mimeType?: string, ext?: string): TurnAttachmentKind {
    const mime = normalizeAttachmentMime(mimeType, ext)
    if (mime.startsWith('image/')) return 'image'
    if (mime.startsWith('audio/')) return 'audio'
    if (mime.startsWith('video/')) return 'video'
    if (mime === 'application/pdf') return 'document'
    return 'file'
}

export function getAttachmentUI(ext?: string, mimeType?: string, kind?: TurnAttachmentKind): AttachmentUIDescriptor {
    const normalizedExt = normalizeAttachmentExt(ext)
    const normalizedMime = normalizeAttachmentMime(mimeType, normalizedExt)
    const resolvedKind = kind ?? getAttachmentKind(normalizedMime, normalizedExt)

    if (resolvedKind === 'image') return { iconName: 'image', colorToken: 'blue', label: 'Image' }
    if (resolvedKind === 'audio') return { iconName: 'audio', colorToken: 'green', label: 'Audio' }
    if (resolvedKind === 'video') return { iconName: 'video', colorToken: 'orange', label: 'Video' }
    if (normalizedMime === 'application/pdf' || normalizedExt === 'pdf') {
        return { iconName: 'pdf', colorToken: 'red', label: 'PDF' }
    }
    if (DOC_MIME.has(normalizedMime) || normalizedExt === 'doc' || normalizedExt === 'docx') {
        return { iconName: 'doc', colorToken: 'blue', label: 'Document' }
    }
    if (SHEET_MIME.has(normalizedMime) || normalizedExt === 'xls' || normalizedExt === 'xlsx') {
        return { iconName: 'sheet', colorToken: 'green', label: 'Spreadsheet' }
    }
    if (SLIDE_MIME.has(normalizedMime) || normalizedExt === 'ppt' || normalizedExt === 'pptx') {
        return { iconName: 'slide', colorToken: 'orange', label: 'Slides' }
    }
    if (normalizedMime === 'application/json' || normalizedExt === 'json') {
        return { iconName: 'json', colorToken: 'gray', label: 'JSON' }
    }
    if (normalizedMime === 'application/zip' || normalizedMime === 'application/x-zip-compressed' || normalizedExt === 'zip') {
        return { iconName: 'archive', colorToken: 'amber', label: 'Archive' }
    }
    if (normalizedMime.startsWith('text/') || TEXT_EXTENSIONS.has(normalizedExt)) {
        return { iconName: 'text', colorToken: 'gray', label: 'Text' }
    }
    if (CODE_EXTENSIONS.has(normalizedExt)) {
        return { iconName: 'code', colorToken: 'gray', label: 'Code' }
    }
    return { iconName: 'file', colorToken: 'neutral', label: 'File' }
}

export function toAttachmentExt(attachment: Pick<TurnAttachment, 'ext' | 'name'>): string {
    return normalizeAttachmentExt(attachment.ext, attachment.name)
}
