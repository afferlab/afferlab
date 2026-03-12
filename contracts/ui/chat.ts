import type { UIMessage } from './UIMessage'

export interface ChatItemRow {
    turn_id: string
    conversation_id: string
    tseq: number | null
    turn_created_at: number | null
    turn_updated_at: number | null
    turn_status: 'running' | 'completed' | 'aborted' | 'error'
    stop_reason?: string | null

    user_msg_id: string
    user_text: string | null
    user_content_parts: string | null
    user_time: number | null

    asst_msg_id: string | null
    asst_text: string | null
    asst_content_parts: string | null
    asst_time: number | null
    asst_model: string | null
}

export interface ConvoListRow {
    id: string
    project_id?: string | null
    title: string
    updated_at: number
    archived: 0 | 1
    pinned: 0 | 1
    model?: string | null
    last_user_snippet?: string | null
}

export interface ConversationSnapshot {
    turns: ChatItemRow[]
    answersByTurn: Record<string, UIMessage[]>
}

export interface StartGenResponse {
    placeholder: UIMessage
    snapshot: ConversationSnapshot
    meta?: { turnId: string; conversationId: string; started?: boolean }
}
