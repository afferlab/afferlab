// electron/strategies/contextDebug.ts
import { contextObserver } from '../core/context'

contextObserver.on(({ conversationId, modelId, stats, source }) => {
    // ContextStats does not expose usedTokens, so approximate it as ratio × maxTokens
    const approxUsed = Math.round(stats.usedRatio * stats.maxTokens)
    console.log(
        `[context:${source}] conv=${conversationId} model=${modelId ?? '-'} ` +
        `used≈${approxUsed}/${stats.maxTokens} (${(stats.usedRatio * 100).toFixed(1)}%)`
    )
})
