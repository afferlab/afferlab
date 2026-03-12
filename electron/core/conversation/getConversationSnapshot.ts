import type { Database } from 'better-sqlite3'
import type { ChatItemRow, UIMessage, ConversationSnapshot } from '../../../contracts/index'
import { messageTextFromParts, parseMessageContentParts } from '../../../shared/chat/contentParts'

const TURN_ANSWERS_SQL = `
    SELECT
        id,
        conversation_id,
        role,
        CASE
            WHEN status = 'progress' THEN 'progress'
            WHEN status = 'stopped' THEN 'stopped'
            WHEN status = 'error' THEN 'error'
            ELSE 'text'
        END AS type,
        model,
        parent_id,
        content,
        status AS messageStatus,
        finish_reason AS finishReason,
        error_code AS errorCode,
        error_message AS errorMessage,
        content_parts AS contentParts,
        latency_ms AS latencyMs,
        updated_at AS timestamp
    FROM messages
    WHERE turn_id = ? AND role = 'assistant'
    ORDER BY attempt_no, created_at
`

export function getTurnAnswers(db: Database, turnId: string): UIMessage[] {
    const rows = db.prepare(TURN_ANSWERS_SQL).all(turnId) as Array<UIMessage & { contentParts?: string | null }>
    return rows.map((row) => {
        const parsedParts = parseMessageContentParts(row.contentParts, row.content)
        const normalizedContent = messageTextFromParts(parsedParts, row.content)
        let rawError: unknown = undefined
        if (row.messageStatus === 'error' && typeof row.contentParts === 'string' && row.contentParts.trim().length > 0) {
            try {
                const parsed = JSON.parse(row.contentParts) as Record<string, unknown>
                rawError = parsed.attachmentError ?? parsed
            } catch {
                rawError = row.contentParts
            }
        }
        const { contentParts, ...base } = row
        void contentParts
        const next: UIMessage = {
            ...base,
            content: normalizedContent,
            ...(parsedParts.length > 0 ? { contentParts: parsedParts } : {}),
        }
        return rawError === undefined ? next : { ...next, rawError }
    })
}

export function getConversationSnapshot(
    db: Database,
    conversationId: string
): ConversationSnapshot {
    const turns = db.prepare(`
        SELECT * FROM chat_items
        WHERE conversation_id = ?
        ORDER BY tseq
    `).all(conversationId) as ChatItemRow[]

    const answersByTurn: Record<string, UIMessage[]> = {}
    for (const row of turns) {
        answersByTurn[row.turn_id] = getTurnAnswers(db, row.turn_id)
    }

    return { turns, answersByTurn }
}
