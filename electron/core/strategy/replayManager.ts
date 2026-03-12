import { webContents, type WebContents } from 'electron'
import type { Database } from 'better-sqlite3'
import type { StrategyScope, StrategyReplayProgressEvent, StrategyReplayStartedEvent, StrategyReplayDoneEvent } from '../../../contracts/index'
import { StrategyHost } from '../../strategies/strategyHost'
import { updateStrategySession } from './strategySessions'

type ReplayBusy = { kind: 'replay'; sessionId: string }

type ReplayJobParams = {
    db: Database
    scope: StrategyScope
    sessionId: string
    startTseq: number
    endTseq: number
    webContentsId?: number
}

class ReplayJob {
    private cancelled = false
    private readonly host: StrategyHost

    constructor(private params: ReplayJobParams) {
        this.host = new StrategyHost(params.db)
    }

    cancel(): void {
        this.cancelled = true
    }

    async run(): Promise<void> {
        const { db, scope, sessionId, startTseq, endTseq, webContentsId } = this.params
        try {
            const turns = db.prepare(`
                SELECT
                    t.id,
                    t.tseq,
                    t.user_message_id,
                    t.active_reply_id,
                    u.content AS user_content,
                    a.content AS assistant_content,
                    a.status  AS assistant_status
                FROM turns t
                JOIN messages u ON u.id = t.user_message_id
                LEFT JOIN messages a ON a.id = t.active_reply_id
                WHERE t.conversation_id = ?
                  AND t.tseq IS NOT NULL
                  AND t.tseq >= ?
                  AND t.tseq <= ?
                ORDER BY t.tseq ASC
            `).all(scope.conversationId, startTseq, endTseq) as Array<{
                id: string
                tseq: number
                user_message_id: string
                active_reply_id?: string | null
                user_content?: string | null
                assistant_content?: string | null
                assistant_status?: string | null
            }>

            if (this.cancelled) {
                updateStrategySession(db, sessionId, {
                    status: 'cancelled',
                    endedAtMs: Date.now(),
                })
                emitReplayDone(webContentsId, { sessionId, status: 'cancelled' })
                return
            }

            emitReplayStarted(webContentsId, {
                sessionId,
                conversationId: scope.conversationId,
                strategyKey: scope.strategyKey,
                strategyVersion: scope.strategyVersion,
                startTseq,
                endTseq,
            })

            let processed = 0
            for (const turn of turns) {
                if (this.cancelled) {
                    updateStrategySession(db, sessionId, {
                        status: 'cancelled',
                        endedAtMs: Date.now(),
                        lastProcessedTseq: turn.tseq - 1,
                    })
                    emitReplayDone(webContentsId, { sessionId, status: 'cancelled' })
                    return
                }
                await this.host.runReplayTurn({
                    scope,
                    turnId: turn.id,
                    tseq: turn.tseq,
                    user: {
                        id: turn.user_message_id,
                        content: turn.user_content ?? '',
                    },
                    assistant: turn.active_reply_id
                        ? {
                            id: turn.active_reply_id,
                            content: turn.assistant_content ?? '',
                            status: turn.assistant_status ?? undefined,
                        }
                        : undefined,
                })
                processed += 1
                updateStrategySession(db, sessionId, { lastProcessedTseq: turn.tseq })
                emitReplayProgress(webContentsId, {
                    sessionId,
                    processed,
                    total: turns.length,
                    currentTseq: turn.tseq,
                })
            }

            updateStrategySession(db, sessionId, {
                status: 'completed',
                endTseq,
                endedAtMs: Date.now(),
                lastProcessedTseq: endTseq,
            })
            emitReplayDone(webContentsId, { sessionId, status: 'completed' })
        } catch (err) {
            updateStrategySession(db, sessionId, {
                status: 'failed',
                endedAtMs: Date.now(),
            })
            emitReplayDone(webContentsId, { sessionId, status: 'failed' })
            throw err
        }
    }
}

const jobsBySession = new Map<string, ReplayJob>()
const busyByConversation = new Map<string, ReplayBusy>()

function emitToWebContents(
    webContentsId: number | undefined,
    channel: string,
    payload: unknown,
): void {
    const targets: WebContents[] = []
    if (webContentsId !== undefined) {
        const target = webContents.fromId(webContentsId)
        if (target && !target.isDestroyed?.()) targets.push(target)
    } else {
        targets.push(...webContents.getAllWebContents())
    }
    for (const target of targets) {
        try {
            target.send(channel, payload)
        } catch {
            // ignore send failures
        }
    }
}

function emitReplayStarted(webContentsId: number | undefined, payload: StrategyReplayStartedEvent): void {
    emitToWebContents(webContentsId, 'strategy-replay-started', payload)
}

function emitReplayProgress(webContentsId: number | undefined, payload: StrategyReplayProgressEvent): void {
    emitToWebContents(webContentsId, 'strategy-replay-progress', payload)
}

function emitReplayDone(webContentsId: number | undefined, payload: StrategyReplayDoneEvent): void {
    emitToWebContents(webContentsId, 'strategy-replay-done', payload)
}

export function startReplayJob(params: ReplayJobParams): void {
    const job = new ReplayJob(params)
    jobsBySession.set(params.sessionId, job)
    busyByConversation.set(params.scope.conversationId, { kind: 'replay', sessionId: params.sessionId })
    void job.run().finally(() => {
        jobsBySession.delete(params.sessionId)
        const busy = busyByConversation.get(params.scope.conversationId)
        if (busy?.sessionId === params.sessionId) {
            busyByConversation.delete(params.scope.conversationId)
        }
    })
}

export function cancelReplayJob(sessionId: string): boolean {
    const job = jobsBySession.get(sessionId)
    if (!job) return false
    job.cancel()
    return true
}

export function getReplayBusy(conversationId: string): ReplayBusy | null {
    return busyByConversation.get(conversationId) ?? null
}

export function clearReplayBusy(conversationId: string): void {
    busyByConversation.delete(conversationId)
}
