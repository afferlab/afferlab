import type { Database } from 'better-sqlite3'
import { BrowserWindow } from 'electron'
import type { ToolDef, ToolExecuteContext, ToolExecuteResult, WebSearchSettings } from '../../../contracts/index'
import type { ToolCall } from '../../../contracts/tools'
import type { ToolRegistry } from './ToolRegistry'
import { getWebSearchSettings } from '../settings/settingsStore'

type SearchResultItem = {
    id: string
    title: string
    url: string
    finalUrl?: string
    snippet?: string
    site: string
    rank: number
}

type RawSearchResultItem = {
    title: string
    url: string
    snippet?: string
}

type SearchResult = {
    results: SearchResultItem[]
    providerUsed: SearchProviderId
    fallbackUsed: boolean
    meta?: Record<string, unknown>
    error?: string
}

type SearchProviderId = 'bing_browser' | 'ddg_html'

interface SearchProvider {
    id: SearchProviderId
    search(query: string, topK: number): Promise<{ results: RawSearchResultItem[]; meta?: Record<string, unknown>; error?: string }>
}

function parseArgs(call: ToolCall): Record<string, unknown> {
    if (!call.args) return {}
    if (typeof call.args === 'string') {
        try {
            const parsed = JSON.parse(call.args)
            return parsed && typeof parsed === 'object' ? (parsed as Record<string, unknown>) : {}
        } catch {
            return {}
        }
    }
    if (typeof call.args === 'object') return call.args as Record<string, unknown>
    return {}
}

function pickNumber(args: Record<string, unknown>, keys: string[], fallback: number): number {
    for (const k of keys) {
        const v = args[k]
        if (typeof v === 'number' && Number.isFinite(v)) return v
    }
    return fallback
}

function pickString(args: Record<string, unknown>, keys: string[], fallback = ''): string {
    for (const k of keys) {
        const v = args[k]
        if (typeof v === 'string') return v
    }
    return fallback
}

function clampLimit(value: number): number {
    const n = Math.round(value)
    if (!Number.isFinite(n)) return 5
    return Math.min(20, Math.max(1, n))
}

function safeJson(obj: unknown): string {
    try {
        return JSON.stringify(obj)
    } catch {
        return JSON.stringify({ error: 'JSON.stringify failed' })
    }
}

/**
 * Provider 1: Bing Browser (NO KEY)
 * - uses renderer-side DOMParser to parse Bing HTML
 * - renderer calls main IPC webSearch.fetchHtml to retrieve HTML
 */
class BingBrowserProvider implements SearchProvider {
    id: SearchProviderId = 'bing_browser'

    async search(query: string, topK: number): Promise<{ results: RawSearchResultItem[]; meta?: Record<string, unknown>; error?: string }> {
        try {
            const win = BrowserWindow.getAllWindows().find(w => !w.isDestroyed())
            if (!win) {
                return { results: [], error: 'no renderer window' }
            }
            const payload = JSON.stringify({ query, topK })
            const result = await win.webContents.executeJavaScript(
                `window.__webSearchProviders?.bingBrowserSearch(${payload})`,
                true,
            )
            const data = result as { results?: Array<{ title: string; url: string; snippet?: string }>; error?: string; meta?: Record<string, unknown> } | undefined
            if (!data || !Array.isArray(data.results)) {
                return { results: [], error: 'invalid renderer result' }
            }
            return {
                results: data.results,
                meta: data.meta,
                error: data.error,
            }
        } catch (err) {
            const msg = err instanceof Error ? err.message : String(err)
            return { results: [], error: msg }
        }
    }
}

function stripTags(s: string): string {
    return s.replace(/<[^>]+>/g, ' ')
}

