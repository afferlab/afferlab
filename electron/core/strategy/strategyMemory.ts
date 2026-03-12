import type { Database } from 'better-sqlite3'
import type {
    MemoryHit,
    MemoryIngestRequest,
    MemoryIngestResult,
    StrategyRecord,
} from '../../../contracts/index'
import { ingestDocument, readAsset, searchChunks } from '../memory/memoryStore'
import { getStrategyOrFallback } from './strategyRegistry'
import { resolveEmbeddingProfile } from '../memory/embeddingProfile'
import { resolveStrategyMemoryCloudFeature } from './strategyFeatures'
import { log } from '../logging/runtimeLogger'

type StrategyMemorySearchInput = {
    conversationId: string
    query: string
    options?: {
        topK?: number
        embeddingProfile?: string
    }
}

type StrategyMemoryReadInput = {
    conversationId: string
    assetId: string
    maxChars?: number
}

type StrategyMemoryIngestInput = MemoryIngestRequest

function errorToLog(err: unknown): string {
    if (err instanceof Error) return err.stack ?? err.message
    return String(err)
}

async function assertMemoryCloudEnabled(db: Database, conversationId: string): Promise<StrategyRecord> {
    if (!conversationId) throw new Error('conversationId required')
    const conversation = db.prepare(`SELECT id, strategy_id FROM conversations WHERE id = ?`)
        .get(conversationId) as { id?: string; strategy_id?: string | null } | undefined
    if (!conversation?.id) throw new Error('conversation not found')

    const resolved = getStrategyOrFallback(db, {
        requestedStrategyId: conversation.strategy_id ?? null,
        conversationId,
    })
    const enabled = await resolveStrategyMemoryCloudFeature(resolved.strategy)
    if (!enabled) throw new Error('MEMORY_CLOUD_DISABLED')
    return resolved.strategy
}

function stripEmbeddingOverride<T extends { embeddingProfile?: string }>(options?: T): T | undefined {
    if (!options) return options
    if (typeof options.embeddingProfile !== 'string' || options.embeddingProfile.trim().length <= 0) return options
    const next = { ...options }
    delete (next as { embeddingProfile?: string }).embeddingProfile
    return next
}

function toSimilarity(score: number, metric: 'cosine' | 'l2' | 'dot'): number {
    if (!Number.isFinite(score)) return 0
    if (metric === 'l2') {
        const dist = Math.max(0, -score)
        return 1 / (1 + dist)
    }
    const raw = (score + 1) / 2
    if (raw <= 0) return 0
    if (raw >= 1) return 1
    return raw
}

export async function strategyMemorySearch(
    db: Database,
    args: StrategyMemorySearchInput,
): Promise<MemoryHit[]> {
    const t0 = Date.now()
    const strategy = await assertMemoryCloudEnabled(db, args.conversationId)
    if (typeof args.options?.embeddingProfile === 'string' && args.options.embeddingProfile.trim().length > 0) {
        log('warn', '[MEMORY][embedding_profile_ignored]', {
            conversationId: args.conversationId,
            strategyId: strategy.id,
            requested: args.options.embeddingProfile,
            reason: 'single_embedding_space',
        })
    }
    const options = stripEmbeddingOverride(args.options)
    log('info', '[MEMORY_CLOUD][strategy_search_start]', {
        conversationId: args.conversationId,
        strategyId: strategy.id,
        queryLength: args.query?.length ?? 0,
        topK: options?.topK ?? null,
    })
    try {
        const request = {
            query: args.query,
            topK: options?.topK,
            embeddingProfile: undefined,
            scope: { type: 'conversation' as const, id: args.conversationId },
        }
        const result = await searchChunks(db, {
            conversationId: args.conversationId,
            request,
        })
        const profile = resolveEmbeddingProfile(undefined)
        const hits = result.chunks.map((chunk) => ({
            id: chunk.chunkId,
            type: 'chunk' as const,
            content: chunk.text,
            similarity: toSimilarity(chunk.score, profile.metric),
            assetId: chunk.assetId,
            chunkId: chunk.chunkId,
            source: {
                strategyId: strategy.id,
                conversationId: args.conversationId,
            },
        }))
        log('info', '[MEMORY_CLOUD][strategy_search_done]', {
            conversationId: args.conversationId,
            strategyId: strategy.id,
            elapsedMs: Date.now() - t0,
            count: hits.length,
        })
        return hits
    } catch (err) {
        log('error', '[MEMORY_CLOUD][strategy_search_error]', {
            conversationId: args.conversationId,
            strategyId: strategy.id,
            elapsedMs: Date.now() - t0,
            error: errorToLog(err),
        })
        throw err
    }
}

