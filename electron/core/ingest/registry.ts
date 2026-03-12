// electron/core/ingest/registry.ts
import type { Bytes, ExtractContext, Extracted, FileExtractor } from '../../../contracts/index'

/** Internal registry: key = extractor.id, value = implementation. */
const REGISTRY = new Map<string, FileExtractor>()

/** Utility: normalize an extension (strip leading dot and lowercase it). */
function normalizeExt(input?: string): string | undefined {
    if (!input) return undefined
    const s = input.trim().toLowerCase()
    return s.startsWith('.') ? s.slice(1) : s
}

/** Infer the extension from ctx (filename / ctx.ext / mime). */
export function inferExt(ctx: ExtractContext): string | undefined {
    if (ctx.ext) return normalizeExt(ctx.ext)
    const f = ctx.filename ?? ''
    const hit = f.lastIndexOf('.')
    if (hit >= 0 && hit < f.length - 1) return normalizeExt(f.slice(hit + 1))
    // Simple MIME-based inference
    if (ctx.mime === 'text/plain') return 'txt'
    return undefined
}

/** Register an extractor (duplicate ids overwrite previous entries). */
export function registerExtractor(ex: FileExtractor): void {
    REGISTRY.set(ex.id, ex)
}

/** List all extractors (useful for settings screens). */
export function listExtractors(): FileExtractor[] {
    return [...REGISTRY.values()]
}

/** Automatically pick an extractor from the context (first match wins). */
export function pickExtractor(ctx: ExtractContext): FileExtractor | undefined {
    for (const ex of REGISTRY.values()) {
        try {
            if (ex.match(ctx)) return ex
        } catch { /* ignore match error */ }
    }
    return undefined
}

/** Entry point: auto-pick and extract (throw if no extractor matches). */
export async function extractAuto(bytes: Bytes, ctx: ExtractContext): Promise<Extracted> {
    const chosen = pickExtractor(ctx)
    if (!chosen) {
        const ext = inferExt(ctx)
        throw new Error(`[ingest] no extractor for file: ${ctx.filename} (ext=${ext ?? 'unknown'}, mime=${ctx.mime ?? 'unknown'})`)
    }
    return chosen.extract(bytes, ctx)
}

/** Unified export for direct use by other modules. */
export const IngestRegistry = {
    registerExtractor,
    listExtractors,
    pickExtractor,
    extractAuto,
    inferExt,
}
