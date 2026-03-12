export type BaseParams = {
    temperature?: number
    maxTokens?: number
    top_p?: number
    stop?: string[]
}

export function pickBaseParams(raw?: Record<string, unknown>): BaseParams | undefined {
    if (!raw) return undefined
    const out: BaseParams = {}
    if (typeof raw.temperature === 'number') out.temperature = raw.temperature
    if (typeof raw.maxTokens === 'number') out.maxTokens = raw.maxTokens
    if (typeof raw.top_p === 'number') out.top_p = raw.top_p
    if (Array.isArray(raw.stop) && raw.stop.every(s => typeof s === 'string')) out.stop = raw.stop as string[]
    return out
}
