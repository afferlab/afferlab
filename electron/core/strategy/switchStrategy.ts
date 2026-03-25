import type { Database } from 'better-sqlite3'
import { getConversationSnapshot } from '../conversation/getConversationSnapshot'
import { isDBOpen } from '../../db'
import { getEffectiveStrategies } from '../settings/effectiveConfig'
import { getStrategyOrFallback } from './strategyRegistry'
import { getConversationStrategyScope, setConversationStrategy, DEFAULT_STRATEGY_ID, DEFAULT_STRATEGY_KEY, DEFAULT_STRATEGY_VERSION } from './strategyScope'
import { closeActiveStrategySession, getLatestEndedTseqForStrategy, startStrategySession } from './strategySessionLedger'
import { cancelRunningSessions, createStrategySession, getLatestTseq } from './strategySessions'
import { cancelReplayJob, getReplayBusy, startReplayJob } from './replayManager'
import { reindexConversationMemory } from '../memory/memoryStore'
import type { StrategySwitchMode } from '../../../contracts/index'

export type StrategySwitchInput = {
    conversationId: string
    mode: StrategySwitchMode
    strategyId?: string | null
    strategyKey?: string | null
    strategyVersion?: string | null
    webContentsId?: number
}

export type StrategySwitchResult = {
    sessionId: string
    mode: StrategySwitchMode
    startTseq: number
    latestTseq: number
    snapshot: ReturnType<typeof getConversationSnapshot>
    strategyId: string
    strategyKey: string
    strategyVersion: string
}

function resolveStrategyForSwitch(
    db: Database,
    args: StrategySwitchInput,
): { strategyId: string; strategyKey: string; strategyVersion: string } {
    const strategies = getEffectiveStrategies(db)
    const resolved = args.strategyId
        ? strategies.find(s => s.id === args.strategyId)
        : (args.strategyKey && args.strategyVersion)
            ? strategies.find(s => s.key === args.strategyKey && s.version === args.strategyVersion)
            : undefined

    if (resolved && !resolved.enabled) {
        throw new Error('strategy disabled')
    }

    const fallback = !resolved
        ? getStrategyOrFallback(db, { requestedStrategyId: args.strategyId ?? null })
        : { strategy: resolved }

    const strategyId = resolved?.id ?? fallback.strategy.id ?? DEFAULT_STRATEGY_ID
    const strategyKey = resolved?.key ?? fallback.strategy.key ?? args.strategyKey ?? DEFAULT_STRATEGY_KEY
    const strategyVersion = resolved?.version ?? fallback.strategy.version ?? args.strategyVersion ?? DEFAULT_STRATEGY_VERSION
    return { strategyId, strategyKey, strategyVersion }
}

function scheduleReindex(
    db: Database,
    args: { conversationId: string; strategyKey: string; strategyVersion: string },
): void {
    setImmediate(() => {
        const task = (async () => {
            if (!isDBOpen()) {
                console.debug('[MEMORY][bg]', 'skipped', {
                    reason: 'db closed',
                    conversationId: args.conversationId,
                    strategyKey: args.strategyKey,
                    strategyVersion: args.strategyVersion,
                })
                return
            }
            await reindexConversationMemory(db, {
                conversationId: args.conversationId,
                strategyKey: args.strategyKey,
                strategyVersion: args.strategyVersion,
            })
        })()

        pendingReindex.add(task)
        void task.catch((err) => {
            console.error('[MEMORY][bg]', 'reindex failed', {
                conversationId: args.conversationId,
                strategyKey: args.strategyKey,
                strategyVersion: args.strategyVersion,
                error: err instanceof Error ? err.stack ?? err.message : String(err),
            })
        }).finally(() => {
            pendingReindex.delete(task)
        })
    })
}

const pendingReindex = new Set<Promise<unknown>>()

export async function waitForPendingReindex(): Promise<void> {
    if (!pendingReindex.size) return
    await Promise.allSettled(Array.from(pendingReindex))
}

export function switchConversationStrategy(
    db: Database,
    args: StrategySwitchInput,
): StrategySwitchResult {
    const conversationId = args.conversationId
    const resolved = resolveStrategyForSwitch(db, args)

    const busy = getReplayBusy(conversationId)
    if (busy) {
        cancelReplayJob(busy.sessionId)
    }
    cancelRunningSessions(db, conversationId)

    setConversationStrategy(db, {
        conversationId,
        strategyId: resolved.strategyId,
        strategyKey: resolved.strategyKey,
        strategyVersion: resolved.strategyVersion,
    })

    const latestTseq = getLatestTseq(db, conversationId)
    const mode = args.mode
    let startTseq = mode === 'replay' ? 1 : latestTseq + 1
    let sessionId = ''

    if (mode === 'replay') {
        const lastEnd = getLatestEndedTseqForStrategy(db, {
            conversationId,
            strategyId: resolved.strategyId,
        })
        startTseq = lastEnd != null ? lastEnd + 1 : 1
        sessionId = createStrategySession(db, {
            conversationId,
            strategyKey: resolved.strategyKey,
            strategyVersion: resolved.strategyVersion,
            mode: 'replay',
            status: 'running',
            startTseq,
            endTseq: latestTseq,
        })

        const scope = getConversationStrategyScope(db, conversationId)
        startReplayJob({
            db,
            scope,
            sessionId,
            startTseq,
            endTseq: latestTseq,
            webContentsId: args.webContentsId,
        })
        scheduleReindex(db, {
            conversationId,
            strategyKey: resolved.strategyKey,
            strategyVersion: resolved.strategyVersion,
        })
    } else {
        sessionId = createStrategySession(db, {
            conversationId,
            strategyKey: resolved.strategyKey,
            strategyVersion: resolved.strategyVersion,
            mode: 'no_replay',
            status: 'completed',
        })
        scheduleReindex(db, {
            conversationId,
            strategyKey: resolved.strategyKey,
            strategyVersion: resolved.strategyVersion,
        })
    }

    const endTseq = mode === 'replay' ? Math.max(startTseq - 1, 0) : latestTseq
    closeActiveStrategySession(db, conversationId, endTseq)
    startStrategySession(db, {
        conversationId,
        strategyId: resolved.strategyId,
        startedTseq: mode === 'replay' ? startTseq : latestTseq + 1,
    })

    const snapshot = getConversationSnapshot(db, conversationId)
    return {
        sessionId,
        mode,
        startTseq,
        latestTseq,
        snapshot,
        strategyId: resolved.strategyId,
        strategyKey: resolved.strategyKey,
        strategyVersion: resolved.strategyVersion,
    }
}
