// electron/llm/adapters/error.ts

export type NormalizedError =
    | { code: 'API_KEY_MISSING'; message: string }
    | { code: 'TIMEOUT'; message: string }
    | { code: 'RATE_LIMIT'; message: string }
    | { code: 'INVALID_PARAMS'; message: string }
    | { code: 'NETWORK'; message: string }
    | { code: 'UNKNOWN'; message: string }

export interface ErrorHints {
    provider?: string
    httpStatus?: number
}

/** Extract message from unknown without using any. */
function safeMessage(e: unknown): string {
    if (e instanceof Error) return e.message
    if (typeof e === 'string') return e
    try {
        return JSON.stringify(e)
    } catch {
        return String(e)
    }
}

/** Extract an optional name from unknown without using any. */
function safeName(e: unknown): string | undefined {
    const maybe = e as { name?: unknown }
    return typeof maybe?.name === 'string' ? maybe.name : undefined
}

export function normalizeError(e: unknown, hints?: ErrorHints): NormalizedError {
    const msg = safeMessage(e)
    const name = safeName(e)

    if (hints?.httpStatus === 401 || /unauthorized|api[_ ]?key/i.test(msg)) {
        return { code: 'API_KEY_MISSING', message: msg }
    }
    if (hints?.httpStatus === 429 || /429|rate[- ]?limit/i.test(msg)) {
        return { code: 'RATE_LIMIT', message: msg }
    }
    if (/timeout/i.test(msg)) {
        return { code: 'TIMEOUT', message: msg }
    }
    if (/invalid|bad request|parameter/i.test(msg)) {
        return { code: 'INVALID_PARAMS', message: msg }
    }
    if (/network|fetch|ECONN|ENOTFOUND/i.test(msg)) {
        return { code: 'NETWORK', message: msg }
    }

    // Fallback detection for provider-specific error names without breaking existing branches
    if (name && /GoogleGenerativeAIError|OpenAIError|Anthropic/i.test(name)) {
        return { code: 'INVALID_PARAMS', message: msg }
    }

    return { code: 'UNKNOWN', message: msg }
}
