// electron/core/embeddings/openai.ts

import type { EmbedInput, EmbeddingsProvider } from './index'

export class OpenAIEmbeddings implements EmbeddingsProvider {
    constructor(
        private readonly apiKey: string,
        private readonly model: string = 'text-embedding-3-small' // 1536 dimensions
    ) {}

    async embed(inputs: EmbedInput[]): Promise<Float32Array[]> {
        if (!this.apiKey) {
            throw new Error('[OpenAIEmbeddings] apiKey is required');
        }

        // OpenAI supports batch requests
        const res = await fetch('https://api.openai.com/v1/embeddings', {
            method: 'POST',
            headers: {
                'Authorization': `Bearer ${this.apiKey}`,
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({
                model: this.model,
                input: inputs.map(i => i.text),
            }),
        });

        if (!res.ok) {
            const text = await res.text();
            throw new Error(`[OpenAIEmbeddings] HTTP ${res.status}: ${text}`);
        }

        const json: {
            data: Array<{ embedding: number[] }>
        } = await res.json();

        return json.data.map(d => Float32Array.from(d.embedding));
    }
}
