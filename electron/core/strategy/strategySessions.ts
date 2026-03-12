import type { Database } from 'better-sqlite3'
import crypto from 'node:crypto'

export type StrategySessionMode = 'no_replay' | 'replay'
export type StrategySessionStatus = 'running' | 'completed' | 'cancelled' | 'failed'

export function createStrategySession(
    db: Database,
    args: {
        conversationId: string
        strategyKey: string
        strategyVersion: string
        mode: StrategySessionMode
        status: StrategySessionStatus
        startTseq?: number | null
        endTseq?: number | null
    },
): string {
    const id = `ss_${crypto.randomUUID()}`
    const now = Date.now()
    db.prepare(`
        INSERT INTO conversation_strategy_sessions(
            id, conversation_id, strategy_key, strategy_version,
            started_at_ms, ended_at_ms,
            start_tseq, end_tseq, mode, status, last_processed_tseq
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
        id,
        args.conversationId,
        args.strategyKey,
        args.strategyVersion,
        now,
        args.status === 'running' ? null : now,
        args.startTseq ?? null,
        args.endTseq ?? null,
        args.mode,
        args.status,
        null
    )
    return id
}

export function updateStrategySession(
    db: Database,
    sessionId: string,
    patch: {
        status?: StrategySessionStatus
        endTseq?: number | null
        lastProcessedTseq?: number | null
        endedAtMs?: number | null
    },
): void {
    const fields: string[] = []
    const values: Array<string | number | null> = []
    if (patch.status) {
        fields.push('status = ?')
        values.push(patch.status)
    }
    if (patch.endTseq !== undefined) {
        fields.push('end_tseq = ?')
        values.push(patch.endTseq)
    }
    if (patch.lastProcessedTseq !== undefined) {
        fields.push('last_processed_tseq = ?')
        values.push(patch.lastProcessedTseq)
    }
    if (patch.endedAtMs !== undefined) {
        fields.push('ended_at_ms = ?')
        values.push(patch.endedAtMs)
    }
    if (!fields.length) return
    values.push(sessionId)
    db.prepare(`
        UPDATE conversation_strategy_sessions
        SET ${fields.join(', ')}
        WHERE id = ?
    `).run(...values)
}

export function cancelRunningSessions(
    db: Database,
    conversationId: string,
): void {
    const now = Date.now()
    db.prepare(`
        UPDATE conversation_strategy_sessions
        SET status = 'cancelled', ended_at_ms = ?
        WHERE conversation_id = ?
          AND status = 'running'
    `).run(now, conversationId)
}

export function getLatestCompletedEndTseq(
    db: Database,
    args: { conversationId: string; strategyKey: string; strategyVersion: string },
): number | null {
    const row = db.prepare(`
        SELECT end_tseq
        FROM conversation_strategy_sessions
        WHERE conversation_id = ?
          AND strategy_key = ?
          AND strategy_version = ?
          AND status = 'completed'
          AND end_tseq IS NOT NULL
        ORDER BY ended_at_ms DESC
        LIMIT 1
    `).get(args.conversationId, args.strategyKey, args.strategyVersion) as { end_tseq?: number | null } | undefined
    return row?.end_tseq ?? null
}

export function getLatestTseq(db: Database, conversationId: string): number {
    const row = db.prepare(`
        SELECT MAX(tseq) AS max_tseq
        FROM turns
        WHERE conversation_id = ?
    `).get(conversationId) as { max_tseq?: number | null } | undefined
    return row?.max_tseq ?? 0
}

