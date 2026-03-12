import { registerEmbeddingsProvider, LocalHashEmbeddings } from './index'
import { GeminiEmbeddings } from './gemini'
import { OpenAIEmbeddings } from './openai'

export function registerDefaultEmbeddingsProviders(): void {
    registerEmbeddingsProvider('gemini', (apiKey?: string) =>
        new GeminiEmbeddings(apiKey ?? '', 'text-embedding-004')
    )
    registerEmbeddingsProvider('openai', (apiKey?: string) =>
        new OpenAIEmbeddings(apiKey ?? '', 'text-embedding-3-small')
    )
    registerEmbeddingsProvider('local', () => new LocalHashEmbeddings(256))
}
