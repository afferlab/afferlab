import { webContents, type WebContents } from 'electron'
import { log } from '../../../core/logging/runtimeLogger'

import type {
    DoneReason,
    LlmStreamChunkEventData,
    LlmStreamDoneEventData,
    LlmStreamStartedEventData,
} from '../../../../contracts/index'

type StreamEmitter = {
    emit: (eventName: string, payload: unknown) => boolean
}

export class StreamEventPublisher {
    private readonly emitter: StreamEmitter

    constructor(emitter: StreamEmitter) {
        this.emitter = emitter
    }

    emitStarted(args: {
        webContentsId?: number
        payload: LlmStreamStartedEventData
    }): WebContents | undefined {
        const target = args.webContentsId !== undefined ? webContents.fromId(args.webContentsId) : undefined
        if (target && !target.isDestroyed?.()) {
            target.send('llm-stream-started', args.payload)
        }
        this.emitter.emit('started', args.payload)
        return target
    }

    emitChunk(args: {
        target?: WebContents
        payload: LlmStreamChunkEventData
    }): void {
        if (args.target && !args.target.isDestroyed?.()) {
            args.target.send('llm-stream-chunk', args.payload)
        }
        this.emitter.emit('chunk', args.payload)
    }

    emitDone(args: {
        wcId?: number
        conversationId: string
        turnId: string
        replyId: string
        reason: DoneReason | 'already_finalized'
        elapsedMs?: number
        finalContent?: string
        modelId?: string
        providerId?: string
        traceId?: string
        error?: { code?: string; message?: string; raw?: unknown }
    }): void {
        if (args.wcId === undefined) return
        const target = webContents.fromId(args.wcId)
        if (!target || target.isDestroyed?.()) return

        log('info', '[STREAM]', {
            traceId: args.traceId ?? null,
            phase: 'DONE',
            conversationId: args.conversationId,
            turnId: args.turnId,
            replyId: args.replyId,
            reason: args.reason,
            elapsedMs: args.elapsedMs ?? null,
        })

        const payload: LlmStreamDoneEventData = {
            conversation_id: args.conversationId,
            reply_id: args.replyId,
            turn_id: args.turnId,
            ...(args.finalContent !== undefined ? { final_content: args.finalContent } : {}),
            ...(args.modelId ? { model_id: args.modelId } : {}),
            ...(args.providerId ? { provider_id: args.providerId } : {}),
            meta: {
                reason: args.reason,
                ...(args.elapsedMs !== undefined ? { elapsedMs: args.elapsedMs } : {}),
                ...(args.error ? { error: args.error } : {}),
            },
        }
        target.send('llm-stream-done', payload)
        this.emitter.emit('done', payload)
    }
}
