import type { Role, TurnStatus } from '../shared'
import type { MessageContentPart } from '../contentParts'

export type MessageRole = Extract<Role, 'user' | 'assistant' | 'system'>
export type MessageType = 'text' | 'loading' | 'progress' | 'error' | 'stopped' // more type here

export type StreamingSegment = {
    id: string
    text: string
    ts: number
}

export interface UIMessage {
    id: string
    conversation_id: string
    role: MessageRole
    type: MessageType
    model?: string | null
    parent_id?: string
    content: string
    contentParts?: MessageContentPart[]
    timestamp: number
    turn_id?: string,
    cutoff_tseq?: number,
    messageStatus?: string | null
    finishReason?: string | null
    errorCode?: string | null
    errorMessage?: string | null
    latencyMs?: number | null
    providerId?: string | null
    rawError?: unknown
}

export type { TurnStatus }
