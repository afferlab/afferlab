import {
    Braces,
    File,
    FileArchive,
    FileAudio2,
    FileCode2,
    FileImage,
    FileSpreadsheet,
    FileText,
    FileVideo2,
    Presentation,
    Table2,
    type LucideIcon,
} from 'lucide-react'
import { normalizeAttachmentExt, normalizeAttachmentMime } from '@shared/attachments/attachmentPolicy'
import { resolveAttachmentType } from '@shared/attachments/attachmentTypeRegistry'

export type AssetVisual = {
    icon: LucideIcon
    colorHex: string
    label: string
    mime: string
    ext: string
}

export type AssetVisualInput = {
    mimeType?: string
    ext?: string
    name?: string
    kind?: string
}

function byExt(ext: string, mime: string): AssetVisual {
    if (ext === 'pdf' || mime === 'application/pdf') {
        return { icon: FileText, colorHex: '#EF4444', label: 'PDF', mime, ext }
    }
    if (ext === 'doc' || ext === 'docx') {
        return { icon: FileText, colorHex: '#3B82F6', label: 'Word', mime, ext }
    }
    if (ext === 'xls' || ext === 'xlsx') {
        return { icon: FileSpreadsheet, colorHex: '#22C55E', label: 'Sheet', mime, ext }
    }
    if (ext === 'ppt' || ext === 'pptx') {
        return { icon: Presentation, colorHex: '#F59E0B', label: 'Slides', mime, ext }
    }
    if (ext === 'json' || mime === 'application/json') {
        return { icon: Braces, colorHex: '#64748B', label: 'JSON', mime, ext }
    }
    if (ext === 'csv' || ext === 'tsv' || mime === 'text/csv' || mime === 'text/tab-separated-values') {
        return { icon: Table2, colorHex: '#22C55E', label: 'CSV', mime, ext }
    }
    if (ext === 'zip' || mime === 'application/zip' || mime === 'application/x-zip-compressed') {
        return { icon: FileArchive, colorHex: '#F97316', label: 'Archive', mime, ext }
    }
    return { icon: File, colorHex: '#94A3B8', label: 'File', mime, ext }
}

export function buildAssetVisual(input: AssetVisualInput): AssetVisual {
    const name = input.name ?? ''
    const ext = normalizeAttachmentExt(input.ext, name)
    const mime = normalizeAttachmentMime(input.mimeType, ext, name)
    const byFile = byExt(ext, mime)
    if (byFile.label !== 'File') return byFile

    const resolved = resolveAttachmentType({ mimeType: mime, ext, fileName: name })
    if (!resolved) return byFile
    if (resolved.kind === 'image') return { icon: FileImage, colorHex: '#A855F7', label: 'Image', mime, ext }
    if (resolved.kind === 'audio') return { icon: FileAudio2, colorHex: '#14B8A6', label: 'Audio', mime, ext }
    if (resolved.kind === 'video') return { icon: FileVideo2, colorHex: '#8B5CF6', label: 'Video', mime, ext }
    if (resolved.kind === 'code') return { icon: FileCode2, colorHex: '#64748B', label: 'Code', mime, ext }
    if (resolved.kind === 'archive') return { icon: FileArchive, colorHex: '#F97316', label: 'Archive', mime, ext }
    if (resolved.kind === 'text') return { icon: FileText, colorHex: '#6B7280', label: 'Text', mime, ext }
    if (resolved.kind === 'document') return { icon: FileText, colorHex: '#3B82F6', label: 'Document', mime, ext }
    return byFile
}
