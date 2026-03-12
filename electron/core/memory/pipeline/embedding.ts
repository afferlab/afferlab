import { l2Normalize } from '../../vectorService'
import { embedTextsWithProfile, resolveEmbeddingProfile, type EmbeddingProfile } from '../embeddingProfile'

export { embedTextsWithProfile, resolveEmbeddingProfile }

export function normalizeEmbedding(profile: EmbeddingProfile, vector: Float32Array): Float32Array {
    return profile.metric === 'cosine' ? l2Normalize(vector) : vector
}
