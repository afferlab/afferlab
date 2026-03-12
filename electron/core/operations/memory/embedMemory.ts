// electron/core/operations/memory/embedMemory.ts
import type { Database } from 'better-sqlite3'
import { createEmbeddingsProvider, embedTexts, LocalHashEmbeddings } from '../../embeddings'
import { newVectorId, type Metric, type Level } from '../../vectorService'
import { getMemoryItemForEmbedding, upsertMemoryVector } from '../../memory/memoryStore'

type RawModality = 'text' | 'image' | 'audio' | 'video' | 'file'
type VecModality = 'text' | 'image' | 'audio' | 'video'

function toVecModality(m?: RawModality): VecModality {
    // Treat 'file' (a container type) as 'text' on the vector side; unknown/default also falls back to 'text'
    if (m === 'image' || m === 'audio' || m === 'video') return m
    return 'text'
}

/** Embed an existing memory item and write it to the vector store (Gemini by default). */
export async function embedMemory(
    db: Database,
    memoryId: string,
    opts?: {
        conversationId: string
        provider?: 'gemini' | 'openai' | 'local'
        apiKeyEnv?: string
        model?: string
        dim?: number
        metric?: Metric
        level?: Level
        basis?: string
        modality?: VecModality
    }
): Promise<void> {
    const conversationId = opts?.conversationId
    if (!conversationId) {
        throw new Error('[embedMemory] conversationId is required')
    }
    const row = getMemoryItemForEmbedding(db, { conversationId, memoryId })
    if (!row) throw new Error(`[embedMemory] memory ${memoryId} not found`)
    const basis = (opts?.basis ?? row.text ?? '').trim()
    if (!basis) return

    const providerName = opts?.provider ?? 'gemini'
    const model = opts?.model ?? (providerName === 'gemini' ? 'text-embedding-004' : 'text-embedding-3-small')
    const metric: Metric = opts?.metric ?? 'cosine'
    const level:  Level  = opts?.level  ?? 'mem'
    const apiKey = opts?.apiKeyEnv ? process.env[opts?.apiKeyEnv] : undefined

    const provider =
        providerName === 'local'
            ? new LocalHashEmbeddings(opts?.dim ?? 256)
            : createEmbeddingsProvider(providerName, apiKey)

    const embedded = await embedTexts(provider, [basis])
    const dim = opts?.dim ?? (embedded.dim > 0 ? embedded.dim : 768)
    const vecId = newVectorId('vec')
    const vec   = embedded.vectors[0]

    const raw: RawModality | undefined = opts?.modality ?? row.modality
    const modalityForVec: VecModality = toVecModality(raw)
    upsertMemoryVector(db, {
        conversationId,
        vecId,
        memoryId,
        model,
        modality: modalityForVec,
        dim,
        metric,
        level,
        vector: vec,
    })
}