function decodeHtml(s: string): string {
    // minimal entity decode (enough for titles/snippets)
    return s
        .replace(/&amp;/g, '&')
        .replace(/&quot;/g, '"')
        .replace(/&#39;/g, "'")
        .replace(/&lt;/g, '<')
        .replace(/&gt;/g, '>')
        .replace(/\s+/g, ' ')
}

function normalizeUrl(rawUrl: string): string {
    let input = decodeHtml(rawUrl.trim())
    if (!input) return ''
    if (input.startsWith('//')) input = `https:${input}`
    const ddg = decodeDdgRedirectUrl(input)
    if (ddg) input = ddg
    const bing = decodeBingRedirectUrl(input)
    if (bing) input = bing
    return input
}

function decodeBingRedirectUrl(rawUrl: string): string | null {
    try {
        const parsed = new URL(rawUrl)
        if (!parsed.hostname.endsWith('bing.com')) return null
        if (!parsed.pathname.startsWith('/ck/a')) return null
        const u = parsed.searchParams.get('u')
        if (!u) return null
        let b64 = u.startsWith('a1') ? u.slice(2) : u
        b64 = b64.replace(/-/g, '+').replace(/_/g, '/')
        while (b64.length % 4 !== 0) b64 += '='
        const decoded = Buffer.from(b64, 'base64').toString('utf8')
        if (!decoded) return null
        const cleaned = decoded.startsWith('http') ? decoded : decodeURIComponent(decoded)
        return cleaned.startsWith('http') ? cleaned : null
    } catch {
        return null
    }
}

function decodeDdgRedirectUrl(rawUrl: string): string | null {
    try {
        const parsed = new URL(rawUrl)
        if (!parsed.hostname.endsWith('duckduckgo.com')) return null
        if (!parsed.pathname.startsWith('/l/')) return null
        const uddg = parsed.searchParams.get('uddg')
        if (!uddg) return null
        const decoded = decodeURIComponent(uddg)
        return decoded.startsWith('http') ? decoded : null
    } catch {
        return null
    }
}

/**
 * Provider 3: DuckDuckGo HTML (NO KEY)
 * Endpoint: https://html.duckduckgo.com/html/?q=...
 * Much easier to parse than Bing.
 */
class DdgHtmlProvider implements SearchProvider {
    id: SearchProviderId = 'ddg_html'

    async search(query: string, topK: number): Promise<{ results: RawSearchResultItem[]; meta?: Record<string, unknown>; error?: string }> {
        const url = `https://html.duckduckgo.com/html/?q=${encodeURIComponent(query)}`
        const res = await fetch(url, {
            method: 'GET',
            headers: {
                'User-Agent':
                    'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120 Safari/537.36',
                'Accept-Language': 'en-US,en;q=0.9',
            },
        })

        const html = await res.text()
        const metaBase = {
            fetched: url,
            status: res.status,
            ok: res.ok,
            htmlLen: html.length,
            blockedHint: /captcha|unusual traffic|consent|verify you are human/i.test(html),
        }

        if (!res.ok) {
            return { results: [], error: `HTTP ${res.status}`, meta: metaBase }
        }

        // DDG HTML results often look like: <a class="result__a" href="...">Title</a>
        const results: RawSearchResultItem[] = []
        const re = /<a[^>]+class="result__a"[^>]+href="([^"]+)"[^>]*>([\s\S]*?)<\/a>/gi
        let m: RegExpExecArray | null

        while ((m = re.exec(html)) && results.length < topK) {
            const href = m[1]
            const title = decodeHtml(stripTags(m[2])).trim()
            if (!href || !title) continue

            // DDG sometimes uses redirect links; keep as-is for now
            results.push({ title, url: href, snippet: '' })
        }

        return {
            results,
            meta: { ...metaBase, parsed: results.length },
        }
    }
}

function resolveProviderId(args: Record<string, unknown>, settings: WebSearchSettings): SearchProviderId {
    const fromArg = pickString(args, ['provider', 'searchProvider', 'providerId'], '').toLowerCase()
    const fromEnv = (process.env.SEARCH_PROVIDER || '').toLowerCase()

    const candidate = (fromArg || fromEnv || settings.provider || 'bing_browser') as string
    if (candidate === 'ddg_html') return 'ddg_html'
    if (candidate === 'bing_browser' || candidate === 'bing_html' || candidate === 'auto') return 'bing_browser'
    return 'bing_browser'
}

const WEB_SEARCH_PROVIDERS: Record<SearchProviderId, () => SearchProvider> = {
    bing_browser: () => new BingBrowserProvider(),
    ddg_html: () => new DdgHtmlProvider(),
}

