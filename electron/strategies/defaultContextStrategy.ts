// electron/strategies/defaultContextStrategy.ts

import type { ContextStrategy } from '../../contracts/index'

const DEFAULT_BUDGET_RATIO = 0.8   // Trim when usage exceeds 80% of the budget
const DEFAULT_MAX_MESSAGES = 80    // Keep at most the most recent 80 user/assistant messages

/**
 * Default context strategy:
 *  - Measure the current context once
 *  - If a simple threshold is exceeded, call tools.trimLatest to keep only the latest N messages
 *
 * Note: the real trimming operation is performed through tools,
 * so logging, metrics, and similar concerns can stay centralized there.
 */
export const defaultContextStrategy: ContextStrategy = async ({ session, model, tools }) => {
    // First measurement: based on the current effectiveContext (which equals originalHistory at this point)
    const maxContextTokens = Number(
        model?.limits?.maxContextTokens
        ?? model?.params?.maxContextTokens
        ?? model?.defaults?.maxContextTokens
        ?? 128_000
    )
    const stats = session.measure(model.id, { maxContextTokens })

    const overByRatio =
        stats.usedRatio > DEFAULT_BUDGET_RATIO
    const currentLen = session.getEffectiveContext().length
    const overByLength = currentLen > DEFAULT_MAX_MESSAGES

    if (overByRatio || overByLength) {
        tools.trimLatest(DEFAULT_MAX_MESSAGES)
    }

    // Stay conservative here: do not add more injections/reordering,
    // but this remains easy to extend later, for example:
    //
    // if (shouldInjectMemory) {
    //   tools.injectMemory(...)
    // }
}
