import { createHash } from 'node:crypto'
import type { LLMModelConfig, StrategyContextBuildResult } from '../../../../contracts/index'
import { contextStore } from '../../../core/context'

export function logStrategyTrace(
    scope: { strategyKey: string; strategyVersion: string },
    args: { conversationId: string; turnId: string; model: LLMModelConfig },
    result: StrategyContextBuildResult,
): void {
    if (process.env.NODE_ENV === 'production') return
    const stats = contextStore.get(args.conversationId)
    const slotCount = result.meta?.slotCount
    const messages = result.prompt?.messages?.length ?? 0
    console.log('[strategy][trace]', {
        conversationId: args.conversationId,
        turnId: args.turnId,
        strategyKey: scope.strategyKey,
        strategyVersion: scope.strategyVersion,
        slots: typeof slotCount === 'number' ? slotCount : null,
        tokenBudget: stats?.maxTokens ?? null,
        messages,
    })
}

export function hashMessages(messages: unknown[]): string {
    try {
        const payload = JSON.stringify(messages)
        return createHash('sha1').update(payload).digest('hex')
    } catch {
        return 'hash_error'
    }
}