function createProvider(id: SearchProviderId): SearchProvider {
    return (WEB_SEARCH_PROVIDERS[id] ?? WEB_SEARCH_PROVIDERS.bing_browser)()
}

async function runSearchWithFallback(query: string, topK: number, primary: SearchProviderId): Promise<SearchResult> {
    const first = createProvider(primary)
    const r1 = await first.search(query, topK)

    const ok1 = Array.isArray(r1.results) && r1.results.length > 0 && !r1.error
    console.log('[websearch][provider]', { primary, got: r1.results?.length ?? 0, error: r1.error })

    if (ok1) {
        return {
            results: decorateResults(r1.results),
            providerUsed: primary,
            fallbackUsed: false,
            meta: r1.meta,
            error: r1.error,
        }
    }

    // fallback: always DuckDuckGo HTML
    if (primary === 'ddg_html') {
        console.log('[websearch][fallback]', { fallback: 'ddg_html', reason: r1.error ?? 'no results' })
        return {
            results: [],
            providerUsed: primary,
            fallbackUsed: false,
            error: r1.error ?? 'no results',
            meta: r1.meta,
        }
    }
    const fallback: SearchProviderId = 'ddg_html'
    try {
        console.log('[websearch][fallback]', { fallback, reason: r1.error ?? 'no results' })
        const second = createProvider(fallback)
        const r2 = await second.search(query, topK)
        console.log('[websearch][fallback]', { fallback, got: r2.results?.length ?? 0, error: r2.error })

        // If fallback also empty, keep primary error info but include both metas
        if (!r2.results?.length) {
            return {
                results: [],
                providerUsed: primary,
                fallbackUsed: true,
                error: r1.error || r2.error || 'no results',
                meta: { primary: r1.meta, fallback: r2.meta },
            }
        }
        return {
            results: decorateResults(r2.results),
            providerUsed: fallback,
            fallbackUsed: true,
            meta: r2.meta,
            error: r2.error,
        }
    } catch (e) {
        const msg = e instanceof Error ? e.message : String(e)
        return { results: [], providerUsed: primary, fallbackUsed: true, error: r1.error || msg, meta: { primary: r1.meta } }
    }
}

function decorateResults(results: RawSearchResultItem[]): SearchResultItem[] {
    const out: SearchResultItem[] = []
    let rank = 0
    for (const item of results) {
        rank += 1
        const finalUrl = normalizeUrl(item.url) || undefined
        let site = ''
        try {
            site = new URL(finalUrl ?? item.url).hostname
        } catch {
            site = ''
        }
        out.push({
            id: `r${rank}`,
            title: item.title,
            url: item.url,
            finalUrl,
            snippet: item.snippet,
            site,
            rank,
        })
    }
    return out
}

const MAX_FETCH_PAGES = 3
const MAX_FETCH_CHARS = 20000
const MAX_FETCH_BYTES = 2_000_000
const DEFAULT_FETCH_TIMEOUT_MS = 35_000

type WebFetchPage = {
    url: string
    finalUrl?: string
    title?: string
    content?: string
    meta: { chars?: number; truncated?: boolean; error?: string }
}

type WebFetchResult = {
    pages: WebFetchPage[]
    maxPages: number
}

function isPrivateIp(host: string): boolean {
    const ipv4 = /^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/
    const match = host.match(ipv4)
    if (match) {
        const [a, b] = match.slice(1).map((n) => Number(n))
        if (a === 10) return true
        if (a === 127) return true
        if (a === 192 && b === 168) return true
        if (a === 172 && b >= 16 && b <= 31) return true
        return false
    }
    if (host === 'localhost' || host.endsWith('.local')) return true
    if (host.includes(':')) return true
    return false
}

function isSafeFetchUrl(raw: string): { ok: boolean; error?: string } {
    let parsed: URL
    try {
        parsed = new URL(raw)
    } catch {
        return { ok: false, error: 'invalid url' }
    }
    if (parsed.protocol !== 'https:') return { ok: false, error: 'only https allowed' }
    if (isPrivateIp(parsed.hostname)) return { ok: false, error: 'blocked host' }
    return { ok: true }
}

