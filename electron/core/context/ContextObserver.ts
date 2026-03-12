// electron/core/context/ContextObserver.ts
import type { ContextStats } from './ContextStore'

export type ContextUpdateSource = 'measure' | 'finalize' | 'manual'

export interface ContextUpdate {
    conversationId: string
    modelId?: string
    stats: ContextStats
    source: ContextUpdateSource
}

type Listener = (update: ContextUpdate) => void | Promise<void>

/**
 * Observer for subscribing to and broadcasting context changes.
 * - Stateless by design; callers invoke notify() explicitly
 * - Decoupled from ContextStore
 */
class ContextObserver {
    private globalListeners = new Set<Listener>()
    private perConv = new Map<string, Set<Listener>>()

    /** Subscribe to context updates from all conversations. */
    on(fn: Listener): () => void {
        this.globalListeners.add(fn)
        return () => this.globalListeners.delete(fn)
    }

    /** Subscribe to context updates for a specific conversation. */
    onConversation(conversationId: string, fn: Listener): () => void {
        const set = this.perConv.get(conversationId) ?? new Set<Listener>()
        set.add(fn)
        this.perConv.set(conversationId, set)
        return () => {
            const s = this.perConv.get(conversationId)
            if (!s) return
            s.delete(fn)
            if (s.size === 0) this.perConv.delete(conversationId)
        }
    }

    /** Broadcast proactively (called by ChatFlow or measurement logic). */
    async notify(update: ContextUpdate): Promise<void> {
        const tasks: Array<void | Promise<void>> = []
        for (const fn of this.globalListeners) tasks.push(fn(update))
        const scoped = this.perConv.get(update.conversationId)
        if (scoped) for (const fn of scoped) tasks.push(fn(update))
        // Run all listeners concurrently
        await Promise.all(tasks)
    }

    /** Clear all listeners (usually unnecessary unless strategies are unloaded dynamically). */
    clear(): void {
        this.globalListeners.clear()
        this.perConv.clear()
    }
}

export const contextObserver = new ContextObserver()
