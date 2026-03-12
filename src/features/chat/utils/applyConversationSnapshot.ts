import { chatStore } from '@/features/chat/state/chatStore'
import { rowToTurn } from '@/features/chat/utils/rowToTurn'
import type { ConversationSnapshot } from '@contracts'

const snapshotCache = new Map<string, ConversationSnapshot>()

export function applyConversationSnapshot(snapshot: ConversationSnapshot): void {
    const conversationId = snapshot.turns[0]?.conversation_id
    if (conversationId) snapshotCache.set(conversationId, snapshot)
    const rows = snapshot.turns
        .slice()
        .sort((a, b) => (a.tseq ?? 0) - (b.tseq ?? 0))
    const { replaceTurns, setTurnAssistants } = chatStore.getState()
    replaceTurns(rows.map(rowToTurn))
    for (const row of rows) {
        const answers = snapshot.answersByTurn[row.turn_id] ?? []
        const activeId = row.asst_msg_id || undefined
        setTurnAssistants(row.turn_id, answers, activeId)
    }
}

export function getLastSnapshot(conversationId: string): ConversationSnapshot | undefined {
    return snapshotCache.get(conversationId)
}