function getWebFetchTimeoutMs(override?: number): number {
    if (typeof override === 'number' && Number.isFinite(override) && override > 0) {
        return Math.round(override)
    }
    const env = Number(process.env.WEBFETCH_PAGELOAD_TIMEOUT_MS ?? '')
    if (Number.isFinite(env) && env > 0) return Math.round(env)
    return DEFAULT_FETCH_TIMEOUT_MS
}

async function fetchHtmlWithWindow(url: string, timeoutMs: number): Promise<{ html: string; finalUrl: string; truncated: boolean }> {
    const win = new BrowserWindow({
        show: false,
        webPreferences: {
            nodeIntegration: false,
            contextIsolation: true,
            sandbox: true,
            webSecurity: true,
            allowRunningInsecureContent: false,
            partition: 'webfetch',
        },
    })
    win.webContents.setWindowOpenHandler(() => ({ action: 'deny' }))
    console.log('[webfetch][nav]', { finalUrl: url, timeoutMs })

    const withTimeout = async <T>(promise: Promise<T>, stage: 'goto' | 'dom' | 'extract'): Promise<T> => {
        let timeoutId: NodeJS.Timeout | null = null
        const timeout = new Promise<never>((_, reject) => {
            timeoutId = setTimeout(() => {
                console.log('[webfetch][timeout]', { finalUrl: url, timeoutMs, stage })
                reject(new Error(`timeout:${stage}`))
            }, timeoutMs)
        })
        try {
            return await Promise.race([promise, timeout])
        } finally {
            if (timeoutId) clearTimeout(timeoutId)
        }
    }

    try {
        await withTimeout(win.loadURL(url), 'goto')
        await withTimeout(
            new Promise<void>((resolve, reject) => {
                const wc = win.webContents
                let settled = false

                const cleanup = () => {
                    wc.removeListener('dom-ready', onDone)
                    wc.removeListener('did-finish-load', onDone)
                    wc.removeListener('did-stop-loading', onDone)
                    wc.removeListener('did-fail-load', onFail)
                }

                const onDone = () => {
                    if (settled) return
                    settled = true
                    cleanup()
                    resolve()
                }

                const onFail = (
                    _event: Electron.Event,
                    errorCode: number,
                    errorDesc: string,
                    validatedURL: string,
                ) => {
                    if (settled) return
                    settled = true
                    cleanup()
                    reject(new Error(`load_failed:${errorCode}:${errorDesc}:${validatedURL}`))
                }

                // If the asset is no longer in loading state, treat it as ready immediately
                if (!wc.isLoading()) {
                    onDone()
                    return
                }

                // Use on + cleanup instead of once so timeout cleanup remains under control
                wc.on('dom-ready', onDone)
                wc.on('did-finish-load', onDone)
                wc.on('did-stop-loading', onDone)
                wc.on('did-fail-load', onFail)
            }),
            'dom'
        )
        const rawHtml = await withTimeout(
            win.webContents.executeJavaScript('document.documentElement.outerHTML', true) as Promise<string>,
            'extract'
        )
        const byteLen = Buffer.byteLength(rawHtml, 'utf8')
        if (byteLen <= MAX_FETCH_BYTES) {
            return { html: rawHtml, finalUrl: win.webContents.getURL(), truncated: false }
        }
        const truncated = Buffer.from(rawHtml, 'utf8').slice(0, MAX_FETCH_BYTES).toString('utf8')
        return { html: truncated, finalUrl: win.webContents.getURL(), truncated: true }
    } finally {
        if (!win.isDestroyed()) win.destroy()
    }
}

/**
 * builtin.web_search
 * - Returns STRING resultText
 * - Always watermarks:
 *   "__from_tool=builtin.web_search"
 */