export async function strategyMemoryReadAsset(
    db: Database,
    args: StrategyMemoryReadInput,
): Promise<string> {
    const t0 = Date.now()
    const strategy = await assertMemoryCloudEnabled(db, args.conversationId)
    log('info', '[MEMORY_CLOUD][strategy_read_start]', {
        conversationId: args.conversationId,
        strategyId: strategy.id,
        assetId: args.assetId,
    })
    try {
        const detail = readAsset(db, {
            conversationId: args.conversationId,
            assetId: args.assetId,
            maxChars: args.maxChars,
        })
        const text = detail?.text ?? ''
        log('info', '[MEMORY_CLOUD][strategy_read_done]', {
            conversationId: args.conversationId,
            strategyId: strategy.id,
            assetId: args.assetId,
            elapsedMs: Date.now() - t0,
            textLength: text.length,
        })
        return text
    } catch (err) {
        log('error', '[MEMORY_CLOUD][strategy_read_error]', {
            conversationId: args.conversationId,
            strategyId: strategy.id,
            assetId: args.assetId,
            elapsedMs: Date.now() - t0,
            error: errorToLog(err),
        })
        throw err
    }
}

export async function strategyMemoryIngest(
    db: Database,
    args: StrategyMemoryIngestInput,
): Promise<MemoryIngestResult> {
    const t0 = Date.now()
    const strategy = await assertMemoryCloudEnabled(db, args.conversationId)
    if (typeof args.options?.embeddingProfile === 'string' && args.options.embeddingProfile.trim().length > 0) {
        log('warn', '[MEMORY][embedding_profile_ignored]', {
            conversationId: args.conversationId,
            strategyId: strategy.id,
            requested: args.options.embeddingProfile,
            reason: 'single_embedding_space',
        })
    }
    const options = stripEmbeddingOverride(args.options) ?? {}
    const wait = options.wait ?? 'load'
    const inputKind = args.assetId
        ? 'asset'
        : args.text
            ? 'text'
            : args.data
                ? 'bytes'
                : 'unknown'
    const ingestArgs: StrategyMemoryIngestInput = {
        ...args,
        options: {
            ...options,
            embeddingProfile: undefined,
        },
    }
    log('info', '[MEMORY_CLOUD][strategy_ingest_start]', {
        conversationId: args.conversationId,
        strategyId: strategy.id,
        inputKind,
        wait,
        assetId: args.assetId ?? null,
    })
    try {
        if (ingestArgs.assetId) {
            const detail = readAsset(db, {
                conversationId: ingestArgs.conversationId,
                assetId: ingestArgs.assetId,
            })
            if (!detail) {
                throw new Error('MEMORY_ASSET_NOT_FOUND')
            }
            const status = wait === 'load' ? 'loaded' : 'completed'
            const result: MemoryIngestResult = {
                assetId: ingestArgs.assetId,
                chunkCount: detail.chunkCount ?? 0,
                status,
            }
            log('info', status === 'loaded'
                ? '[MEMORY_CLOUD][strategy_ingest_loaded]'
                : '[MEMORY_CLOUD][strategy_ingest_completed]', {
                conversationId: args.conversationId,
                strategyId: strategy.id,
                inputKind,
                wait,
                assetId: ingestArgs.assetId,
                elapsedMs: Date.now() - t0,
            })
            return result
        }

        const result = await ingestDocument(db, ingestArgs)
        const phase = result.status === 'loaded'
            ? '[MEMORY_CLOUD][strategy_ingest_loaded]'
            : result.status === 'completed'
                ? '[MEMORY_CLOUD][strategy_ingest_completed]'
                : '[MEMORY_CLOUD][strategy_ingest_error]'
        log(result.status === 'failed' ? 'error' : 'info', phase, {
            conversationId: args.conversationId,
            strategyId: strategy.id,
            inputKind,
            wait,
            assetId: result.assetId,
            elapsedMs: Date.now() - t0,
        })
        return result
    } catch (err) {
        log('error', '[MEMORY_CLOUD][strategy_ingest_error]', {
            conversationId: args.conversationId,
            strategyId: strategy.id,
            inputKind,
            wait,
            assetId: args.assetId ?? null,
            elapsedMs: Date.now() - t0,
            error: errorToLog(err),
        })
        throw err
    }
}
