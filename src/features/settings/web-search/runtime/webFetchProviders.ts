import { Readability } from '@mozilla/readability'

type ExtractArgs = {
    url: string
    html: string
    maxChars: number
}

type ExtractResult = {
    title?: string
    content?: string
    meta: { chars?: number; truncated?: boolean; error?: string }
}

function normalizeText(text: string): string {
    return text.replace(/\s+/g, ' ').trim()
}

export async function extractReadable(args: ExtractArgs): Promise<ExtractResult> {
    try {
        const doc = new DOMParser().parseFromString(args.html, 'text/html')
        const reader = new Readability(doc, { keepClasses: false })
        const article = reader.parse()
        if (!article) {
            return { meta: { error: 'no readable content' } }
        }
        const raw = article.textContent ?? article.content ?? ''
        const normalized = normalizeText(raw)
        const truncated = normalized.length > args.maxChars
        const content = truncated ? normalized.slice(0, args.maxChars) : normalized
        return {
            title: article.title ?? doc.title ?? '',
            content,
            meta: { chars: content.length, truncated },
        }
    } catch (err) {
        const msg = err instanceof Error ? err.message : String(err)
        return { meta: { error: msg } }
    }
}

window.__webFetchProviders = {
    extractReadable,
}
