import type { LLMModelConfig, UIMessage, StreamTimingTrace, TurnAttachment, TurnRunMode } from '../../contracts/index'
import { startTurnFlow } from '../core/flow/ChatFlow'

export type ExecuteTurnParams = {
    conversationId: string
    turnId: string
    userMessageId: string
    replyId: string
    model: LLMModelConfig
    history: UIMessage[]
    webContentsId?: number
    mode?: TurnRunMode
    abortSignal?: AbortSignal
    trace?: StreamTimingTrace
    traceId?: string
    forceWebSearch?: boolean
    attachments?: TurnAttachment[]
    inputText?: string
}

export async function executeTurn(params: ExecuteTurnParams): Promise<void> {
    const {
        conversationId,
        turnId,
        userMessageId,
        replyId,
        model,
        history,
        webContentsId,
        trace,
        traceId,
        forceWebSearch,
        attachments,
        inputText,
    } = params

    return startTurnFlow({
        conversationId,
        turnId,
        replyId,
        model,
        history,
        parentUserId: userMessageId,
        webContentsId,
        trace,
        traceId,
        forceWebSearch,
        attachments,
        inputText,
        mode: params.mode,
    })
}
