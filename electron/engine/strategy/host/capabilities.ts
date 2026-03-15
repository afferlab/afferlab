import type { Capabilities, LLMModelConfig } from '../../../../contracts'

export function computeStrategyCapabilities(model?: LLMModelConfig): Capabilities {
    return {
        vision: model?.capabilities?.vision ?? false,
        structuredOutput: model?.capabilities?.json ?? false,
        tools: model?.capabilities?.tools ?? false,
    }
}
