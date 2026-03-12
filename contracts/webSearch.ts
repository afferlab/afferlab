export type WebSearchFetchHtmlArgs = {
    url: string
    timeoutMs?: number
    userAgent?: string
}

export type WebSearchFetchHtmlResult = {
    html: string
    finalUrl: string
    meta?: { truncated: boolean; maxBytes: number }
}

export type WebSearchResult = {
    results: Array<{ title: string; url: string; snippet: string }>
    source: string
    meta?: Record<string, unknown>
    error?: string
}

export type WebSearchProviderId = 'bing_browser' | 'ddg_html'

export type WebSearchSettings = {
    enabled: boolean
    provider: 'auto' | WebSearchProviderId
    limit: number
}
