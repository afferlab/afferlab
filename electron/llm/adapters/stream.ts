export type ExtractText = (chunk: unknown) => string
export type StreamMode = 'full' | 'delta'

export interface StreamOptions {
    mode?: StreamMode
    timeoutMs?: number
    abortSignal?: AbortSignal
    heartbeatMs?: number
    onStart?: () => void
    onChunk?: (delta: string) => void
    onEnd?: () => void
}

export async function* deltaStream(
    src: AsyncIterable<unknown>,
    extract: ExtractText,
    opts: StreamOptions = {}
): AsyncGenerator<string, void> {
    const { mode = 'full', timeoutMs, abortSignal, heartbeatMs, onStart, onChunk, onEnd } = opts
    onStart?.()

    let acc = ''
    let lastBeat = Date.now()
    const it = src[Symbol.asyncIterator]()

    while (true) {
        if (abortSignal?.aborted) throw new Error('Aborted')
        const nextP = it.next()
        const res = timeoutMs
            ? await Promise.race([nextP, new Promise<never>((_, r) => setTimeout(() => r(new Error('Timeout')), timeoutMs))])
            : await nextP
        if ((res as IteratorResult<unknown>).done) break

        const fullOrDelta = extract((res as IteratorResult<unknown>).value)
        if (!fullOrDelta) continue

        const delta = mode === 'delta'
            ? fullOrDelta
            : (acc && fullOrDelta.startsWith(acc) ? fullOrDelta.slice(acc.length) : fullOrDelta)

        if (delta) {
            acc += delta
            onChunk?.(delta)
            yield delta
        }

        if (heartbeatMs && Date.now() - lastBeat >= heartbeatMs) {
            lastBeat = Date.now()
            yield ''
        }
    }
    onEnd?.()
}