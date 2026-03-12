import { randomUUID } from 'node:crypto'
import type { Database } from 'better-sqlite3'
import { getDB } from '../../../db'
import { getAppSettings } from '../../settings/settingsStore'
import { getAvailableModel } from '../../models/modelRegistry'
import { getStrategyOrFallback } from '../strategyRegistry'
import { startStrategySession } from '../strategySessionLedger'
import { switchConversationStrategy } from '../switchStrategy'
import { strategyMemoryIngest, strategyMemoryReadAsset, strategyMemorySearch } from '../strategyMemory'

type SmokeContext = {
    conversationId: string
    strategyId?: string
}

function log(phase: string, ctx: SmokeContext, extra?: Record<string, unknown>) {
    console.log('[smoke][memory]', phase, {
        conversationId: ctx.conversationId,
        strategyId: ctx.strategyId ?? null,
        ...(extra ?? {}),
    })
}

function createConversationForSmoke(db: Database): SmokeContext {
    const id = randomUUID()
    const now = Date.now()
    const appSettings = getAppSettings(db)
    const candidateId = appSettings.last_used_model_id ?? null
    const available = getAvailableModel(candidateId)
    const modelToUse = available?.id ?? null
    const resolvedStrategy = getStrategyOrFallback(db, {
        requestedStrategyId: appSettings.active_strategy_id,
    })
    const strategyId = resolvedStrategy.strategy.id
    const strategyKey = resolvedStrategy.strategy.key
    const strategyVersion = resolvedStrategy.strategy.version

    db.prepare(`
        INSERT INTO conversations (
            id, title, title_source, created_at, updated_at, model, strategy_id, strategy_key, strategy_version, archived, summary, pinned
        )
        VALUES (?, 'Smoke conversation', 'default', ?, ?, ?, ?, ?, ?, 0, '', 0)
    `).run(id, now, now, modelToUse, strategyId, strategyKey, strategyVersion)

    startStrategySession(db, {
        conversationId: id,
        strategyId,
        startedTseq: 1,
    })

    return { conversationId: id, strategyId }
}

async function expectMemoryDisabled(label: string, fn: () => Promise<unknown>, ctx: SmokeContext) {
    try {
        await fn()
    } catch (err) {
        const msg = err instanceof Error ? err.message : String(err)
        if (msg.includes('MEMORY_CLOUD_DISABLED')) {
            log(`${label}:disabled`, ctx, { ok: true })
            return
        }
        throw err
    }
    throw new Error(`${label} should have failed with MEMORY_CLOUD_DISABLED`)
}

export async function runStrategyMemorySmoke(): Promise<void> {
    const db = getDB()
    const ctx = createConversationForSmoke(db)
    log('conversation:create', ctx)

    const minimal = switchConversationStrategy(db, {
        conversationId: ctx.conversationId,
        strategyId: 'builtin:minimal',
        mode: 'no_replay',
    })
    ctx.strategyId = minimal.strategyId
    log('strategy:switch', ctx, { target: 'builtin:minimal' })

    await expectMemoryDisabled('ingest', () => strategyMemoryIngest(db, {
        conversationId: ctx.conversationId,
        filename: 'disabled.txt',
        mime: 'text/plain',
        text: 'hello world',
        options: { wait: 'full' },
    }), ctx)
    await expectMemoryDisabled('search', () => strategyMemorySearch(db, {
        conversationId: ctx.conversationId,
        query: 'hello',
        options: { topK: 3 },
    }), ctx)

    const enabled = switchConversationStrategy(db, {
        conversationId: ctx.conversationId,
        strategyId: 'builtin:memory-first',
        mode: 'no_replay',
    })
    ctx.strategyId = enabled.strategyId
    log('strategy:switch', ctx, { target: 'builtin:memory-first' })

    const ingestStart = Date.now()
    const ingestResult = await strategyMemoryIngest(db, {
        conversationId: ctx.conversationId,
        filename: 'smoke.txt',
        mime: 'text/plain',
        text: 'hello world',
        options: { wait: 'full' },
    })
    log('ingest:done', ctx, {
        assetId: ingestResult.assetId,
        status: ingestResult.status,
        chunkCount: ingestResult.chunkCount,
        elapsedMs: Date.now() - ingestStart,
    })

    const readStart = Date.now()
    const preview = await strategyMemoryReadAsset(db, {
        conversationId: ctx.conversationId,
        assetId: ingestResult.assetId,
        maxChars: 2000,
    })
    log('read:done', ctx, {
        assetId: ingestResult.assetId,
        hasText: Boolean(preview && preview.length),
        elapsedMs: Date.now() - readStart,
    })
    if (!preview.includes('hello')) {
        throw new Error('readAsset did not return expected text')
    }

    const searchStart = Date.now()
    const hits = await strategyMemorySearch(db, {
        conversationId: ctx.conversationId,
        query: 'hello',
        options: { topK: 3 },
    })
    if (!Array.isArray(hits)) {
        throw new Error('search did not return an array')
    }
    if (hits.length === 0) {
        log('search:empty', ctx, { elapsedMs: Date.now() - searchStart })
    } else {
        const first = hits[0]
        log('search:hit', ctx, {
            assetId: first.assetId ?? null,
            chunkId: first.chunkId ?? first.id,
            similarity: first.similarity,
            preview: first.content.slice(0, 120),
            elapsedMs: Date.now() - searchStart,
        })
    }
}
