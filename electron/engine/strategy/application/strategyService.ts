import { getDBSync } from '../../../db'
import { switchConversationStrategy } from '../../../core/strategy/switchStrategy'
import { updateStrategySession } from '../../../core/strategy/strategySessions'
import { cancelReplayJob } from '../../../core/strategy/replayManager'
import { getEffectiveStrategies } from '../../settings/services/effectiveConfig'
import { getStrategyOrFallback, listStrategies } from '../../../core/strategy/strategyRegistry'
import {
    getStrategyPrefs,
    getStrategyOverrideParams,
    setStrategyOverrideParams,
    setStrategyPrefs,
} from '../../settings/services/settingsStore'
import { resolveStrategyMemoryCloudFeature } from '../../../core/strategy/strategyFeatures'

import type {
    ConversationStrategyUpdateRequest,
    ConversationStrategyUpdateResponse,
    StrategyActiveInfo,
    StrategyDisableInput,
    StrategyInfo,
    StrategyManifest,
    StrategyParams,
    StrategyPrefs,
    StrategyPrefsInput,
    StrategyRecord,
    StrategySwitchInput,
    StrategySwitchRequest,
    StrategySwitchResponse,
    StrategyUsageCounts,
} from '../../../../contracts/index'

function safeJson<T>(raw: string | null | undefined, fallback: T): T {
    if (!raw) return fallback
    try {
        return JSON.parse(raw) as T
    } catch {
        return fallback
    }
}

async function toStrategyInfo(
    row: StrategyRecord,
    effectiveById: Map<string, { manifest: StrategyManifest; enabled: boolean }>,
): Promise<StrategyInfo> {
    const effective = effectiveById.get(row.id)
    const manifest = effective?.manifest ?? safeJson<StrategyManifest>(row.manifest_json ?? '{}', {})
    const capabilities = safeJson<Record<string, unknown>>(row.capabilities_json ?? '{}', {})
    const memoryCloud = await resolveStrategyMemoryCloudFeature(row)
    const configSchema = manifest?.configSchema ?? manifest?.paramsSchema
    const paramsSchema = configSchema
    return {
        id: row.id,
        key: row.key,
        source: row.source,
        meta: {
            name: row.name,
            description: row.description,
            version: manifest.dev?.metaVersion ?? row.version,
        },
        entry_path: row.entry_path,
        manifest,
        paramsSchema,
        configSchema,
        capabilities,
        enabled: effective?.enabled ?? row.enabled ?? true,
        features: { memoryCloud },
    }
}

function getUsageCounts(): StrategyUsageCounts {
    const db = getDBSync()
    const rows = db.prepare(`
        SELECT strategy_id, COUNT(*) AS total
        FROM conversations
        WHERE strategy_id IS NOT NULL
        GROUP BY strategy_id
    `).all() as Array<{ strategy_id: string; total: number }>
    const counts: StrategyUsageCounts = {}
    for (const row of rows) {
        counts[row.strategy_id] = row.total ?? 0
    }
    return counts
}

function resolveStrategyById(strategyId: string): StrategyRecord | null {
    const strategies = listStrategies(getDBSync())
    return strategies.find((strategy) => strategy.id === strategyId) ?? null
}

function getConversationStrategyLockState(
    conversationId: string,
): { id: string; strategy_id?: string | null; strategy_key?: string | null; strategy_version?: string | null } | null {
    const conversation = getDBSync().prepare(`
        SELECT id, strategy_id, strategy_key, strategy_version
        FROM conversations
        WHERE id = ?
    `).get(conversationId) as {
        id?: string
        strategy_id?: string | null
        strategy_key?: string | null
        strategy_version?: string | null
    } | undefined
    if (!conversation?.id) return null
    return {
        id: conversation.id,
        strategy_id: conversation.strategy_id,
        strategy_key: conversation.strategy_key,
        strategy_version: conversation.strategy_version,
    }
}

