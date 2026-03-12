// src/pages/settings/model/providers.ts
export type ProviderId =
    | 'ollama'
    | 'lmstudio'
    | 'openai'
    | 'gemini'
    | 'anthropic'
    | 'deepseek'

export type ProviderItem = {
    id: ProviderId
    label: string
    website?: string
    defaultApiHost: string
}

export const DEFAULT_HOSTS: Record<ProviderId, string> = {
    ollama: 'http://127.0.0.1:11434',
    lmstudio: 'http://127.0.0.1:1234/v1',
    openai: 'https://api.openai.com/v1',
    gemini: 'https://generativelanguage.googleapis.com',
    anthropic: 'https://api.anthropic.com',
    deepseek: 'https://api.deepseek.com/v1',
}

export const PREVIEW_PATHS: Partial<Record<ProviderId, string>> = {
    gemini: '/v1beta/models',
    anthropic: '/v1/messages',
}

export const PROVIDERS: ProviderItem[] = [
    {
        id: 'ollama',
        label: 'Ollama',
        website: 'https://ollama.com',
        defaultApiHost: DEFAULT_HOSTS.ollama,
    },
    {
        id: 'lmstudio',
        label: 'LM Studio',
        website: 'https://lmstudio.ai',
        defaultApiHost: DEFAULT_HOSTS.lmstudio,
    },
    {
        id: 'openai',
        label: 'OpenAI',
        website: 'https://platform.openai.com',
        defaultApiHost: DEFAULT_HOSTS.openai,
    },
    {
        id: 'gemini',
        label: 'Google',
        website: 'https://ai.google.dev',
        defaultApiHost: DEFAULT_HOSTS.gemini,
    },
    {
        id: 'anthropic',
        label: 'Anthropic',
        website: 'https://www.anthropic.com',
        defaultApiHost: DEFAULT_HOSTS.anthropic,
    },
    {
        id: 'deepseek',
        label: 'DeepSeek',
        website: 'https://www.deepseek.com',
        defaultApiHost: DEFAULT_HOSTS.deepseek,
    },
]
