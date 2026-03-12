export function shouldEmitDevEvents(args: {
    strategyId?: string | null
    source?: string | null
}): boolean {
    if (args.source === 'dev') return true
    if (typeof args.strategyId === 'string' && args.strategyId.trim().startsWith('dev:')) return true
    return false
}
