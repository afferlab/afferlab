export const SMOOTH_TICK_MS = 24
export const MIN_CHARS_PER_TICK = 6
export const MAX_CHARS_PER_TICK = 48
export const BACKLOG_ACCEL_THRESHOLD = 400

type StreamQueue = {
    messageId: string
    turnId: string
    buffer: string
}

type StreamSmootherOptions = {
    appendDelta: (turnId: string, messageId: string, delta: string) => void
    addSegment: (messageId: string, text: string, ts: number) => void
}

function computeChunkSize(backlog: number): number {
    if (backlog <= 0) return 0
    if (backlog >= BACKLOG_ACCEL_THRESHOLD) return MAX_CHARS_PER_TICK
    const scaled =
        MIN_CHARS_PER_TICK +
        Math.floor((backlog / BACKLOG_ACCEL_THRESHOLD) * (MAX_CHARS_PER_TICK - MIN_CHARS_PER_TICK))
    return Math.max(1, Math.min(MAX_CHARS_PER_TICK, scaled))
}

export class StreamSmoother {
    private queues = new Map<string, StreamQueue>()
    private timerId: number | null = null
    private readonly appendDelta: StreamSmootherOptions["appendDelta"]
    private readonly addSegment: StreamSmootherOptions["addSegment"]

    constructor(options: StreamSmootherOptions) {
        this.appendDelta = options.appendDelta
        this.addSegment = options.addSegment
    }

    enqueue(turnId: string, messageId: string, delta: string) {
        if (!delta) return
        const existing = this.queues.get(messageId)
        if (existing) {
            existing.buffer += delta
            existing.turnId = turnId
        } else {
            this.queues.set(messageId, { messageId, turnId, buffer: delta })
        }
        this.startTimer()
    }

    flushMessage(messageId: string) {
        const queue = this.queues.get(messageId)
        if (!queue) return
        this.flushQueue(queue, true)
        this.queues.delete(messageId)
        this.stopTimerIfIdle()
    }

    flushAll() {
        for (const queue of this.queues.values()) {
            this.flushQueue(queue, true)
        }
        this.queues.clear()
        this.stopTimer()
    }

    private startTimer() {
        if (this.timerId !== null) return
        this.timerId = window.setInterval(() => this.tick(), SMOOTH_TICK_MS)
    }

    private stopTimer() {
        if (this.timerId === null) return
        window.clearInterval(this.timerId)
        this.timerId = null
    }

    private stopTimerIfIdle() {
        if (this.queues.size === 0) this.stopTimer()
    }

    private tick() {
        if (this.queues.size === 0) {
            this.stopTimer()
            return
        }
        for (const queue of this.queues.values()) {
            this.flushQueue(queue, false)
        }
    }

    private flushQueue(queue: StreamQueue, force: boolean) {
        if (!queue.buffer) return
        const backlog = queue.buffer.length
        const take = force ? backlog : Math.min(backlog, computeChunkSize(backlog))
        if (take <= 0) return
        const part = queue.buffer.slice(0, take)
        queue.buffer = queue.buffer.slice(take)
        this.appendDelta(queue.turnId, queue.messageId, part)
        this.addSegment(queue.messageId, part, Date.now())
    }
}
