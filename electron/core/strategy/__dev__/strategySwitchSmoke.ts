import type { Database } from 'better-sqlite3'
import crypto from 'node:crypto'
import { TurnWriter } from '../../turnWriter'
import { DEFAULT_STRATEGY_ID, DEFAULT_STRATEGY_KEY, DEFAULT_STRATEGY_VERSION } from '../strategyScope'
import { startStrategySession } from '../strategySessionLedger'
import { switchConversationStrategy } from '../switchStrategy'

function createConversation(db: Database, id: string, title: string): void {
    const now = Date.now()
    db.prepare(`
        INSERT INTO conversations (
            id, title, created_at, updated_at, model, strategy_id, strategy_key, strategy_version
        )
        VALUES (?, ?, ?, ?, NULL, ?, ?, ?)
    `).run(id, title, now, now, DEFAULT_STRATEGY_ID, DEFAULT_STRATEGY_KEY, DEFAULT_STRATEGY_VERSION)
}

function createTurn(db: Database, conversationId: string, text: string): { turnId: string } {
    const turnWriter = new TurnWriter(db)
    const started = turnWriter.startTurn({
        conversationId,
        userContent: text,
        model: null,
    })
    turnWriter.finalizeTurn({
        turnId: started.turnId,
        assistantMessageId: started.assistantMessageId,
        status: 'completed',
        finalContent: `ok:${text}`,
    })
    return { turnId: started.turnId }
}

async function waitForReplay(
    db: Database,
    sessionId: string,
    timeoutMs = 2000,
): Promise<void> {
    const started = Date.now()
    while (Date.now() - started < timeoutMs) {
        const row = db.prepare(`
            SELECT status
            FROM conversation_strategy_sessions
            WHERE id = ?
        `).get(sessionId) as { status?: string } | undefined
        if (row?.status === 'completed') return
        if (row?.status === 'failed') {
            throw new Error(`[strategySmoke] replay failed: ${sessionId}`)
        }
        if (row?.status === 'cancelled') {
            throw new Error(`[strategySmoke] replay cancelled: ${sessionId}`)
        }
        await new Promise(resolve => setTimeout(resolve, 50))
    }
    throw new Error(`[strategySmoke] replay timeout: ${sessionId}`)
}

export async function runStrategySwitchSmoke(db: Database): Promise<void> {
    const suffix = crypto.randomUUID().slice(0, 8)
    const convId = `conv_strategy_smoke_${suffix}`
    createConversation(db, convId, `Strategy Smoke ${suffix}`)
    startStrategySession(db, {
        conversationId: convId,
        strategyId: DEFAULT_STRATEGY_ID,
        startedTseq: 1,
    })

    createTurn(db, convId, `turn1_${suffix}`)
    createTurn(db, convId, `turn2_${suffix}`)
    createTurn(db, convId, `turn3_${suffix}`)

    const noReplay = switchConversationStrategy(db, {
        conversationId: convId,
        strategyId: 'builtin:minimal',
        mode: 'no_replay',
    })
    if (noReplay.mode !== 'no_replay') {
        throw new Error('[strategySmoke] expected no_replay mode')
    }

    createTurn(db, convId, `turn4_${suffix}`)

    const replay = switchConversationStrategy(db, {
        conversationId: convId,
        strategyId: 'builtin:memory-first',
        mode: 'replay',
    })
    await waitForReplay(db, replay.sessionId)

    const lastEndRow = db.prepare(`
        SELECT ended_tseq
        FROM strategy_sessions
        WHERE conversation_id = ? AND strategy_id = ?
        ORDER BY ended_tseq DESC, created_at DESC
        LIMIT 1
    `).get(convId, 'builtin:memory-first') as { ended_tseq?: number | null } | undefined
    const lastEnd = lastEndRow?.ended_tseq ?? null
    if (lastEnd != null && replay.startTseq !== lastEnd + 1) {
        throw new Error('[strategySmoke] replay startTseq mismatch')
    }
}
