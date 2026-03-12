import {
    Anthropic,
    DeepSeek,
    Google,
    LmStudio,
    Ollama,
    OpenAI,
} from '@lobehub/icons'
import type { ProviderId } from './providers'

const PROVIDER_ICON_MAP = {
    openai: OpenAI,
    anthropic: Anthropic,
    gemini: Google,
    ollama: Ollama,
    deepseek: DeepSeek,
    lmstudio: LmStudio,
} satisfies Partial<Record<ProviderId, unknown>>

export type ProviderIconComponent = (typeof PROVIDER_ICON_MAP)[keyof typeof PROVIDER_ICON_MAP]

export function getProviderIconComponent(providerId: string): ProviderIconComponent | null {
    return PROVIDER_ICON_MAP[providerId as ProviderId] ?? null
}
