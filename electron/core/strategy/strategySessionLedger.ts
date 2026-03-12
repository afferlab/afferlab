import type { Database } from 'better-sqlite3'
import { randomUUID } from 'node:crypto'

export function closeActiveStrategySession(
    db: Database,
    conversationId: string,
    endedTseq: number,
): void {
    db.prepare(`
        UPDATE strategy_sessions
        SET ended_tseq = ?
        WHERE conversation_id = ?
          AND ended_tseq IS NULL
    `).run(endedTseq, conversationId)
}

export function startStrategySession(
    db: Database,
    args: { conversationId: string; strategyId: string; startedTseq: number },
): string {
    const id = `ss_${randomUUID()}`
    db.prepare(`
        INSERT INTO strategy_sessions (id, conversation_id, strategy_id, started_tseq, ended_tseq, created_at)
        VALUES (?, ?, ?, ?, NULL, ?)
    `).run(id, args.conversationId, args.strategyId, args.startedTseq, Date.now())
    return id
}

export function getLatestEndedTseqForStrategy(
    db: Database,
    args: { conversationId: string; strategyId: string },
): number | null {
    const row = db.prepare(`
        SELECT ended_tseq
        FROM strategy_sessions
        WHERE conversation_id = ?
          AND strategy_id = ?
          AND ended_tseq IS NOT NULL
        ORDER BY ended_tseq DESC, created_at DESC
        LIMIT 1
    `).get(args.conversationId, args.strategyId) as { ended_tseq?: number | null } | undefined
    return row?.ended_tseq ?? null
}