function assertConversationStrategyMutable(
    args: { conversationId: string; strategyId?: string | null; strategyKey?: string | null; strategyVersion?: string | null },
): { id: string; strategy_id?: string | null; strategy_key?: string | null; strategy_version?: string | null } {
    const conversation = getConversationStrategyLockState(args.conversationId)
    if (!conversation?.id) throw new Error('conversation not found')

    const currentStrategyId = conversation.strategy_id ?? null
    const isDevConversation = typeof currentStrategyId === 'string' && currentStrategyId.startsWith('dev:')
    if (!isDevConversation) return conversation

    const sameStrategyId = args.strategyId != null && args.strategyId === currentStrategyId
    const sameStrategyScope = (
        args.strategyKey != null
        && args.strategyVersion != null
        && args.strategyKey === (conversation.strategy_key ?? null)
        && args.strategyVersion === (conversation.strategy_version ?? null)
    )

    if (sameStrategyId || sameStrategyScope) {
        return conversation
    }

    throw new Error('DEV_CONVERSATION_STRATEGY_LOCKED')
}

function reassignConversations(args: { fromId: string; to: StrategyRecord }): number {
    const result = getDBSync().prepare(`
        UPDATE conversations
        SET strategy_id = ?,
            strategy_key = ?,
            strategy_version = ?
        WHERE strategy_id = ?
    `).run(args.to.id, args.to.key, args.to.version, args.fromId)
    return result.changes ?? 0
}

export function setConversationStrategy(req: StrategySwitchRequest, webContentsId?: number): StrategySwitchResponse {
    const conversationId = req.conversationId
    if (!conversationId) throw new Error('conversationId required')
    assertConversationStrategyMutable({
        conversationId,
        strategyKey: req.strategyKey,
        strategyVersion: req.strategyVersion,
    })
    if (!req.strategyKey) throw new Error('strategyKey required')
    if (!req.strategyVersion) throw new Error('strategyVersion required')

    return switchConversationStrategy(getDBSync(), {
        conversationId,
        mode: req.mode,
        strategyKey: req.strategyKey,
        strategyVersion: req.strategyVersion,
        webContentsId,
    }) as StrategySwitchResponse
}

export function cancelStrategyReplay(sessionId: string) {
    const db = getDBSync()
    const ok = cancelReplayJob(sessionId)
    if (!ok) {
        updateStrategySession(db, sessionId, {
            status: 'cancelled',
            endedAtMs: Date.now(),
        })
    }
    return { ok: true as const }
}

export function updateConversationStrategy(
    args: ConversationStrategyUpdateRequest,
    webContentsId?: number,
): ConversationStrategyUpdateResponse {
    if (!args?.conversationId) throw new Error('conversationId required')
    if (!args?.strategyId) throw new Error('strategyId required')

    assertConversationStrategyMutable({
        conversationId: args.conversationId,
        strategyId: args.strategyId,
    })

    const mode = args.mode ?? 'no_replay'
    const res = switchConversationStrategy(getDBSync(), {
        conversationId: args.conversationId,
        mode,
        strategyId: args.strategyId,
        webContentsId,
    })
    return {
        ok: true,
        sessionId: res.sessionId,
        mode: res.mode,
        startTseq: res.startTseq,
        latestTseq: res.latestTseq,
        snapshot: res.snapshot,
    }
}

export async function listStrategyInfo(): Promise<StrategyInfo[]> {
    const db = getDBSync()
    const effective = getEffectiveStrategies(db)
    const effectiveById = new Map(
        effective.map((entry) => [entry.id, { manifest: entry.manifest, enabled: entry.enabled }]),
    )
    const rows = listStrategies(db)
    return Promise.all(rows.map((row) => toStrategyInfo(row, effectiveById)))
}

export function getActiveStrategy(conversationId: string): StrategyActiveInfo {
    const db = getDBSync()
    if (!conversationId) throw new Error('conversationId required')
    const conversation = db.prepare(`SELECT id, strategy_id FROM conversations WHERE id = ?`)
        .get(conversationId) as { id?: string; strategy_id?: string | null } | undefined
    if (!conversation?.id) throw new Error('conversation not found')

    const resolved = getStrategyOrFallback(db, { requestedStrategyId: conversation.strategy_id ?? null })
    const session = db.prepare(`
            SELECT id
            FROM strategy_sessions
            WHERE conversation_id = ?
              AND ended_tseq IS NULL
            ORDER BY created_at DESC
            LIMIT 1
        `).get(conversationId) as { id?: string } | undefined

    return {
        strategyId: resolved.strategy.id,
        sessionId: session?.id ?? null,
    }
}

