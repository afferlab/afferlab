import { normalizeAttachmentExt, normalizeAttachmentMime } from '../../../shared/attachments/attachmentPolicy'

export type LoadedAsset = {
    loaderId: string
    kind: 'text' | 'document' | 'image' | 'audio' | 'video' | 'unknown'
    text: string
    textLength: number
}

type LoaderContext = {
    filename: string
    mimeType?: string
    ext?: string
}

type AttachmentLoader = {
    id: string
    supports: (ctx: LoaderContext) => boolean
    load: (bytes: Uint8Array, ctx: LoaderContext) => Promise<LoadedAsset>
}

const TEXT_EXTENSIONS = new Set([
    'txt',
    'md',
    'json',
    'yaml',
    'yml',
    'xml',
    'html',
    'js',
    'ts',
    'tsx',
    'jsx',
    'py',
    'go',
    'java',
    'c',
    'cpp',
    'rs',
    'swift',
    'sql',
    'csv',
    'tsv',
])

const textLoader: AttachmentLoader = {
    id: 'loader.text.v1',
    supports: (ctx) => {
        const ext = normalizeAttachmentExt(ctx.ext, ctx.filename)
        const mime = normalizeAttachmentMime(ctx.mimeType, ext, ctx.filename)
        if (mime.startsWith('text/')) return true
        if (mime === 'application/json' || mime === 'application/xml') return true
        return TEXT_EXTENSIONS.has(ext)
    },
    load: async (bytes) => {
        const decoder = new TextDecoder('utf-8')
        const text = decoder.decode(bytes).trim()
        return {
            loaderId: 'loader.text.v1',
            kind: 'text',
            text,
            textLength: text.length,
        }
    },
}

const pdfLoader: AttachmentLoader = {
    id: 'loader.pdf.stub.v1',
    supports: (ctx) => {
        const ext = normalizeAttachmentExt(ctx.ext, ctx.filename)
        const mime = normalizeAttachmentMime(ctx.mimeType, ext, ctx.filename)
        return ext === 'pdf' || mime === 'application/pdf'
    },
    load: async () => {
        return {
            loaderId: 'loader.pdf.stub.v1',
            kind: 'document',
            text: '',
            textLength: 0,
        }
    },
}

const DEFAULT_LOADER: AttachmentLoader = {
    id: 'loader.none.v1',
    supports: () => true,
    load: async () => ({
        loaderId: 'loader.none.v1',
        kind: 'unknown',
        text: '',
        textLength: 0,
    }),
}

const REGISTRY: AttachmentLoader[] = [
    textLoader,
    pdfLoader,
]

function pickLoader(ctx: LoaderContext): AttachmentLoader {
    return REGISTRY.find((item) => item.supports(ctx)) ?? DEFAULT_LOADER
}

export function listAttachmentLoaders(): string[] {
    return [...REGISTRY.map((item) => item.id), DEFAULT_LOADER.id]
}

export async function loadAssetText(args: {
    bytes: Uint8Array
    filename: string
    mimeType?: string
    ext?: string
}): Promise<LoadedAsset> {
    const loader = pickLoader({
        filename: args.filename,
        mimeType: args.mimeType,
        ext: args.ext,
    })
    return loader.load(args.bytes, {
        filename: args.filename,
        mimeType: args.mimeType,
        ext: args.ext,
    })
}
