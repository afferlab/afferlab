import type { StreamTask, TurnRunMode } from '../../../../contracts/index'

export class StreamTaskRegistry {
    private readonly tasks = new Map<string, StreamTask>()
    private readonly webContentsByReply = new Map<string, number>()
    private readonly doneSignaled = new Set<string>()

    isConversationBusy(conversationId: string) {
        for (const task of this.tasks.values()) {
            if (!task.cancelled && task.conversationId === conversationId) {
                return { busy: true as const, replyId: task.replyId }
            }
        }
        return { busy: false as const }
    }

    has(replyId: string): boolean {
        return this.tasks.has(replyId)
    }

    create(args: {
        conversationId: string
        replyId: string
        mode?: TurnRunMode
        startedAt?: number
        abortController?: AbortController
        trace?: StreamTask['trace']
        webContentsId?: number
    }): StreamTask {
        const task: StreamTask = {
            conversationId: args.conversationId,
            replyId: args.replyId,
            mode: args.mode,
            cancelled: false,
            buffered: '',
            lastFlushAt: 0,
            startedAt: args.startedAt,
            abortController: args.abortController,
            trace: args.trace,
        }
        this.tasks.set(args.replyId, task)
        if (args.webContentsId !== undefined) {
            this.webContentsByReply.set(args.replyId, args.webContentsId)
        }
        this.doneSignaled.delete(args.replyId)
        return task
    }

    get(replyId: string): StreamTask | undefined {
        return this.tasks.get(replyId)
    }

    delete(replyId: string): void {
        this.tasks.delete(replyId)
    }

    clear(replyId: string): void {
        this.tasks.delete(replyId)
        this.webContentsByReply.delete(replyId)
    }

    consumeWebContentsId(replyId: string): number | undefined {
        const webContentsId = this.webContentsByReply.get(replyId)
        this.webContentsByReply.delete(replyId)
        return webContentsId
    }

    getWebContentsId(replyId: string): number | undefined {
        return this.webContentsByReply.get(replyId)
    }

    hasDoneSignal(replyId: string): boolean {
        return this.doneSignaled.has(replyId)
    }

    markDoneSignal(replyId: string): void {
        this.doneSignaled.add(replyId)
    }

    clearDoneSignal(replyId: string): void {
        this.doneSignaled.delete(replyId)
    }

    status(replyId: string) {
        const task = this.tasks.get(replyId)
        if (!task) return null
        return {
            replyId: task.replyId,
            conversationId: task.conversationId,
            startedAt: task.startedAt,
            lastFlushAt: task.lastFlushAt,
            bufferedLen: task.buffered.length,
            cancelled: task.cancelled,
        }
    }
}
