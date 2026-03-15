import type { Budget, LLMModelConfig } from '../../../../contracts'

const FALLBACK_MAX_INPUT_TOKENS = 128_000
const FALLBACK_MAX_OUTPUT_TOKENS = 4096
const BASE_RESERVED_TOKENS = 1024

function toFinitePositiveInt(value: unknown): number | null {
    if (typeof value !== 'number' || !Number.isFinite(value) || value <= 0) return null
    return Math.floor(value)
}

export function computeStrategyBudget(model?: LLMModelConfig): Budget {
    const maxInputTokens = toFinitePositiveInt(
        model?.limits?.maxContextTokens
        ?? model?.params?.maxContextTokens
        ?? model?.defaults?.maxContextTokens
    ) ?? FALLBACK_MAX_INPUT_TOKENS

    const maxOutputTokens = toFinitePositiveInt(
        model?.params?.maxOutputTokens
        ?? model?.params?.maxTokens
        ?? model?.limits?.maxOutputTokens
        ?? model?.defaults?.maxOutputTokens
    ) ?? FALLBACK_MAX_OUTPUT_TOKENS

    const reservedTokens = Math.min(
        maxInputTokens,
        Math.max(BASE_RESERVED_TOKENS, maxOutputTokens + BASE_RESERVED_TOKENS),
    )

    return {
        maxInputTokens,
        maxOutputTokens,
        reservedTokens,
        remainingInputTokens: Math.max(0, maxInputTokens - reservedTokens),
    }
}
