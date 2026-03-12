// electron/core/operations/context/measureContext.ts
import type { UIMessage } from '../../../../contracts/index'
import { getModelById } from '../../models/modelRegistry'
import { estimateMessageTokens } from '../../attachments/attachmentTokenEstimator'

export type ContextStats = {
    totalTokens: number
    userTokens: number
    assistantTokens: number
    textTokens: number
    attachmentEstimatedTokens: number
    safetyMarginTokens: number
    messages: number
    maxTokens: number
    usedRatio: number   // totalTokens / maxTokens (>1 means the theoretical budget is exceeded)
}

export function measureContext(history: UIMessage[], modelId: string, opts?: { maxContextTokens?: number }): ContextStats {
    const meta = getModelById(modelId)
    const maxTokens = Number(
        opts?.maxContextTokens
        ?? meta?.limits?.maxContextTokens
        ?? meta?.params?.maxContextTokens
        ?? meta?.defaults?.maxContextTokens
        ?? 128_000
    )

    let userTokens = 0
    let assistantTokens = 0
    let textTokens = 0
    let attachmentEstimatedTokens = 0
    let safetyMarginTokens = 0
    for (const m of history) {
        const estimate = estimateMessageTokens(m)
        const t = estimate.totalTokens
        textTokens += estimate.textTokens
        attachmentEstimatedTokens += estimate.attachmentTokens
        safetyMarginTokens += estimate.safetyMarginTokens
        if (m.role === 'user') userTokens += t
        else if (m.role === 'assistant') assistantTokens += t
    }
    const totalTokens = userTokens + assistantTokens
    return {
        totalTokens,
        userTokens,
        assistantTokens,
        textTokens,
        attachmentEstimatedTokens,
        safetyMarginTokens,
        messages: history.length,
        maxTokens,
        usedRatio: maxTokens > 0 ? totalTokens / maxTokens : 0,
    }
}
