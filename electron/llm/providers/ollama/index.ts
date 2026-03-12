import type { Provider, StreamGen } from '../../common'
import type { LLMParams, ToolDef, TurnAttachment, UIMessage } from '../../../../contracts/index'

const DEFAULT_BASE_URL = 'http://127.0.0.1:11434'

function normalizeBaseUrl(baseUrl: string): string {
    return (baseUrl || '').replace(/\/$/, '')
}

function toOllamaMessages(history: UIMessage[]): Array<{ role: string; content: string }> {
    return history.map((msg) => ({
        role: msg.role,
        content: msg.content ?? '',
    }))
}

async function readError(res: Response): Promise<string> {
    const text = await res.text()
    return text || res.statusText
}

export const OllamaProvider: Provider = {
    id: 'ollama',
    capabilities: {
        nativeFiles: false,
        supportedMimeTypes: [],
    },
    supports: () => true,

    async *stream(
        { modelId, history, attachments }: {
            modelId: string
            history: UIMessage[]
            params?: LLMParams
            tools?: ToolDef[]
            attachments?: TurnAttachment[]
        },
        ctx
    ): StreamGen {
        if (attachments && attachments.length > 0) {
            throw new Error('ModelDoesNotSupportFiles: provider has no native file/media transport')
        }
        const baseUrl = normalizeBaseUrl(ctx.baseUrl || DEFAULT_BASE_URL)
        const payload = {
            model: modelId,
            messages: toOllamaMessages(history),
            stream: true,
        }
        const res = await fetch(`${baseUrl}/api/chat`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', ...(ctx.headers ?? {}) },
            body: JSON.stringify(payload),
            signal: ctx.abortSignal,
        })
        if (!res.ok) {
            const message = await readError(res)
            throw new Error(message)
        }
        const reader = res.body?.getReader()
        if (!reader) return
        const decoder = new TextDecoder('utf-8')
        let buffer = ''
        while (true) {
            const { value, done } = await reader.read()
            if (done) break
            buffer += decoder.decode(value, { stream: true })
            let idx = buffer.indexOf('\n')
            while (idx !== -1) {
                const line = buffer.slice(0, idx).trim()
                buffer = buffer.slice(idx + 1)
                if (line) {
                    try {
                        const data = JSON.parse(line) as {
                            message?: { content?: string }
                            done?: boolean
                        }
                        if (data.message?.content) yield data.message.content
                        if (data.done) return
                    } catch {
                        // ignore invalid lines
                    }
                }
                idx = buffer.indexOf('\n')
            }
        }
        const tail = buffer.trim()
        if (tail) {
            try {
                const data = JSON.parse(tail) as {
                    message?: { content?: string }
                    done?: boolean
                }
                if (data.message?.content) yield data.message.content
            } catch {
                // ignore invalid tail
            }
        }
    },

    async complete(
        { modelId, history, attachments }: {
            modelId: string
            history: UIMessage[]
            params?: LLMParams
            tools?: ToolDef[]
            attachments?: TurnAttachment[]
        },
        ctx
    ): Promise<string> {
        if (attachments && attachments.length > 0) {
            throw new Error('ModelDoesNotSupportFiles: provider has no native file/media transport')
        }
        const baseUrl = normalizeBaseUrl(ctx.baseUrl || DEFAULT_BASE_URL)
        const payload = {
            model: modelId,
            messages: toOllamaMessages(history),
            stream: false,
        }
        const res = await fetch(`${baseUrl}/api/chat`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', ...(ctx.headers ?? {}) },
            body: JSON.stringify(payload),
            signal: ctx.abortSignal,
        })
        if (!res.ok) {
            const message = await readError(res)
            throw new Error(message)
        }
        const data = (await res.json()) as { message?: { content?: string } }
        return data.message?.content ?? ''
    },
}