export function switchStrategy(args: StrategySwitchInput, webContentsId?: number): StrategyActiveInfo {
    const db = getDBSync()
    if (!args?.conversationId) throw new Error('conversationId required')
    if (!args?.strategyId) throw new Error('strategyId required')
    assertConversationStrategyMutable({
        conversationId: args.conversationId,
        strategyId: args.strategyId,
    })

    const mode = args.mode ?? 'no_replay'
    const res = switchConversationStrategy(db, {
        conversationId: args.conversationId,
        mode,
        strategyId: args.strategyId,
        webContentsId,
    })
    const session = db.prepare(`
            SELECT id
            FROM strategy_sessions
            WHERE conversation_id = ?
              AND ended_tseq IS NULL
            ORDER BY created_at DESC
            LIMIT 1
        `).get(args.conversationId) as { id?: string } | undefined

    return {
        strategyId: res.strategyId,
        sessionId: session?.id ?? null,
    }
}

export function getStrategyPrefsSnapshot(): StrategyPrefs {
    return getStrategyPrefs(getDBSync()) as StrategyPrefs
}

export function updateStrategyPrefs(next: StrategyPrefsInput) {
    return setStrategyPrefs(getDBSync(), next)
}

export function getStrategyUsageCounts(): StrategyUsageCounts {
    return getUsageCounts()
}

export function getStrategyParams(input: { strategyId: string }): StrategyParams {
    if (!input?.strategyId) throw new Error('strategyId required')
    return getStrategyOverrideParams(getDBSync(), input.strategyId) as StrategyParams
}

export function setStrategyParams(input: { strategyId: string; params?: Record<string, unknown> }): StrategyParams {
    if (!input?.strategyId) throw new Error('strategyId required')
    const params = (input.params && typeof input.params === 'object' && !Array.isArray(input.params))
        ? input.params
        : {}
    return setStrategyOverrideParams(getDBSync(), {
        strategyId: input.strategyId,
        params,
    }) as StrategyParams
}

export function disableStrategy(input: StrategyDisableInput) {
    const db = getDBSync()
    if (!input?.strategyId) throw new Error('strategyId required')

    const prefs = getStrategyPrefs(db)
    const nextEnabled = prefs.enabledIds.filter((id) => id !== input.strategyId)
    if (nextEnabled.length === 0) {
        throw new Error('at least one enabled strategy is required')
    }

    db.transaction(() => {
        const fallbackDefault = (input.reassignTo && nextEnabled.includes(input.reassignTo))
            ? input.reassignTo
            : nextEnabled[0]
        const defaultId = prefs.defaultId === input.strategyId ? fallbackDefault : prefs.defaultId
        setStrategyPrefs(db, { enabledIds: nextEnabled, defaultId })
    })()

    return { ok: true as const }
}

export function uninstallStrategy(input: StrategyDisableInput) {
    const db = getDBSync()
    if (!input?.strategyId) throw new Error('strategyId required')
    if (!input?.reassignTo) throw new Error('reassignTo required')
    if (input.strategyId === input.reassignTo) throw new Error('reassignTo must differ from strategyId')

    const target = resolveStrategyById(input.reassignTo)
    if (!target) throw new Error('reassignTo strategy not found')

    const victim = resolveStrategyById(input.strategyId)
    if (!victim) throw new Error('strategy not found')
    if (victim.source === 'builtin') throw new Error('builtin strategies cannot be uninstalled')

    const prefs = getStrategyPrefs(db)
    if (!prefs.enabledIds.includes(input.reassignTo)) {
        throw new Error('reassignTo strategy is not enabled')
    }

    db.transaction(() => {
        reassignConversations({ fromId: input.strategyId, to: target })
        const nextEnabled = prefs.enabledIds.filter((id) => id !== input.strategyId)
        const defaultId = prefs.defaultId === input.strategyId ? input.reassignTo : prefs.defaultId
        setStrategyPrefs(db, { enabledIds: nextEnabled, defaultId })
        db.prepare(`DELETE FROM strategies WHERE id = ?`).run(input.strategyId)
    })()

    return { ok: true as const }
}
