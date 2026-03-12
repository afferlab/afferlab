import type { UIMessage } from '../../../../contracts'
import { estimateMessageTokens } from '../../../core/attachments/attachmentTokenEstimator'

export type ContextStats = {
    totalTokens: number
    userTokens: number
    assistantTokens: number
    textTokens: number
    attachmentEstimatedTokens: number
    safetyMarginTokens: number
    messages: number
    maxTokens: number
    usedRatio: number
}

export function measureContext(
    history: UIMessage[],
    _modelId: string,
    opts?: { maxContextTokens?: number }
): ContextStats {
    const maxTokens = Number(opts?.maxContextTokens ?? 128_000)

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
