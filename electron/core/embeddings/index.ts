// electron/core/embeddings/index.ts

export type EmbedInput = { id: string; text: string }

export interface EmbeddingsProvider {
    /** Return vectors aligned with inputs (all vectors share the same dimension). */
    embed(inputs: EmbedInput[]): Promise<Float32Array[]>
}

/** Provider factory registry. */
type ProviderFactory = (apiKey?: string) => EmbeddingsProvider;
const REGISTRY = new Map<string, ProviderFactory>();

/** Register a provider (typically once during app startup). */
export function registerEmbeddingsProvider(name: string, factory: ProviderFactory): void {
    REGISTRY.set(name, factory);
}

/** Create a provider by name; throw if it cannot be found. */
export function createEmbeddingsProvider(name: string, apiKey?: string): EmbeddingsProvider {
    const factory = REGISTRY.get(name);
    if (!factory) throw new Error(`[embeddings] unknown provider: ${name}`);
    return factory(apiKey);
}

/** Convenience helper: embed an array of texts and return a normalized result. */
export async function embedTexts(
    providerOrName: EmbeddingsProvider | string,
    texts: string[],
    apiKey?: string
): Promise<{ ids: string[]; vectors: Float32Array[]; dim: number }> {
    const inputs: EmbedInput[] = texts.map((t, i) => ({ id: String(i), text: t }));
    const provider =
        typeof providerOrName === 'string' ? createEmbeddingsProvider(providerOrName, apiKey) : providerOrName;

    const vectors = await provider.embed(inputs);
    const dim = vectors.length ? vectors[0].length : 0;
    const ids = inputs.map((i) => i.id);
    return { ids, vectors, dim };
}

/** Optional local random provider for development, useful before external APIs are wired up. */
export class LocalRandomEmbeddings implements EmbeddingsProvider {
    constructor(private readonly dim: number = 32) {}
    async embed(inputs: EmbedInput[]): Promise<Float32Array[]> {
        return inputs.map(() => {
            const v = new Float32Array(this.dim);
            for (let i = 0; i < this.dim; i++) v[i] = Math.random();
            return v;
        });
    }
}

function hashToken(token: string): number {
    let hash = 2166136261;
    for (let i = 0; i < token.length; i++) {
        hash ^= token.charCodeAt(i);
        hash = Math.imul(hash, 16777619);
    }
    return hash >>> 0;
}

function l2Normalize(vec: Float32Array): Float32Array {
    let sum = 0;
    for (let i = 0; i < vec.length; i++) sum += vec[i] * vec[i];
    const inv = sum > 0 ? 1 / Math.sqrt(sum) : 1;
    if (inv !== 1) {
        for (let i = 0; i < vec.length; i++) vec[i] *= inv;
    }
    return vec;
}

/** Reproducible local embeddings with no external dependency, suitable when no API key is available. */
export class LocalHashEmbeddings implements EmbeddingsProvider {
    constructor(private readonly dim: number = 256) {}

    async embed(inputs: EmbedInput[]): Promise<Float32Array[]> {
        return inputs.map((item) => {
            const vec = new Float32Array(this.dim);
            const tokens = item.text
                .toLowerCase()
                .split(/[^a-z0-9\u4e00-\u9fff]+/u)
                .filter(Boolean);
            for (const token of tokens) {
                const idx = hashToken(token) % this.dim;
                vec[idx] += 1;
            }
            return l2Normalize(vec);
        });
    }
}
