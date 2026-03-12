import { v4 as uuidv4 } from 'uuid'
import type { Database } from 'better-sqlite3'
import type { ConversationSnapshot } from '../../contracts/index'
import { getConversationSnapshot } from './conversation/getConversationSnapshot'

export interface TurnStartInput {
    conversationId: string
    userContent: string
    userContentParts?: unknown
    model?: string | null
    parentMessageId?: string | null
    idempotencyKey?: string | null
    userMessageId?: string
    assistantMessageId?: string
    turnId?: string
    timestampMs?: number
}

export interface TurnStartResult {
    turnId: string
    userMessageId: string
    assistantMessageId: string
}

export interface AssistantReplyStartInput {
    conversationId: string
    turnId: string
    userMessageId: string
    assistantMessageId?: string
    model?: string | null
    attemptNo?: number
    replyGroupId: string
    timestampMs?: number
}

export interface EnsureAssistantPlaceholderInput {
    conversationId: string
    turnId: string
    assistantMessageId: string
    model?: string | null
    parentUserId: string
    timestampMs?: number
}

export class TurnWriter {
    constructor(private db: Database) {}

    /** Create a turn + user message + assistant placeholder while preserving the current return contract. */
    startTurn(input: TurnStartInput): TurnStartResult {
        const now = input.timestampMs ?? Date.now()
        const turnId = input.turnId ?? uuidv4()
        const userMessageId = input.userMessageId ?? uuidv4()
        const assistantMessageId = input.assistantMessageId ?? uuidv4()
        const contentParts = input.userContentParts == null
            ? null
            : typeof input.userContentParts === 'string'
                ? input.userContentParts
                : JSON.stringify(input.userContentParts)
        const tx = this.db.transaction(() => {
            this.db.prepare(`
                INSERT INTO messages (
                    id, conversation_id, role, type, status, content, content_parts,
                    model, created_at, updated_at, parent_id
                )
                VALUES (?, ?, 'user', 'text', 'completed', ?, ?, NULL, ?, ?, ?)
            `).run(userMessageId, input.conversationId, input.userContent, contentParts, now, now, input.parentMessageId ?? null)

            this.db.prepare(`
                INSERT INTO turns (
                    id, conversation_id, user_message_id, status, idempotency_key,
                    created_at, updated_at, started_at
                )
                VALUES (?, ?, ?, 'running', ?, ?, ?, ?)
            `).run(turnId, input.conversationId, userMessageId, input.idempotencyKey ?? null, now, now, now)

            this.db.prepare(`UPDATE messages SET turn_id = ? WHERE id = ?`)
                .run(turnId, userMessageId)

            this.db.prepare(`
                INSERT INTO messages (
                    id, conversation_id, turn_id, role, type, status, content,
                    attempt_no, reply_group_id, created_at, updated_at, model, parent_id
                ) VALUES (
                    ?, ?, ?, 'assistant', 'text', 'progress', '',
                    1, ?, ?, ?, ?, ?
                )
            `).run(
                assistantMessageId,
                input.conversationId,
                turnId,
                turnId,
                now,
                now,
                input.model ?? null,
                userMessageId,
            )

            this.db.prepare(`UPDATE turns SET active_reply_id = ? WHERE id = ?`)
                .run(assistantMessageId, turnId)
        })
        tx()

        return { turnId, userMessageId, assistantMessageId }
    }

    /** Create a new assistant version for an existing turn (regen/rewrite). */
    startAssistantReply(input: AssistantReplyStartInput): string {
        const now = input.timestampMs ?? Date.now()
        const assistantMessageId = input.assistantMessageId ?? uuidv4()
        const attemptNo = input.attemptNo ?? this.nextAssistantAttempt(input.turnId)

        this.db.prepare(`
            INSERT INTO messages (
                id, conversation_id, turn_id, role, type, status, content,
                attempt_no, reply_group_id, created_at, updated_at, model, parent_id
            ) VALUES (
                ?, ?, ?, 'assistant', 'text', 'progress', '',
                ?, ?, ?, ?, ?, ?
            )
        `).run(
            assistantMessageId,
            input.conversationId,
            input.turnId,
            attemptNo,
            input.replyGroupId,
            now,
            now,
            input.model ?? null,
            input.userMessageId,
        )

        this.db.prepare(`UPDATE turns SET active_reply_id=?, status='running', updated_at=? WHERE id=?`)
            .run(assistantMessageId, now, input.turnId)
        this.db.prepare(`UPDATE conversations SET updated_at=? WHERE id=?`)
            .run(now, input.conversationId)

        return assistantMessageId
    }

    /** Insert a fallback placeholder while preserving current INSERT OR IGNORE behavior. */
    ensureAssistantPlaceholder(input: EnsureAssistantPlaceholderInput): void {
        const now = input.timestampMs ?? Date.now()
        this.db.prepare(`
            INSERT OR IGNORE INTO messages (
                id, conversation_id, turn_id, role, type, status, content,
                model, created_at, updated_at, parent_id
            ) VALUES (
                ?, ?, ?, 'assistant', 'text', 'progress', '', ?, ?, ?, ?
            )
        `).run(
            input.assistantMessageId,
            input.conversationId,
            input.turnId,
            input.model ?? null,
            now,
            now,
            input.parentUserId,
        )
    }

