// electron/core/flow/ChatFlow.ts

import type { UIMessage, LLMModelConfig, StreamTimingTrace, TurnAttachment, TurnRunMode } from '../../../contracts/index'
import { streamManager } from '../../engine/chat/streaming/StreamManager'
import { getDB } from '../../db'
import { StrategyHost } from '../../engine/strategy/host/createStrategyHost'

export type StartTurnParams = {
    conversationId: string
    turnId: string
    replyId: string
    model: LLMModelConfig
    history: UIMessage[]
    parentUserId: string
    webContentsId?: number
    trace?: StreamTimingTrace
    traceId?: string
    forceWebSearch?: boolean
    attachments?: TurnAttachment[]
    inputText?: string
    mode?: TurnRunMode
}

/**
 * ChatFlow: central orchestration layer
 *
 * It does only four things:
 *  1. Call the context strategy runner and get a ContextSession
 *  2. Read the final context from the session
 *  3. Measure the final context and write metrics / store updates
 *  4. Hand the final context to StreamManager for model execution
 *
 * ❌ Do not implement any "default trimming policy" here
 * ❌ Do not add logic such as if usedRatio > 0.8 here
 * ✅ All strategy logic lives under strategies/ and is invoked through the runner
 */
export async function startTurnFlow(p: StartTurnParams): Promise<void> {
    const { conversationId, model, history, turnId, forceWebSearch, attachments, inputText, mode } = p

    const strategyHost = new StrategyHost(await getDB())
    const trace: StreamTimingTrace = p.trace ?? { t0: Date.now() }
    trace.t_ctx_start = Date.now()
    const built = await strategyHost.runContextBuild({
        conversationId,
        turnId,
        model,
        history,
    })
    trace.t_ctx_done = Date.now()

    // Invoke the model and start the actual streaming reply
    await streamManager.start({
        ...p,
        history: built.prompt.messages as typeof history,
        contextMeta: built.meta,
        forceWebSearch,
        trace,
        attachments,
        inputText,
        mode,
    })
}
