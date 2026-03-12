import type { BaseParams } from '../../adapters/params'
import type { GenerationConfig } from '@google/generative-ai'

function modelLimit(modelId?: string): number {
    // If model-specific behavior is unnecessary, this can simply return a constant
    if (!modelId) return 4096
    if (modelId.includes('flash')) return 8192
    return 4096
}

export function toGeminiConfig(base?: BaseParams, modelId?: string): GenerationConfig | undefined {
    if (!base) return undefined
    const cfg: GenerationConfig = {}
    if (base.temperature != null) cfg.temperature = base.temperature
    if (base.maxTokens != null) cfg.maxOutputTokens = Math.min(base.maxTokens, modelLimit(modelId))
    if (base.top_p != null) cfg.topP = base.top_p
    if (base.stop) cfg.stopSequences = base.stop
    return cfg
}
