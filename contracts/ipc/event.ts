import type { UIMessage } from '../ui/UIMessage';
import type { TurnAttachment } from '../attachment'

export interface SendMessagePayload extends UIMessage {
    /** Final assistant message id for this turn (= reply_id); the renderer may pre-generate it. */
    reply_id?: string;
    /** Used for logging only: model id selected in the UI. */
    ui_selected_model_id?: string;
    /** Force web search for this turn only. */
    force_web_search?: boolean;
    /** Native attachments for this turn (must use the provider file/media path). */
    attachments?: TurnAttachment[];
    /** Trace id associated with one send/rewrite operation. */
    traceId?: string;
}

export interface SendMessageResult {
    turnId: string
    userMessageId: string
    assistantMessageId: string
}

export type DoneReason =
    | 'completed'
    | 'stop'
    | 'already_finalized'
    | 'length'
    | 'safety'
    | 'aborted'
    | 'error'
    | string // allow provider-specific values

export interface DoneMeta {
    elapsedMs?: number
    resumed?: boolean
    reason?: DoneReason
    [k: string]: unknown
}

export interface LlmStreamStartedEventData {
    conversation_id: string
    reply_id: string
    turn_id: string
    model_id?: string
    provider_id?: string
}

export interface LlmStreamChunkEventData {
    conversation_id: string
    reply_id: string
    turn_id: string
    chunk: string
    model_id?: string
    provider_id?: string
    meta?: Record<string, unknown>
}

export interface LlmStreamDoneEventData {
    conversation_id: string
    reply_id: string
    turn_id: string
    final_content?: string
    model_id?: string
    provider_id?: string
    meta?: DoneMeta
}

export interface ConversationTitleUpdatedEventData {
    conversation_id: string
    old_title: string
    new_title: string
    source: 'auto' | 'user'
    title_source: 'auto' | 'user' | 'default'
    updated_at: number
}
