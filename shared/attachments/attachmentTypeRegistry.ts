import { mimeMatchesAllowlist, normalizeAttachmentExt, normalizeAttachmentMime } from './attachmentPolicy'

export type AttachmentRegistryKind =
    | 'document'
    | 'image'
    | 'audio'
    | 'video'
    | 'text'
    | 'code'
    | 'archive'
    | 'generic'

export type AttachmentRegistryEntry = {
    id: string
    kind: AttachmentRegistryKind
    label: string
    mimePatterns: string[]
    extensions: string[]
}

type ResolveAttachmentTypeArgs = {
    mimeType?: string
    ext?: string
    fileName?: string
}

const REGISTRY: AttachmentRegistryEntry[] = [
    {
        id: 'pdf',
        kind: 'document',
        label: 'PDF',
        mimePatterns: ['application/pdf'],
        extensions: ['pdf'],
    },
    {
        id: 'doc',
        kind: 'document',
        label: 'Word',
        mimePatterns: [
            'application/msword',
            'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
        ],
        extensions: ['doc', 'docx'],
    },
    {
        id: 'sheet',
        kind: 'document',
        label: 'Spreadsheet',
        mimePatterns: [
            'application/vnd.ms-excel',
            'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
            'text/csv',
            'text/tab-separated-values',
        ],
        extensions: ['xls', 'xlsx', 'csv', 'tsv'],
    },
    {
        id: 'slides',
        kind: 'document',
        label: 'Slides',
        mimePatterns: [
            'application/vnd.ms-powerpoint',
            'application/vnd.openxmlformats-officedocument.presentationml.presentation',
        ],
        extensions: ['ppt', 'pptx'],
    },
    {
        id: 'image',
        kind: 'image',
        label: 'Image',
        mimePatterns: ['image/*'],
        extensions: ['png', 'jpg', 'jpeg', 'webp', 'gif'],
    },
    {
        id: 'audio',
        kind: 'audio',
        label: 'Audio',
        mimePatterns: ['audio/*'],
        extensions: ['mp3', 'wav', 'm4a', 'aac'],
    },
    {
        id: 'video',
        kind: 'video',
        label: 'Video',
        mimePatterns: ['video/*'],
        extensions: ['mp4', 'mov', 'webm'],
    },
    {
        id: 'text',
        kind: 'text',
        label: 'Text',
        mimePatterns: [
            'text/plain',
            'text/markdown',
            'application/json',
            'text/yaml',
            'application/yaml',
            'application/x-yaml',
            'application/xml',
            'text/xml',
            'text/html',
            'application/sql',
            'text/sql',
        ],
        extensions: ['txt', 'md', 'json', 'yaml', 'yml', 'xml', 'html', 'sql'],
    },
    {
        id: 'code',
        kind: 'code',
        label: 'Code',
        mimePatterns: [
            'application/javascript',
            'text/javascript',
            'text/x-python',
            'text/x-go',
            'text/x-java-source',
            'text/x-c',
            'text/x-c++',
            'text/x-rust',
            'text/x-swift',
            'text/typescript',
            'application/typescript',
        ],
        extensions: ['js', 'ts', 'tsx', 'jsx', 'py', 'go', 'java', 'c', 'cpp', 'rs', 'swift'],
    },
    {
        id: 'archive',
        kind: 'archive',
        label: 'Archive',
        mimePatterns: ['application/zip', 'application/x-zip-compressed'],
        extensions: ['zip'],
    },
]

const EXTENSION_ENTRY = new Map<string, AttachmentRegistryEntry>()
for (const entry of REGISTRY) {
    for (const ext of entry.extensions) {
        EXTENSION_ENTRY.set(ext, entry)
    }
}

function normalizeRule(rule: string): string {
    return rule.trim().toLowerCase()
}

function matchesRegistryMime(entry: AttachmentRegistryEntry, mime: string): boolean {
    return entry.mimePatterns.some((rule) => mimeMatchesAllowlist(mime, [rule]))
}

export function listAttachmentTypeRegistry(): AttachmentRegistryEntry[] {
    return REGISTRY.slice()
}

export function resolveAttachmentType(args: ResolveAttachmentTypeArgs): AttachmentRegistryEntry | null {
    const ext = normalizeAttachmentExt(args.ext, args.fileName)
    const mime = normalizeAttachmentMime(args.mimeType, ext, args.fileName)
    if (ext) {
        const byExt = EXTENSION_ENTRY.get(ext)
        if (byExt) return byExt
    }
    for (const entry of REGISTRY) {
        if (matchesRegistryMime(entry, mime)) return entry
    }
    return null
}

export function isPlatformAttachmentSupported(args: ResolveAttachmentTypeArgs): boolean {
    return resolveAttachmentType(args) != null
}

export function listPlatformMimeAllowlist(): string[] {
    const out = new Set<string>()
    for (const entry of REGISTRY) {
        for (const rule of entry.mimePatterns) {
            out.add(normalizeRule(rule))
        }
    }
    return [...out]
}

export function buildAttachmentPickerAccept(providerSupportedMimeTypes: string[]): string {
    const providerAllowlist = (providerSupportedMimeTypes ?? [])
        .map((item) => normalizeRule(item))
        .filter(Boolean)
    if (providerAllowlist.length === 0) return ''
    const acceptTokens = new Set<string>()
    for (const entry of REGISTRY) {
        const providerAllowsEntry = entry.mimePatterns.some((rule) => mimeMatchesAllowlist(rule, providerAllowlist))
            || entry.extensions.some((ext) => {
                const mime = normalizeAttachmentMime('', ext)
                return mimeMatchesAllowlist(mime, providerAllowlist)
            })
        if (!providerAllowsEntry) continue
        for (const rule of entry.mimePatterns) acceptTokens.add(rule)
        for (const ext of entry.extensions) acceptTokens.add(`.${ext}`)
    }
    return [...acceptTokens].join(',')
}
