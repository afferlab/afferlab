import type { Database } from 'better-sqlite3'
import { getConversationStrategyScope } from '../strategy/strategyScope'
import type { StrategyScope } from '../../../contracts/index'

export function assertConversationId(conversationId: string): void {
    if (!conversationId) {
        throw new Error('[memoryStore] conversationId is required')
    }
}

export function assertStrategyScope(scope: StrategyScope): void {
    if (!scope.strategyKey || !scope.strategyVersion) {
        throw new Error('[memoryStore] strategy scope is required')
    }
}

export function resolveStrategyScope(
    db: Database,
    conversationId: string,
    input?: { strategyKey?: string; strategyVersion?: string },
): StrategyScope {
    const scope = getConversationStrategyScope(db, conversationId)
    return {
        conversationId,
        strategyKey: input?.strategyKey ?? scope.strategyKey,
        strategyVersion: input?.strategyVersion ?? scope.strategyVersion,
    }
}

export function resolveStrategyId(db: Database, conversationId: string): string | null {
    const row = db.prepare(`SELECT strategy_id FROM conversations WHERE id = ?`)
        .get(conversationId) as { strategy_id?: string | null } | undefined
    return row?.strategy_id ?? null
}

export function errorToLog(err: unknown): string {
    if (err instanceof Error) return err.stack ?? err.message
    return String(err)
}

export function mergeMeta(metaJson?: string | null, patch?: Record<string, unknown>): string | null {
    if (!patch) return metaJson ?? null
    let base: Record<string, unknown> = {}
    if (metaJson) {
        try { base = JSON.parse(metaJson) as Record<string, unknown> } catch { base = {} }
    }
    return JSON.stringify({ ...base, ...patch })
}
