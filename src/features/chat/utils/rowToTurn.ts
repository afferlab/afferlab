import type { ChatItemRow, UIMessage, UITurn, TurnStatus } from '@contracts'
import { messageTextFromParts, parseMessageContentParts } from '@shared/chat/contentParts'

function toTurnStatus(r: ChatItemRow): TurnStatus {
    switch (r.turn_status) {
        case 'completed':
            return 'completed'
        case 'aborted':
            return 'aborted'
        case 'error':
            return 'error'
        case 'running':
            return 'running'
        default:
            return (r.asst_text && r.asst_text.trim().length > 0)
                ? 'completed'
                : 'running'
    }
}

export function rowToTurn(r: ChatItemRow): UITurn {
    const userParts = parseMessageContentParts(r.user_content_parts, r.user_text ?? '')
    const user: UIMessage = {
        id: r.user_msg_id,
        conversation_id: r.conversation_id,
        role: 'user',
        type: 'text',
        content: messageTextFromParts(userParts, r.user_text ?? ''),
        ...(userParts.length > 0 ? { contentParts: userParts } : {}),
        timestamp: r.user_time ?? r.turn_created_at ?? Date.now(),
    }

    const status: TurnStatus = toTurnStatus(r)

    const assistantType: UIMessage['type'] = status === 'running'
        ? 'progress'
        : status === 'error'
            ? 'error'
            : status === 'aborted'
                ? 'stopped'
                : 'text'

    const assistantParts = parseMessageContentParts(r.asst_content_parts, r.asst_text ?? '')
    const assistant: UIMessage = r.asst_msg_id
        ? {
            id: r.asst_msg_id,
            conversation_id: r.conversation_id,
            role: 'assistant',
            type: assistantType,
            model: r.asst_model ?? undefined,
            parent_id: r.user_msg_id,
            content: messageTextFromParts(assistantParts, r.asst_text ?? ''),
            ...(assistantParts.length > 0 ? { contentParts: assistantParts } : {}),
            timestamp: r.asst_time ?? r.turn_updated_at ?? r.user_time ?? Date.now(),
        }
        : {
            id: `asst-${r.turn_id}`,
            conversation_id: r.conversation_id,
            role: 'assistant',
            type: 'loading',
            model: r.asst_model ?? undefined,
            parent_id: r.user_msg_id,
            content: '',
            timestamp: r.turn_updated_at ?? r.user_time ?? Date.now(),
        }

    return {
        id: r.turn_id,
        conversation_id: r.conversation_id,
        tseq: r.tseq ?? undefined,
        status,
        stopReason: r.stop_reason ?? undefined,
        user,
        assistants: [assistant],     // keep assistants as an array
        currentAssistantIndex: 0,    // default to the first assistant version
    }
}