    /** Append streamed assistant delta (behavior must remain identical to the current flushToDB logic). */
    appendAssistantDelta(args: { assistantMessageId: string; delta: string; timestampMs?: number }): void {
        const now = args.timestampMs ?? Date.now()
        this.db.prepare(`
            UPDATE messages
            SET content   = content || ?,
                status    = 'progress',
                updated_at= ?
            WHERE id = ?
        `).run(args.delta, now, args.assistantMessageId)
    }

    updateMessageContentParts(args: {
        messageId: string
        contentParts: unknown
        timestampMs?: number
    }): void {
        const now = args.timestampMs ?? Date.now()
        const contentParts = args.contentParts == null
            ? null
            : typeof args.contentParts === 'string'
                ? args.contentParts
                : JSON.stringify(args.contentParts)
        this.db.prepare(`
            UPDATE messages
            SET content_parts = COALESCE(?, content_parts),
                updated_at = ?
            WHERE id = ?
        `).run(
            contentParts,
            now,
            args.messageId,
        )
    }

    /** Finalize by updating turn/message state, usage, finish_reason, error, active_reply_id, and related fields. */
    finalizeTurn(args: {
        turnId: string
        assistantMessageId: string
        status: 'completed' | 'aborted' | 'error'
        finishReason?: string | null
        usage?: { prompt?: number; completion?: number }
        latencyMs?: number | null
        error?: { code?: string; message?: string } | null
        finalContent?: string | null
        timestampMs?: number
        contentParts?: unknown
    }): void {
        const now = args.timestampMs ?? Date.now()
        const messageStatus = args.status === 'aborted' ? 'stopped' : args.status === 'error' ? 'error' : 'completed'
        const contentParts = args.contentParts == null
            ? null
            : typeof args.contentParts === 'string'
                ? args.contentParts
                : JSON.stringify(args.contentParts)

        this.db.prepare(`
            UPDATE messages
            SET status = ?,
                type = 'text',
                finish_reason = COALESCE(?, finish_reason),
                usage_tokens_prompt = COALESCE(?, usage_tokens_prompt),
                usage_tokens_completion = COALESCE(?, usage_tokens_completion),
                latency_ms = COALESCE(?, latency_ms),
                error_code = COALESCE(?, error_code),
                error_message = COALESCE(?, error_message),
                content_parts = COALESCE(?, content_parts),
                updated_at = ?,
                content = COALESCE(?, content)
            WHERE id = ?
        `).run(
            messageStatus,
            args.finishReason ?? null,
            args.usage?.prompt ?? null,
            args.usage?.completion ?? null,
            args.latencyMs ?? null,
            args.error?.code ?? null,
            args.error?.message ?? null,
            contentParts,
            now,
            args.finalContent ?? null,
            args.assistantMessageId,
        )

        if (args.status === 'completed') {
            this.db.prepare(`
                UPDATE turns
                SET status='completed',
                    active_reply_id=?,
                    ended_at=?,
                    updated_at=?
                WHERE id=?
            `).run(args.assistantMessageId, now, now, args.turnId)

            const conversationId = this.getConversationIdByTurn(args.turnId)
            if (conversationId) {
                this.db.prepare(`UPDATE conversations SET updated_at=? WHERE id=?`)
                    .run(now, conversationId)
            }
            return
        }

        if (args.status === 'aborted') {
            this.db.prepare(`
                UPDATE turns
                SET status='aborted',
                    stop_reason='aborted',
                    active_reply_id=?,
                    updated_at=?
                WHERE id=?
            `).run(args.assistantMessageId, now, args.turnId)
            return
        }

        this.db.prepare(`
            UPDATE turns
            SET status='error',
                stop_reason='error',
                active_reply_id=?,
                ended_at=?,
                updated_at=?
            WHERE id=?
        `).run(args.assistantMessageId, now, now, args.turnId)
    }

    private getConversationIdByTurn(turnId: string): string | null {
        const row = this.db.prepare(`SELECT conversation_id FROM turns WHERE id=?`)
            .get(turnId) as { conversation_id?: string } | undefined
        return row?.conversation_id ?? null
    }

    private nextAssistantAttempt(turnId: string): number {
        const row = this.db.prepare(`
            SELECT COALESCE(MAX(attempt_no),0)+1 AS nxt
            FROM messages
            WHERE turn_id = ? AND role = 'assistant'
        `).get(turnId) as { nxt?: number } | undefined
        return row?.nxt ?? 1
    }

    pruneConversationAfter(args: { conversationId: string; fromTurnSeq: number }): void {
        this.db.prepare(`
            DELETE FROM turns
            WHERE conversation_id = ?
              AND (tseq IS NULL OR tseq > ?)
        `).run(args.conversationId, args.fromTurnSeq)
    }

    pruneAndSnapshot(args: { conversationId: string; fromTurnSeq: number }): ConversationSnapshot {
        const tx = this.db.transaction(() => {
            this.pruneConversationAfter(args)
        })
        tx()
        return getConversationSnapshot(this.db, args.conversationId)
    }

    clearAssistantRepliesForTurn(turnId: string): void {
        this.db.prepare(`DELETE FROM messages WHERE turn_id = ? AND role = 'assistant'`)
            .run(turnId)
    }
}
