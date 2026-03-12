// electron/core/events.ts
export type ScopeType = 'global' | 'project' | 'conversation'
import type { ContextStats } from './operations/context/measureContext'

// ==== Event definitions ====
export type MessageEvent =
    | { type: 'message:userSaved'; conversationId: string; projectId?: string | null; messageId: string; text?: string; createdAt: number }
    | { type: 'message:assistantSaved'; conversationId: string; projectId?: string | null; messageId: string; text?: string; createdAt: number }
    | { type: 'message:updated'; conversationId: string; projectId?: string | null; messageId: string; updatedAt: number }

export type TurnEvent =
    | { type: 'turn:finished'; conversationId: string; projectId?: string | null; turnId: string; tseq?: number; reason?: 'stop'|'length'|'error'|'aborted'; at: number }

export type MemoryEvent =
    | { type: 'memory:created'; memoryId: string; scope: { type: ScopeType; id: string }; strategyId: string; memType: string; at: number }
    | { type: 'memory:updated'; memoryId: string; scope: { type: ScopeType; id: string }; strategyId: string; memType: string; at: number }

export type RetrievalEvent =
    | { type: 'retrieval:before'; conversationId: string; projectId?: string | null; k: number; model: string; dim: number; metric: 'cosine'|'l2'|'dot'; queryText?: string }
    | { type: 'retrieval:after';  hits: Array<{ id: string; memory_id?: string; asset_id?: string; distance: number }>; contextDraft?: string }

export type ContextEvent =
    | { type: 'context:budget';    conversationId: string; modelId: string; stats: ContextStats }
    | { type: 'context:finalized'; conversationId: string; modelId: string; stats: ContextStats }

export type CoreEvent = MessageEvent | TurnEvent | MemoryEvent | RetrievalEvent | ContextEvent

// ==== Mapping table: type -> payload ====
export interface EventMap {
    'message:userSaved': Extract<MessageEvent, { type: 'message:userSaved' }>
    'message:assistantSaved': Extract<MessageEvent, { type: 'message:assistantSaved' }>
    'message:updated': Extract<MessageEvent, { type: 'message:updated' }>

    'turn:finished': Extract<TurnEvent, { type: 'turn:finished' }>

    'memory:created': Extract<MemoryEvent, { type: 'memory:created' }>
    'memory:updated': Extract<MemoryEvent, { type: 'memory:updated' }>

    'retrieval:before': Extract<RetrievalEvent, { type: 'retrieval:before' }>
    'retrieval:after': Extract<RetrievalEvent, { type: 'retrieval:after' }>

    'context:budget':    Extract<ContextEvent, { type: 'context:budget' }>
    'context:finalized': Extract<ContextEvent, { type: 'context:finalized' }>
}

// === Strongly typed EventBus to avoid any/never intersections ===
export type Listener<T> = (evt: T) => void | Promise<void>

// ==== Strongly typed EventBus ====
class EventBus {
    // Use unknown in storage to avoid union-key intersections collapsing to never
    private listeners: Partial<Record<keyof EventMap, Set<Listener<unknown>>>> = {}

    on<K extends keyof EventMap>(type: K, fn: Listener<EventMap[K]>): () => void {
        // Read the existing set or create a new one
        const set = (this.listeners[type] ??
            new Set<Listener<unknown>>()) as Set<Listener<EventMap[K]>>

        set.add(fn)
        // Widen back to unknown on write so storage stays unified
        this.listeners[type] = set as Set<Listener<unknown>>

        return () => {
            set.delete(fn)
            // Optional cleanup when empty
            if (set.size === 0) delete this.listeners[type]
        }
    }

    off<K extends keyof EventMap>(type: K, fn: Listener<EventMap[K]>): void {
        const set = this.listeners[type] as Set<Listener<EventMap[K]>> | undefined
        set?.delete(fn)
        if (set && set.size === 0) delete this.listeners[type]
    }

    async emit<K extends keyof EventMap>(evt: EventMap[K]): Promise<void> {
        // Narrow to the concrete event type on read
        const set = this.listeners[evt.type] as Set<Listener<EventMap[K]>> | undefined
        if (!set || set.size === 0) return

        for (const fn of set) {
            await fn(evt) // evt is strongly typed here
        }
    }

    clear(): void {
        this.listeners = {}
    }
}

export const bus = new EventBus()

// ==== Convenience emitters ====
export const emitters = {
    messageUserSaved: (p: Omit<EventMap['message:userSaved'], 'type'>) =>
        bus.emit({ type: 'message:userSaved', ...p }),
    messageAssistantSaved: (p: Omit<EventMap['message:assistantSaved'], 'type'>) =>
        bus.emit({ type: 'message:assistantSaved', ...p }),
    messageUpdated: (p: Omit<EventMap['message:updated'], 'type'>) =>
        bus.emit({ type: 'message:updated', ...p }),

    turnFinished: (p: Omit<EventMap['turn:finished'], 'type'>) =>
        bus.emit({ type: 'turn:finished', ...p }),

    memoryCreated: (p: Omit<EventMap['memory:created'], 'type'>) =>
        bus.emit({ type: 'memory:created', ...p }),
    memoryUpdated: (p: Omit<EventMap['memory:updated'], 'type'>) =>
        bus.emit({ type: 'memory:updated', ...p }),

    retrievalBefore: (p: Omit<EventMap['retrieval:before'], 'type'>) =>
        bus.emit({ type: 'retrieval:before', ...p }),
    retrievalAfter: (p: Omit<EventMap['retrieval:after'], 'type'>) =>
        bus.emit({ type: 'retrieval:after', ...p }),

    contextBudget: (p: Omit<EventMap['context:budget'], 'type'>) =>
        bus.emit({ type: 'context:budget', ...p }),
    contextFinalized: (p: Omit<EventMap['context:finalized'], 'type'>) =>
        bus.emit({ type: 'context:finalized', ...p }),
}
