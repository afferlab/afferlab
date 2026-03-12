import { createEmbeddingsProvider, embedTexts, LocalHashEmbeddings, type EmbeddingsProvider } from '../embeddings'

export type EmbeddingProfile = {
    name: string
    provider: 'gemini' | 'openai' | 'local'
    model: string
    dim: number
    metric: 'cosine' | 'l2' | 'dot'
    apiKeyEnv?: string
}

export function resolveEmbeddingProfile(name?: string): EmbeddingProfile {
    const profile = name ?? 'default'
    const hasGemini = !!(process.env.GEMINI_API_KEY || process.env.GOOGLE_API_KEY)
    const hasOpenAI = !!process.env.OPENAI_API_KEY
    if (profile !== 'default') {
        return {
            name: profile,
            provider: 'local',
            model: 'local-hash',
            dim: 256,
            metric: 'cosine',
        }
    }
    if (hasGemini) {
        return {
            name: 'default',
            provider: 'gemini',
            model: 'text-embedding-004',
            dim: 768,
            metric: 'cosine',
            apiKeyEnv: 'GEMINI_API_KEY',
        }
    }
    if (hasOpenAI) {
        return {
            name: 'default',
            provider: 'openai',
            model: 'text-embedding-3-small',
            dim: 1536,
            metric: 'cosine',
            apiKeyEnv: 'OPENAI_API_KEY',
        }
    }
    return {
        name: 'default',
        provider: 'local',
        model: 'local-hash',
        dim: 256,
        metric: 'cosine',
    }
}

export function createEmbeddingProvider(profile: EmbeddingProfile): EmbeddingsProvider {
    if (profile.provider === 'local') {
        return new LocalHashEmbeddings(profile.dim)
    }
    const apiKey = profile.apiKeyEnv ? process.env[profile.apiKeyEnv] : undefined
    return createEmbeddingsProvider(profile.provider, apiKey)
}

export async function embedTextsWithProfile(profile: EmbeddingProfile, texts: string[]) {
    const provider = createEmbeddingProvider(profile)
    const embedded = await embedTexts(provider, texts)
    return {
        vectors: embedded.vectors,
        dim: embedded.dim || profile.dim,
    }
}
