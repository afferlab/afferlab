// electron/core/ingest/index.ts
import type { Bytes, ExtractContext, FileExtractor } from '../../../contracts/index'
import { IngestRegistry, extractAuto as extractAutoImpl } from './registry'

// Import built-in extractors (registration happens on import)
import './text/txt'       // TXT
import './text/md'        // Markdown
import './document/pdf'   // PDF

// Public exports
// Unified API (other main-process services can import and use it directly)
export const Ingest = {
    register: (ex: FileExtractor) => IngestRegistry.registerExtractor(ex),
    list: () => IngestRegistry.listExtractors(),
    pick: (ctx: ExtractContext) => IngestRegistry.pickExtractor(ctx),
    extractAuto: (bytes: Bytes, ctx: ExtractContext) => extractAutoImpl(bytes, ctx),
}
