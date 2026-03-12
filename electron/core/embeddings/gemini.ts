// electron/core/embeddings/gemini.ts

import type { EmbedInput, EmbeddingsProvider } from './index'

/**
 * Text embeddings using the Google Generative Language API.
 * Model: text-embedding-004 (768 dimensions)
 * Docs: https://ai.google.dev/gemini-api/docs/embeddings
 */
export class GeminiEmbeddings implements EmbeddingsProvider {
    constructor(
        private readonly apiKey: string,
        private readonly model: string = 'text-embedding-004' // 768 dimensions
    ) {}

    async embed(inputs: EmbedInput[]): Promise<Float32Array[]> {
        if (!this.apiKey) {
            throw new Error('[GeminiEmbeddings] apiKey is required');
        }

        const endpoint = `https://generativelanguage.googleapis.com/v1beta/models/${this.model}:embedContent?key=${encodeURIComponent(this.apiKey)}`;

        // Gemini commonly uses one request per item today; run sequentially here (can be batched/parallelized later)
        const out: Float32Array[] = [];
        for (const item of inputs) {
            const res = await fetch(endpoint, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    content: { parts: [{ text: item.text }] }
                }),
            });
            if (!res.ok) {
                const text = await res.text();
                throw new Error(`[GeminiEmbeddings] HTTP ${res.status}: ${text}`);
            }
            const json: {
                embedding: { values: number[] }
            } = await res.json();

            out.push(Float32Array.from(json.embedding.values));
        }
        return out;
    }
}
