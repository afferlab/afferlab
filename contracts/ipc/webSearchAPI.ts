import type { WebSearchFetchHtmlArgs, WebSearchFetchHtmlResult } from '../webSearch'

export type WebSearchAPI = {
    webSearch: {
        fetchHtml(args: WebSearchFetchHtmlArgs): Promise<WebSearchFetchHtmlResult>
    }
}

declare global {
    interface Window {
        api: WebSearchAPI
        __webSearchProviders?: {
            bingBrowserSearch?: (args: { query: string; topK: number }) => Promise<unknown>
            smoke?: () => Promise<unknown>
        }
        __webFetchProviders?: {
            extractReadable?: (args: { url: string; html: string; maxChars: number }) => Promise<unknown>
        }
    }
}
