import type { Database } from 'better-sqlite3'
import type { UIMessage } from '../../../contracts/index'
import { messageTextFromParts, parseMessageContentParts } from '../../../shared/chat/contentParts'

export type MainlineHistoryArgs = {
    conversationId: string
    cutoffTseq?: number | null
    includeCutoffTurn?: boolean
    onlyCompletedAssistants?: boolean
}

// NULL tseq should sort last and be pruned consistently with downstream deletes.
const NULL_TSEQ_SORT = 2147483647

export function getMainlineHistory(
    db: Database,
    args: MainlineHistoryArgs
): UIMessage[] {
    const cutoffTseq = args.cutoffTseq ?? null
    const includeCutoffTurn = args.includeCutoffTurn ?? true
    // When true, keep finalized assistant messages and exclude in-flight progress rows.
    const onlyCompletedAssistants = args.onlyCompletedAssistants ?? true

    const rows = db.prepare(`
        WITH ordered_turns AS (
            SELECT
                id,
                user_message_id,
                active_reply_id,
                tseq,
                CASE
                    WHEN tseq IS NULL THEN ${NULL_TSEQ_SORT}
                    ELSE tseq
                END AS sort_tseq
            FROM turns
            WHERE conversation_id = ?
              AND (
                ? IS NULL
                OR (
                    tseq IS NOT NULL
                    AND (
                        tseq < ?
                        OR (? = 1 AND tseq = ?)
                    )
                )
              )
        ),
        ordered_messages AS (
            SELECT
                ot.sort_tseq AS sort_tseq,
                0 AS role_rank,
                um.id,
                um.conversation_id,
                um.role,
                um.model,
                um.parent_id,
                um.content,
                um.content_parts,
                um.updated_at AS timestamp
            FROM ordered_turns ot
            JOIN messages um ON um.id = ot.user_message_id
            UNION ALL
            SELECT
                ot.sort_tseq AS sort_tseq,
                1 AS role_rank,
                am.id,
                am.conversation_id,
                am.role,
                am.model,
                am.parent_id,
                am.content,
                am.content_parts,
                am.updated_at AS timestamp
            FROM ordered_turns ot
            JOIN messages am ON am.id = ot.active_reply_id
            WHERE ot.active_reply_id IS NOT NULL
              AND (? = 0 OR am.status IN ('completed', 'stopped'))
        )
        SELECT
            id,
            conversation_id,
            role,
            'text' AS type,
            model,
            parent_id,
            content,
            content_parts AS contentParts,
            timestamp
        FROM ordered_messages
        WHERE (
            (content IS NOT NULL AND LENGTH(TRIM(content)) > 0)
            OR (content_parts IS NOT NULL AND LENGTH(TRIM(content_parts)) > 0)
        )
        ORDER BY sort_tseq, role_rank, timestamp, id
    `).all(
        args.conversationId,
        cutoffTseq,
        cutoffTseq,
        includeCutoffTurn ? 1 : 0,
        cutoffTseq,
        onlyCompletedAssistants ? 1 : 0,
    ) as Array<UIMessage & { contentParts?: string | null }>

    return rows.map((row) => {
        const parts = parseMessageContentParts(row.contentParts, row.content)
        const content = messageTextFromParts(parts, row.content)
        const { contentParts, ...rest } = row
        void contentParts
        return parts.length > 0
            ? { ...rest, content, contentParts: parts }
            : { ...rest, content }
    })
}
