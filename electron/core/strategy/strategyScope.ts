import type { Database } from 'better-sqlite3'
import type { StrategyScope } from '../../../contracts/index'

export const DEFAULT_STRATEGY_KEY = 'default'
export const DEFAULT_STRATEGY_VERSION = '1'
export const DEFAULT_STRATEGY_ID = 'builtin:memory-first'

export function normalizeStrategyScope(input: Partial<StrategyScope>): StrategyScope {
    return {
        conversationId: input.conversationId ?? '',
        strategyKey: input.strategyKey ?? DEFAULT_STRATEGY_KEY,
        strategyVersion: input.strategyVersion ?? DEFAULT_STRATEGY_VERSION,
    }
}

export function getConversationStrategyScope(db: Database, conversationId: string): StrategyScope {
    const row = db.prepare(`
        SELECT strategy_id, strategy_key, strategy_version
        FROM conversations
        WHERE id = ?
    `).get(conversationId) as { strategy_id?: string | null; strategy_key?: string | null; strategy_version?: string | null } | undefined

    const strategyRow = row?.strategy_id
        ? (db.prepare(`SELECT key, version FROM strategies WHERE id = ?`)
            .get(row.strategy_id) as { key?: string | null; version?: string | null } | undefined)
        : undefined

    return {
        conversationId,
        strategyKey: strategyRow?.key ?? row?.strategy_key ?? DEFAULT_STRATEGY_KEY,
        strategyVersion: strategyRow?.version ?? row?.strategy_version ?? DEFAULT_STRATEGY_VERSION,
    }
}

export function setConversationStrategy(
    db: Database,
    args: { conversationId: string; strategyId?: string; strategyKey?: string; strategyVersion?: string },
): void {
    const strategyId = args.strategyId ?? null
    let strategyKey = args.strategyKey ?? null
    let strategyVersion = args.strategyVersion ?? null
    if (strategyId) {
        const row = db.prepare(`
            SELECT key, version
            FROM strategies
            WHERE id = ?
        `).get(strategyId) as { key?: string; version?: string } | undefined
        if (row?.key) strategyKey = row.key
        if (row?.version) strategyVersion = row.version
    }
    db.prepare(`
        UPDATE conversations
        SET strategy_id = ?, strategy_key = ?, strategy_version = ?
        WHERE id = ?
    `).run(
        strategyId ?? DEFAULT_STRATEGY_ID,
        strategyKey ?? DEFAULT_STRATEGY_KEY,
        strategyVersion ?? DEFAULT_STRATEGY_VERSION,
        args.conversationId,
    )
}
