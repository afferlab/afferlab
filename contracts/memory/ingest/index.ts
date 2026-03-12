// types/ingest/index.ts

/** Binary alias. */
export type Bytes = Uint8Array;

/** Context passed to the extractor. */
export type ExtractContext = {
    filename: string;          // Original filename, used to infer the extension
    mime?: string;             // MIME type (the renderer may pass file.type)
    ext?: string;              // Explicit extension (.txt, etc.); inferred from filename if missing
    conversationId?: string;   // Optional: mounted usage context
};

/** Minimal MVP: return text blocks only (can later expand to image/audio/chunks). */
export type TextBlock = {
    kind: 'text';
    text: string;              // Plain text
    title?: string;            // Optional: title for the UI
    lang?: string;             // Optional: language marker
    meta?: Record<string, unknown>; // Additional extractor metadata
};

/** Extractor output: one file may produce multiple text blocks. */
export type Extracted = TextBlock[];

/** Extractor interface. */
export interface FileExtractor {
    /** Globally unique id (for example: 'text/txt:plain'). */
    id: string;
    /** Display name (used in settings UI). */
    label: string;
    /** Match predicate based on extension/MIME/filename. */
    match: (ctx: ExtractContext) => boolean;
    /** Actual extraction: convert bytes into the shared abstraction. */
    extract: (bytes: Bytes, ctx: ExtractContext) => Promise<Extracted>;
}
