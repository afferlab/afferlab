import type { TurnStatus } from '../shared'

export interface ChatItemRow {
    turn_id: string
    conversation_id: string
    tseq: number | null

    turn_created_at: number | null
    turn_updated_at: number | null
    turn_status: TurnStatus
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