async function webSearch(_db: Database, _ctx: ToolExecuteContext, call: ToolCall): Promise<ToolExecuteResult> {
    const settings = getWebSearchSettings(_db)
    const args = parseArgs(call)
    const query = pickString(args, ['query'], '').trim()
    const requested = pickNumber(args, ['limit', 'topK', 'k'], -1)
    const topK = clampLimit(settings.limit ?? 5)
    if (!query) {
        const empty: SearchResult = {
            results: [],
            providerUsed: 'bing_browser',
            fallbackUsed: false,
            error: 'missing query arg',
            meta: { args },
        }
        return {
            ok: false,
            resultText: ['__from_tool=builtin.web_search', safeJson(empty)].join('\n'),
            raw: empty,
            error: { message: empty.error },
        }
    }

    if (!settings.enabled) {
        console.log('[websearch] blocked: web_search disabled')
        const disabled: SearchResult = {
            results: [],
            providerUsed: 'bing_browser',
            fallbackUsed: false,
            error: 'disabled',
            meta: { args },
        }
        return {
            ok: false,
            resultText: ['__from_tool=builtin.web_search', safeJson(disabled)].join('\n'),
            raw: disabled,
            error: { message: disabled.error },
        }
    }

    const providerId = resolveProviderId(args, settings)

    if (requested > 0) {
        console.log('[websearch] ignore_model_limit', { requested, effectiveTopK: topK })
    }
    console.log('[websearch][args]', { args, query, topK, providerId })

    try {
        console.log('[websearch][limit]', { requested: settings.limit, effective: topK })
        const rawResult = await runSearchWithFallback(query, topK, providerId)
        const result: SearchResult = {
            ...rawResult,
            results: decorateResults(rawResult.results as Array<{ title: string; url: string; snippet?: string }>),
        }
        console.log('[websearch][results]', { count: result.results.length, providerUsed: result.providerUsed, fallbackUsed: result.fallbackUsed })
        const hasResults = Array.isArray(result.results) && result.results.length > 0
        const hasError = typeof result.error === 'string' && result.error.length > 0
        const ok = hasResults && !hasError
        if (!hasResults && !hasError) {
            result.error = 'no results'
        }
        return {
            ok,
            resultText: ['__from_tool=builtin.web_search', safeJson(result)].join('\n'),
            ...(ok ? {} : { error: { message: result.error ?? 'no results' } }),
            raw: result,
        }
    } catch (e) {
        const msg = e instanceof Error ? e.message : String(e)
        console.warn('[websearch][fatal_error]', msg)
        const err: SearchResult = { results: [], providerUsed: providerId, fallbackUsed: false, error: msg }
        return {
            ok: false,
            resultText: ['__from_tool=builtin.web_search', safeJson(err)].join('\n'),
            error: { message: msg },
            raw: err,
        }
    }
}

/**
 * builtin.web_fetch
 * - Returns STRING resultText
 * - Always watermarks:
 *   "__from_tool=builtin.web_fetch"
 */
