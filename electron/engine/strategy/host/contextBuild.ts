import type { LLMModelConfig, StrategyContextBuildResult, UIMessage } from '../../../../contracts/index'
import { contextObserver, contextStore } from '../../../core/context'
import { emitters } from '../../../core/events'
import { measureContext } from '../../../core/operations/context/measureContext'
import { estimateTokensForMessages } from '../../../core/tokens/tokenizer'
import { enforcePromptTokenBudget } from '../../../workers/strategy/context/slots'

export async function applyContextStats(
    args: { conversationId: string; model: LLMModelConfig },
    result: StrategyContextBuildResult,
): Promise<void> {
    const maxContextTokens = Number(
        args.model?.limits?.maxContextTokens
        ?? args.model?.params?.maxContextTokens
        ?? args.model?.defaults?.maxContextTokens
        ?? 128_000
    )
    const promptBudget = Math.max(0, maxContextTokens - 1024)
    const enforced = enforcePromptTokenBudget({
        messages: (result.prompt?.messages ?? []) as UIMessage[],
        budget: promptBudget,
        estimateMessages: (messages) => estimateTokensForMessages(messages),
    })
    if (!result.prompt) {
        result.prompt = { messages: enforced.messages }
    } else {
        result.prompt.messages = enforced.messages
    }
    result.meta = {
        ...(result.meta ?? {}),
        trimmed: enforced.trimmed || result.meta?.trimmed === true,
        inputTokenEstimate: enforced.totalTokens,
    }
    const messages = enforced.messages as UIMessage[]
    const stats = measureContext(messages, args.model.id, { maxContextTokens })

    contextStore.set(args.conversationId, stats)

    await contextObserver.notify({
        conversationId: args.conversationId,
        modelId: args.model.id,
        stats,
        source: 'measure',
    })

    await emitters.contextBudget({
        conversationId: args.conversationId,
        modelId: args.model.id,
        stats,
    })

    await emitters.contextFinalized({
        conversationId: args.conversationId,
        modelId: args.model.id,
        stats,
    })

    await contextObserver.notify({
        conversationId: args.conversationId,
        modelId: args.model.id,
        stats,
        source: 'finalize',
    })
}
