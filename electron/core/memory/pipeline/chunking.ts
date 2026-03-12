export const DEFAULT_CHUNK_SIZE = 800
export const DEFAULT_CHUNK_OVERLAP = 100

export function normalizeText(input: string): string {
    return input.replace(/\r\n/g, '\n').trim()
}

export function chunkDocumentText(input: string, maxChars: number, overlap: number): string[] {
    const text = normalizeText(input)
    if (!text) return []

    const paragraphs = text
        .split(/\n{2,}/)
        .map(p => p.trim())
        .filter(Boolean)

    const chunks: string[] = []
    let current = ''
    for (const para of paragraphs) {
        if (!current) {
            current = para
            continue
        }
        if (current.length + 2 + para.length <= maxChars) {
            current = `${current}\n\n${para}`
        } else {
            chunks.push(current)
            current = para
        }
    }
    if (current) chunks.push(current)

    if (overlap > 0 && chunks.length > 1) {
        for (let i = 1; i < chunks.length; i++) {
            const prev = chunks[i - 1]
            const prefix = prev.slice(-overlap)
            chunks[i] = `${prefix}\n${chunks[i]}`
        }
    }

    return chunks
}