async function webFetch(_db: Database, _ctx: ToolExecuteContext, call: ToolCall): Promise<ToolExecuteResult> {
    const settings = getWebSearchSettings(_db)
    const args = parseArgs(call)
    const urlsRaw = args.urls
    const urls = Array.isArray(urlsRaw) ? urlsRaw.filter((u) => typeof u === 'string') as string[] : []
    const debug = process.env.DEBUG_TOOLS === '1'
    const timeoutMs = getWebFetchTimeoutMs(typeof args.timeoutMs === 'number' ? args.timeoutMs : undefined)

    if (!settings.enabled) {
        console.log('[webfetch] blocked: web_search disabled')
        const empty: WebFetchResult = { pages: [], maxPages: MAX_FETCH_PAGES }
        return {
            ok: false,
            resultText: ['__from_tool=builtin.web_fetch', safeJson({ ...empty, error: 'disabled' })].join('\n'),
            raw: empty,
            error: { message: 'disabled' },
        }
    }

    if (!urls.length) {
        const empty: WebFetchResult = { pages: [], maxPages: MAX_FETCH_PAGES }
        return {
            ok: false,
            resultText: ['__from_tool=builtin.web_fetch', safeJson({ ...empty, error: 'missing urls' })].join('\n'),
            raw: empty,
            error: { message: 'missing urls' },
        }
    }

    const win = BrowserWindow.getAllWindows().find(w => !w.isDestroyed())
    if (!win) {
        const empty: WebFetchResult = { pages: [], maxPages: MAX_FETCH_PAGES }
        return {
            ok: false,
            resultText: ['__from_tool=builtin.web_fetch', safeJson({ ...empty, error: 'no renderer window' })].join('\n'),
            raw: empty,
            error: { message: 'no renderer window' },
        }
    }

    const pages: WebFetchPage[] = []
    for (const rawUrl of urls.slice(0, MAX_FETCH_PAGES)) {
        const finalUrl = normalizeUrl(rawUrl) || rawUrl
        const safe = isSafeFetchUrl(finalUrl)
        if (!safe.ok) {
            console.log('[webfetch] done', { url: rawUrl, finalUrl, extractedChars: 0, error: safe.error })
            pages.push({ url: rawUrl, finalUrl, meta: { error: safe.error } })
            continue
        }

        try {
            const startedAt = Date.now()
            console.log('[webfetch][load]', { url: rawUrl, finalUrl })
            const fetched = await fetchHtmlWithWindow(finalUrl, timeoutMs)
            const payload = JSON.stringify({ url: rawUrl, html: fetched.html, maxChars: MAX_FETCH_CHARS })
            console.log('[webfetch][readability]', { url: rawUrl, htmlBytes: Buffer.byteLength(fetched.html, 'utf8') })
            const extracted = await win.webContents.executeJavaScript(
                `window.__webFetchProviders?.extractReadable(${payload})`,
                true,
            ) as { title?: string; content?: string; meta?: { chars?: number; truncated?: boolean; error?: string } } | undefined

            if (!extracted || extracted.meta?.error) {
                console.log('[webfetch] done', { finalUrl: fetched.finalUrl, extractedChars: 0, ms: Date.now() - startedAt, error: extracted?.meta?.error ?? 'readability failed' })
                pages.push({
                    url: rawUrl,
                    finalUrl: fetched.finalUrl,
                    meta: { error: extracted?.meta?.error ?? 'readability failed' },
                })
                continue
            }

            console.log('[webfetch] done', { finalUrl: fetched.finalUrl, extractedChars: extracted.meta?.chars ?? 0, ms: Date.now() - startedAt, error: extracted.meta?.error })
            pages.push({
                url: rawUrl,
                finalUrl: fetched.finalUrl,
                title: extracted.title,
                content: extracted.content,
                meta: {
                    chars: extracted.meta?.chars,
                    truncated: extracted.meta?.truncated ?? fetched.truncated,
                },
            })
        } catch (err) {
            const msg = err instanceof Error ? err.message : String(err)
            if (debug) console.warn('[builtin.web_fetch][error]', msg)
            console.log('[webfetch] done', { finalUrl, extractedChars: 0, ms: 0, error: msg })
            pages.push({ url: rawUrl, meta: { error: msg } })
        }
    }

    const ok = pages.some((p) => typeof p.content === 'string' && p.content.length > 0)
    const result: WebFetchResult = { pages, maxPages: MAX_FETCH_PAGES }
    return {
        ok,
        resultText: ['__from_tool=builtin.web_fetch', safeJson(result)].join('\n'),
        ...(ok ? {} : { error: { message: 'no content' } }),
        raw: result,
    }
}

export function registerBuiltinTools(registry: ToolRegistry, db: Database): void {
    const webSearchDef: ToolDef = {
        name: 'builtin.web_search',
        description:
            'Search the web for current information. Optional args: provider ("auto" | "bing_browser" | "ddg_html"). You can also set env SEARCH_PROVIDER.',
        inputSchema: {
            type: 'object',
            properties: {
                query: { type: 'string' },
                recencyDays: { type: 'integer' }, // reserved
                provider: { type: 'string', enum: ['auto', 'bing_browser', 'ddg_html'] },
                providerId: { type: 'string', enum: ['auto', 'bing_browser', 'ddg_html'] },
            },
            required: ['query'],
        },
        providerId: 'builtin',
        permissions: { network: true },
    }

    registry.registerTool(webSearchDef, (ctx, call) => webSearch(db, ctx, call))

    const webFetchDef: ToolDef = {
        name: 'builtin.web_fetch',
        description:
            'Fetch pages and extract readable text. Input: { urls: string[] }. Limits: https only, max 3 pages.',
        inputSchema: {
            type: 'object',
            properties: {
                urls: { type: 'array', items: { type: 'string' } },
            },
            required: ['urls'],
        },
        providerId: 'builtin',
        permissions: { network: true },
    }
    registry.registerTool(webFetchDef, (ctx, call) => webFetch(db, ctx, call))
}
