declare module '@mozilla/readability' {
    export class Readability {
        constructor(doc: Document, opts?: Record<string, unknown>)
        parse(): { title?: string; content?: string; textContent?: string } | null
    }
}
