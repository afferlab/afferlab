import type { ModelDefinition } from './models'

export interface LLMParams {
    temperature?: number
    maxTokens?: number
    top_p?: number
    stop?: string[]
    topP?: number
    maxOutputTokens?: number
    maxContextTokens?: number
}

export interface LLMModelConfig extends ModelDefinition {
    name?: string
    apiBase?: string
    icon?: string
    params?: LLMParams
}
