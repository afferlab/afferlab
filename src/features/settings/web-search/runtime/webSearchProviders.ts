import type { WebSearchResult } from '@contracts'

export type SearchProvider = {
    id: string
    search(args: { query: string; topK: number }): Promise<WebSearchResult>
}

function parseBingHtml(html: string, topK: number): Array<{ title: string; url: string; snippet: string }> {
    const doc = new DOMParser().parseFromString(html, 'text/html')
    const items = Array.from(doc.querySelectorAll('li.b_algo'))
    const results: Array<{ title: string; url: string; snippet: string }> = []
    const seen = new Set<string>()
    for (const item of items) {
        const link = item.querySelector('h2 a')
        const title = link?.textContent?.trim() ?? ''
        const url = link?.getAttribute('href') ?? ''
        const snippet = item.querySelector('.b_caption p')?.textContent?.trim()
            ?? item.querySelector('p')?.textContent?.trim()
            ?? ''
        if (!title || !url) continue
        if (seen.has(url)) continue
        seen.add(url)
        results.push({ title, url, snippet })
        if (results.length >= topK) break
    }
    if (results.length > 0) return results

    // Fallback: be more permissive if DOM structure changes.
    const links = Array.from(doc.querySelectorAll('li.b_algo a'))
    for (const link of links) {
        const title = link.textContent?.trim() ?? ''
        const url = link.getAttribute('href') ?? ''
        if (!title || !url) continue
        if (!/^https?:\/\//i.test(url)) continue
        if (seen.has(url)) continue
        seen.add(url)
        results.push({ title, url, snippet: '' })
        if (results.length >= topK) break
    }
    if (results.length > 0) return results

    // Last resort: scan any result-like links inside b_results.
    const fallbackLinks = Array.from(doc.querySelectorAll('#b_results a'))
    for (const link of fallbackLinks) {
        const title = link.textContent?.trim() ?? ''
        const url = link.getAttribute('href') ?? ''
        if (!title || !url) continue
        if (!/^https?:\/\//i.test(url)) continue
        if (seen.has(url)) continue
        seen.add(url)
        results.push({ title, url, snippet: '' })
        if (results.length >= topK) break
    }
    return results
}

export class BingBrowserProvider implements SearchProvider {
    id = 'bing_browser'

    async search(args: { query: string; topK: number }): Promise<WebSearchResult> {
        const query = args.query.trim()
        if (!query) return { results: [], source: this.id, error: 'no query' }
        const url = new URL('https://www.bing.com/search')
        url.searchParams.set('q', query)
        url.searchParams.set('setlang', 'en')
        url.searchParams.set('cc', 'US')

        const res = await window.api.webSearch.fetchHtml({ url: url.toString() })
        const results = parseBingHtml(res.html, args.topK)
        if (!results.length) {
            return { results, source: this.id, error: 'no results', meta: { finalUrl: res.finalUrl } }
        }
        return { results, source: this.id, meta: { finalUrl: res.finalUrl } }
    }
}

export async function bingBrowserSearch(args: { query: string; topK: number }): Promise<WebSearchResult> {
    const provider = new BingBrowserProvider()
    return provider.search(args)
}

export async function webSearchSmoke(): Promise<WebSearchResult> {
    return bingBrowserSearch({ query: 'Sydney current weather', topK: 3 })
}

window.__webSearchProviders = {
    bingBrowserSearch,
    smoke: webSearchSmoke,
}
