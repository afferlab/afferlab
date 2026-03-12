// Minimal shape definitions and type guards to avoid any
export type GeminiTextPart = { text?: string }
export type GeminiContent = { parts?: GeminiTextPart[] }
export type GeminiCandidate = { finishReason?: string; content?: GeminiContent }
export type GeminiResponse = { candidates?: GeminiCandidate[] }

function hasCandidates(x: unknown): x is GeminiResponse {
    return !!x && typeof x === 'object' && Array.isArray((x as { candidates?: unknown }).candidates)
}

export function extractTextFromChunk(x: unknown): string {
    if (!hasCandidates(x)) return ''
    let out = ''
    for (const c of x.candidates ?? []) {
        const parts = c?.content?.parts ?? []
        for (const p of parts) if (typeof p.text === 'string') out += p.text
    }
    return out
}

export function extractFinalText(x: unknown): string {
    return extractTextFromChunk(x)
}

// Used by index.ts for runtime shape validation
export function isSendMessageStreamResult(x: unknown): x is { stream: AsyncIterable<unknown>; response: Promise<unknown> } {
    return !!x && typeof x === 'object' && 'stream' in x && 'response' in x
}
