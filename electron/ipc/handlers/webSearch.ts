import { BrowserWindow, ipcMain } from 'electron'
import { IPC } from '../channels'
import type { WebSearchFetchHtmlArgs, WebSearchFetchHtmlResult } from '../../../contracts/index'

export function registerWebSearchIPC(): void {
    ipcMain.handle(IPC.WEBSEARCH_FETCH_HTML, async (_e, args: WebSearchFetchHtmlArgs) => {
        if (!args?.url) throw new Error('url missing')
        validateAllowedUrl(args.url)
        return fetchHtmlInHiddenWindow(args)
    })
}

const ALLOWED_HOSTS = new Set([
    'www.bing.com',
    'html.duckduckgo.com',
    'duckduckgo.com',
])

function validateAllowedUrl(raw: string): void {
    let parsed: URL
    try {
        parsed = new URL(raw)
    } catch {
        throw new Error('invalid url')
    }
    if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
        throw new Error('blocked url protocol')
    }
    if (!ALLOWED_HOSTS.has(parsed.hostname)) {
        throw new Error('blocked url host')
    }
}

function truncateHtmlByBytes(html: string, maxBytes: number): { html: string; truncated: boolean } {
    const byteLen = Buffer.byteLength(html, 'utf8')
    if (byteLen <= maxBytes) return { html, truncated: false }
    const truncated = Buffer.from(html, 'utf8').slice(0, maxBytes).toString('utf8')
    return { html: truncated, truncated: true }
}

function fetchHtmlInHiddenWindow(args: WebSearchFetchHtmlArgs): Promise<WebSearchFetchHtmlResult> {
    const envTimeout = Number(process.env.WEBSEARCH_FETCHHTML_TIMEOUT_MS ?? process.env.TOOL_TIMEOUT_WEB_SEARCH_MS ?? '25000')
    const fallbackTimeout = Number.isFinite(envTimeout) && envTimeout > 0 ? envTimeout : 25000
    const timeoutMs = typeof args.timeoutMs === 'number' ? args.timeoutMs : fallbackTimeout
    const maxBytes = 1_000_000
    const win = new BrowserWindow({
        show: false,
        webPreferences: {
            nodeIntegration: false,
            contextIsolation: true,
            sandbox: true,
            webSecurity: true,
            allowRunningInsecureContent: false,
            // Non-persist partition to avoid storing search state/cookies.
            partition: 'websearch',
        },
    })
    win.webContents.setWindowOpenHandler(() => ({ action: 'deny' }))

    let timeoutId: NodeJS.Timeout | null = null
    const timeout = new Promise<never>((_, reject) => {
        timeoutId = setTimeout(() => {
            reject(new Error('timeout'))
        }, timeoutMs)
    })

    const load = (async (): Promise<WebSearchFetchHtmlResult> => {
        await win.loadURL(args.url, {
            userAgent: args.userAgent ?? win.webContents.getUserAgent(),
        })
        const rawHtml = await win.webContents.executeJavaScript(
            'document.documentElement.outerHTML',
            true,
        ) as string
        const { html, truncated } = truncateHtmlByBytes(rawHtml, maxBytes)
        const finalUrl = win.webContents.getURL()
        return { html, finalUrl, meta: { truncated, maxBytes } }
    })()

    return Promise.race([load, timeout])
        .finally(() => {
            if (timeoutId) clearTimeout(timeoutId)
            if (!win.isDestroyed()) win.destroy()
        })
}
