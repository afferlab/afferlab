// electron/core/context/ContextStore.ts
import type { ContextStats } from '../operations/context/measureContext'

/** In-memory only: stores the latest measurement result for each conversation (used by strategies/debugging). */
class ContextStore {
    private byConv = new Map<string, ContextStats>()

    set(conversationId: string, stats: ContextStats): void {
        this.byConv.set(conversationId, stats)
    }

    get(conversationId: string): ContextStats | undefined {
        return this.byConv.get(conversationId)
    }

    has(conversationId: string): boolean {
        return this.byConv.has(conversationId)
    }

    delete(conversationId: string): void {
        this.byConv.delete(conversationId)
    }

    clear(): void {
        this.byConv.clear()
    }
}

export const contextStore = new ContextStore()
export type { ContextStats }
