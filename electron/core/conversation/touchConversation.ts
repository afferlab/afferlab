import type { Database } from 'better-sqlite3'

export function touchConversation(
    db: Database,
    conversationId: string,
    updatedAt: number = Date.now(),
): number {
    const result = db.prepare(`
        UPDATE conversations
        SET updated_at = ?
        WHERE id = ?
    `).run(updatedAt, conversationId)
    return result.changes ?? 0
}
