// electron/core/ingest/text/md/markdownExtractor.ts
import type { Bytes, ExtractContext, Extracted, FileExtractor } from '../../../../../contracts/index'
import { IngestRegistry } from '../../registry'
import { decodeUtf8, normalizeText } from '../common'

/** Markdown extractor (preserves the original document structure). */
export const MarkdownExtractor: FileExtractor = {
    id: 'text/md:markdown',
    label: 'Markdown (.md)',

    match: (ctx: ExtractContext) => {
        const ext = (ctx.ext ?? '').toLowerCase()
        if (ext === 'md' || ext === 'markdown') return true
        const mime = (ctx.mime ?? '').toLowerCase()
        if (mime === 'text/markdown') return true
        return ctx.filename.toLowerCase().endsWith('.md')
    },

    extract: async (bytes: Bytes, ctx: ExtractContext): Promise<Extracted> => {
        console.debug('[ingest/md]', {
            filename: ctx.filename,
            size: bytes.length,
            mime: ctx.mime,
        })
        const text = normalizeText(decodeUtf8(bytes))
        console.debug('[ingest/md]', 'ok', {
            filename: ctx.filename,
            size: bytes.length,
            chars: text.length,
        })
        return [{
            kind: 'text',
            text,
            title: ctx.filename,
            meta: {
                source_ext: 'md',
                source_mime: ctx.mime ?? 'text/markdown',
                bytes: bytes.length,
            },
        }]
    },
}

IngestRegistry.registerExtractor(MarkdownExtractor)
