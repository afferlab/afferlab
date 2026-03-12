import { IPC } from '../ipc/channels'
import { safeInvoke } from './ipcHelpers'

export function createApi() {
    return {
        webSearch: {
            fetchHtml: (args: { url: string; timeoutMs?: number; userAgent?: string }) =>
                safeInvoke(IPC.WEBSEARCH_FETCH_HTML, args),
        },
    }
}
