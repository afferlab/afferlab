export type StreamTimingTrace = {
    t0: number
    t_ctx_start?: number
    t_ctx_done?: number
    t_llm_request_start?: number
    t_first_chunk?: number
    t_done?: number
    t_finalize_start?: number
    t_db_finalize_done?: number
    chunk_count?: number
    chunk_chars?: number
}

export type TurnRunMode = 'normal' | 'regen' | 'rewrite'

export type StreamTask = {
    conversationId: string
    replyId: string
    mode?: TurnRunMode
    cancelled: boolean
    lastFlushAt: number
    buffered: string
    startedAt?: number
    tokenCount?: number
    abortController?: AbortController
    trace?: StreamTimingTrace
}
