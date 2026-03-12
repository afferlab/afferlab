// electron/core/ingest/text/txt/defaultExtractor.ts
import type { Bytes, ExtractContext, Extracted, FileExtractor } from '../../../../../contracts/index'
import { IngestRegistry } from '../../registry'
import { decodeUtf8, normalizeText } from '../common'

/** Default TXT extractor (MVP). */
export const TxtPlainExtractor: FileExtractor = {
    id: 'text/txt:plain',
    label: 'Plain Text (.txt)',

    match: (ctx: ExtractContext) => {
        const ext = (ctx.ext ?? '').toLowerCase()
        if (ext === 'txt') return true
        if ((ctx.mime ?? '').toLowerCase() === 'text/plain') return true
        // Fall back to filename-based guessing
        return ctx.filename.toLowerCase().endsWith('.txt')
    },

    extract: async (bytes: Bytes, ctx: ExtractContext): Promise<Extracted> => {
        console.debug('[ingest/txt]', {
            filename: ctx.filename,
            size: bytes.length,
            mime: ctx.mime,
        })
        const text = normalizeText(decodeUtf8(bytes))
        console.debug('[ingest/txt]', 'ok', {
            filename: ctx.filename,
            size: bytes.length,
            chars: text.length,
        })
        return [{
            kind: 'text',
            text,
            title: ctx.filename,
            meta: {
                source_ext: 'txt',
                source_mime: ctx.mime ?? 'text/plain',
                bytes: bytes.length,
            },
        }]
    },
}

/** Register on module load. */
IngestRegistry.registerExtractor(TxtPlainExtractor)
