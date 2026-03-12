// electron/core/ingest/document/pdf/pdfExtractor.ts
import type { Bytes, ExtractContext, Extracted, FileExtractor } from '../../../../../contracts/index'
import { createRequire } from 'node:module'
import { IngestRegistry } from '../../registry'

type PdfJsDocument = {
    numPages: number
    getPage: (index: number) => Promise<{
        getTextContent: (options?: Record<string, unknown>) => Promise<{
            items: Array<{ str?: string; transform?: number[] }>
        }>
    }>
    getMetadata: () => Promise<{ info?: Record<string, unknown>; metadata?: Record<string, unknown> } | null>
    destroy?: () => Promise<void> | void
}

type PdfJsModule = {
    version?: string
    disableWorker?: boolean
    getDocument: (input: Buffer | { data: Buffer; disableWorker?: boolean }) => Promise<PdfJsDocument> | { promise?: Promise<PdfJsDocument> }
}

const requireForPdf = createRequire(import.meta.url)

function loadPdfJsModule(): PdfJsModule {
    try {
        // Prefer stable pdfjs-dist legacy build if available.
        return requireForPdf('pdfjs-dist/legacy/build/pdf.js') as PdfJsModule
    } catch {
        // Fallback to bundled pdf.js shipped by pdf-parse.
        return requireForPdf('pdf-parse/lib/pdf.js/v1.10.100/build/pdf.js') as PdfJsModule
    }
}

async function resolvePdfDocument(task: ReturnType<PdfJsModule['getDocument']>): Promise<PdfJsDocument> {
    if (task && typeof task === 'object' && 'promise' in task && task.promise) {
        return task.promise
    }
    return task as Promise<PdfJsDocument>
}

async function extractPdfText(pdfjs: PdfJsModule, bytes: Bytes): Promise<{
    text: string
    pages: number
    info?: Record<string, unknown>
    metadata?: Record<string, unknown>
}> {
    pdfjs.disableWorker = true
    let doc: PdfJsDocument | null = null
    try {
        const task = pdfjs.getDocument({ data: Buffer.from(bytes), disableWorker: true })
        doc = await resolvePdfDocument(task)
    } catch {
        const task = pdfjs.getDocument(Buffer.from(bytes))
        doc = await resolvePdfDocument(task)
    }

    const metadata = await doc.getMetadata().catch(() => null)
    const pages = doc.numPages
    let text = ''

    for (let i = 1; i <= pages; i++) {
        const page = await doc.getPage(i)
        const textContent = await page.getTextContent({
            normalizeWhitespace: false,
            disableCombineTextItems: false,
        }).catch(() => ({ items: [] as Array<{ str?: string; transform?: number[] }> }))

        let lastY: number | undefined
        for (const item of textContent.items) {
            const str = typeof item.str === 'string' ? item.str : ''
            if (!str) continue
            const y = Array.isArray(item.transform) ? item.transform[5] : undefined
            if (lastY == null || y === lastY) {
                text += str
            } else {
                text += `\n${str}`
            }
            lastY = y
        }
        text += '\n\n'
    }

    if (doc.destroy) {
        await doc.destroy()
    }

    return {
        text,
        pages,
        info: metadata?.info,
        metadata: metadata?.metadata,
    }
}

function normalizePdfText(raw: string): string {
    const normalized = raw.replace(/\r\n?/g, '\n').trim()
    return normalized.replace(/\n{3,}/g, '\n\n')
}

function logPdfError(ctx: ExtractContext, err: unknown): void {
    const message = err instanceof Error ? (err.stack ?? err.message) : String(err)
    console.error('[ingest/pdf]', {
        filename: ctx.filename,
        mime: ctx.mime,
        error: message,
    })
}

export const PdfExtractor: FileExtractor = {
    id: 'document/pdf:extract',
    label: 'PDF Document (.pdf)',

    match: (ctx: ExtractContext) => {
        const ext = (ctx.ext ?? '').toLowerCase()
        if (ext === 'pdf') return true
        if ((ctx.mime ?? '').toLowerCase() === 'application/pdf') return true
        return ctx.filename.toLowerCase().endsWith('.pdf')
    },

    extract: async (bytes: Bytes, ctx: ExtractContext): Promise<Extracted> => {
        try {
            console.debug('[ingest/pdf]', 'parse:start', {
                filename: ctx.filename,
                size: bytes.length,
                mime: ctx.mime,
            })
            const pdfjs = loadPdfJsModule()
            const result = await extractPdfText(pdfjs, bytes)
            const text = normalizePdfText(result.text)
            if (!text) {
                throw new Error('no text extracted')
            }
            console.debug('[ingest/pdf]', 'parse:ok', {
                filename: ctx.filename,
                pages: result.pages ?? null,
                textLength: text.length,
            })
            return [{
                kind: 'text',
                text,
                title: ctx.filename,
                meta: {
                    source_ext: 'pdf',
                    source_mime: ctx.mime ?? 'application/pdf',
                    pages: result.pages ?? null,
                },
            }]
        } catch (err) {
            logPdfError(ctx, err)
            const message = err instanceof Error ? err.message : String(err)
            const mime = ctx.mime ?? 'application/pdf'
            throw new Error(`[ingest/pdf] parse failed: ${ctx.filename} (${mime}) (${message})`)
        }
    },
}

IngestRegistry.registerExtractor(PdfExtractor)
