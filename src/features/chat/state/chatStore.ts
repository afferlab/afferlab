// src/stores/chatStore.ts
import { createStore } from 'zustand'
import { useStoreWithEqualityFn } from 'zustand/traditional'
import type { StoreApi } from 'zustand'
import type { Conversation, UITurn, UIMessage, StreamingSegment, TurnAttachment } from '@contracts'

export type ComposerDraft = {
    turnId?: string
    text: string
    attachments?: TurnAttachment[]
}

export interface ChatState {
    // conversations
    conversations: Conversation[]
    draftConversation: Conversation | null
    selectedConversationId: string | null
    setSelectedConversationId: (id: string | null) => void
    setConversations: (convs: Conversation[]) => void
    updateConversation: (id: string, patch: Partial<Conversation>) => void
    createDraftConversation: (seed?: Partial<Conversation>) => Conversation
    updateDraftConversation: (patch: Partial<Conversation>) => void
    clearDraftConversation: () => void

    // busy state (single lane per conversation)
    busyByConversation: Record<string, { replyId: string } | undefined>
    setBusy: (convId: string, replyId: string) => void
    clearBusy: (convId: string) => void
    isBusy: (convId: string) => boolean

    // composer state (edit and rerun)
    composerDraft: ComposerDraft
    setComposerDraft: (d: ComposerDraft) => void
    clearComposerDraft: () => void

    // memory cloud ui ordering (conversation scoped)
    memoryCloudOrderByConversation: Record<string, string[]>
    setMemoryCloudOrder: (conversationId: string, order: string[]) => void

    // === turn-driven rendering ===
    turns: UITurn[]

    /** Replace everything with the latest backend data (with internal dedupe + stable sorting). */
    replaceTurns: (turns: UITurn[]) => void

    /** Insert a placeholder locally only (no dedupe). */
    addTurn: (turn: UITurn) => void

    /** Rename a placeholder turn id to the real turn_id; if toId already exists, delete fromId to avoid duplicates. */
    renameTurnId: (fromId: string, toId: string) => void

    /** Switch the currently displayed assistant version index (used for < 2/3 > pagination). */
    setCurrentAssistantIndex: (turnId: string, index: number) => void

    /** Update the currently displayed assistant version (object patch or functional patch). */
    updateTurnAssistant: (
        turnId: string,
        patchOrUpdater: Partial<UIMessage> | ((prev: UIMessage) => Partial<UIMessage> | UIMessage)
    ) => void

    /** Append streamed delta to the currently displayed assistant version. */
    appendTurnAssistant: (turnId: string, delta: string) => void

    /** Turn status. */
    updateTurnStatus: (turnId: string, status: UITurn['status']) => void

    /** Update the user bubble. */
    updateTurnUser: (
        turnId: string,
        patchOrUpdater: Partial<UIMessage> | ((prev: UIMessage) => Partial<UIMessage> | UIMessage)
    ) => void

    /** Set all assistant versions for the turn at once and focus activeId (or the last one if missing). */
    setTurnAssistants: (turnId: string, answers: UIMessage[], activeId?: string) => void

    /** Append a new assistant version (usually a loading placeholder for regenerate) and switch to it. */
    pushAssistantVersion: (turnId: string, placeholder: UIMessage) => void

    /** Patch a specific version by asstId (used to write final state after streaming ends). */
    patchAssistantById: (
        turnId: string,
        asstId: string,
        updater: (prev: UIMessage) => Partial<UIMessage> | UIMessage
    ) => void

    /** Append delta to a specific version by asstId (finer-grained streaming updates). */
    appendAssistantDeltaById: (turnId: string, asstId: string, delta: string) => void

    // streaming segments (for fade-in)
    streamingSegmentsById: Record<string, StreamingSegment[]>
    addStreamingSegment: (messageId: string, text: string, ts?: number) => void
    clearStreamingSegments: (messageId: string) => void
    clearAllStreamingSegments: () => void
}

// DEV-only logging
const SLOG = (...args: unknown[]) => {
    if (import.meta.env.DEV) console.log('[STORE]', ...args)
}

const MAX_STREAM_SEGMENTS = 50
let streamSegmentCounter = 0

/** Stable sort + dedupe (keep the last occurrence). */
function normalizeTurns(list: UITurn[]): UITurn[] {
    const map = new Map<string, UITurn>()
    for (const t of list) map.set(t.id, t) // last occurrence wins
    return [...map.values()].sort((a, b) => {
        const ax = a.tseq ?? Number.MAX_SAFE_INTEGER
        const bx = b.tseq ?? Number.MAX_SAFE_INTEGER
        if (ax !== bx) return ax - bx
        return a.id.localeCompare(b.id)
    })
}

function isDevConversation(conv: Conversation): boolean {
    return typeof conv.strategy_id === 'string' && conv.strategy_id.startsWith('dev:')
}

function orderConversationList(convs: Conversation[]): Conversation[] {
    const dev: Array<{ conv: Conversation; idx: number }> = []
    const normal: Array<{ conv: Conversation; idx: number }> = []
    convs.forEach((conv, idx) => {
        if (isDevConversation(conv)) {
            dev.push({ conv, idx })
        } else {
            normal.push({ conv, idx })
        }
    })

    const sortSection = (entries: Array<{ conv: Conversation; idx: number }>) => entries.sort((a, b) => {
        const at = a.conv.updated_at ?? 0
        const bt = b.conv.updated_at ?? 0
        if (at !== bt) return bt - at
        return a.idx - b.idx
    })

    sortSection(dev)
    sortSection(normal)

    return [
        ...dev.map((entry) => entry.conv),
        ...normal.map((entry) => entry.conv),
    ]
}

/** Safe merge that prevents UIMessage['type'] from widening to string. */
function mergeMsg(prev: UIMessage, patch: Partial<UIMessage>): UIMessage {
    return { ...prev, ...patch } as UIMessage
}

function logStreamMutation(
    action: 'push' | 'append' | 'patch',
    turnId: string,
    asstId: string,
    exists: boolean,
    selectedConversationId: string | null,
) {
    SLOG('stream', { action, turnId, asstId, exists, selectedConversationId })
}

export const chatStore: StoreApi<ChatState> = createStore<ChatState>()((set, get) => ({
    conversations: [],
    draftConversation: null,
    selectedConversationId: null,

    setSelectedConversationId: (id) => {
        SLOG('setSelectedConversationId', id)
        set((state) => {
            const draftId = state.draftConversation?.id
            const isDraft = Boolean(draftId && id === draftId)
            if (state.draftConversation && !isDraft) {
                return { selectedConversationId: id, draftConversation: null }
            }
            return { selectedConversationId: id }
        })
    },
    setConversations: (convs) => {
        SLOG('setConversations', { count: convs.length })
        set({ conversations: orderConversationList(convs) })
    },
    updateConversation: (id, patch) =>
        set((state) => {
            const idx = state.conversations.findIndex((c) => c.id === id)
            if (idx === -1) {
                const now = Date.now()
                const base: Conversation = {
                    id,
                    title: '',
                    created_at: now,
                    updated_at: now,
                    model: '',
                    archived: false,
                    strategy_id: null,
                    strategy_key: null,
                    strategy_version: null,
                }
                const next = { ...base, ...patch, id }
                return { conversations: orderConversationList([next, ...state.conversations]) }
            }
            const next = state.conversations.slice()
            next[idx] = { ...next[idx], ...patch }
            return { conversations: orderConversationList(next) }
        }),
    createDraftConversation: (seed) => {
        const now = Date.now()
        const draft: Conversation = {
            id: `draft_${crypto.randomUUID()}`,
            title: seed?.title ?? 'New chat',
            title_source: seed?.title_source ?? 'default',
            created_at: seed?.created_at ?? now,
            updated_at: seed?.updated_at ?? now,
            model: seed?.model ?? '',
            archived: seed?.archived ?? false,
            strategy_id: seed?.strategy_id ?? null,
            strategy_key: seed?.strategy_key ?? null,
            strategy_version: seed?.strategy_version ?? null,
        }
        set({ draftConversation: draft, selectedConversationId: draft.id })
        return draft
    },
    updateDraftConversation: (patch) =>
        set((state) => {
            if (!state.draftConversation) return {}
            return { draftConversation: { ...state.draftConversation, ...patch } }
        }),
    clearDraftConversation: () =>
        set((state) => ({
            draftConversation: null,
            selectedConversationId:
                state.selectedConversationId === state.draftConversation?.id
                    ? null
                    : state.selectedConversationId,
        })),

    // busy
    busyByConversation: {},
    setBusy: (convId, replyId) =>
        set((state) => ({
            busyByConversation: { ...state.busyByConversation, [convId]: { replyId } },
        })),
    clearBusy: (convId) =>
        set((state) => {
            const next = { ...state.busyByConversation }
            delete next[convId]
            return { busyByConversation: next }
        }),
    isBusy: (convId) => !!get().busyByConversation[convId],

    // composer
    composerDraft: { text: '' },
    setComposerDraft: (d) => set({ composerDraft: d }),
    clearComposerDraft: () => set({ composerDraft: { text: '' } }),

    memoryCloudOrderByConversation: {},
    setMemoryCloudOrder: (conversationId, order) =>
        set((state) => {
            if (!conversationId) return {}
            return {
                memoryCloudOrderByConversation: {
                    ...state.memoryCloudOrderByConversation,
                    [conversationId]: Array.from(new Set(order.filter((id) => typeof id === 'string' && id.length > 0))),
                },
            }
        }),

    // turns
    turns: [],

    replaceTurns: (turns) =>
        set(() => {
            const normalized = normalizeTurns(turns)
            SLOG('replaceTurns', { in: turns.length, out: normalized.length })
            return { turns: normalized }
        }),

    addTurn: (turn) =>
        set((state) => {
            SLOG('addTurn', { id: turn.id })
            return { turns: [...state.turns, turn] }
        }),

    renameTurnId: (fromId, toId) =>
        set((state) => {
            if (fromId === toId) return {}
            const hasFrom = state.turns.some((t) => t.id === fromId)
            if (!hasFrom) return {}
            const hasTo = state.turns.some((t) => t.id === toId)

            if (hasTo) {
                // A real turn already exists, so remove the placeholder turn
                SLOG('renameTurnId::dedupe', { fromId, toId })
                return { turns: state.turns.filter((t) => t.id !== fromId) }
            }

            const next = state.turns.map((t) => (t.id === fromId ? { ...t, id: toId } : t))
            SLOG('renameTurnId', { fromId, toId })
            return { turns: next }
        }),

    setCurrentAssistantIndex: (turnId, index) =>
        set((state) => ({
            turns: state.turns.map((t) => {
                if (t.id !== turnId) return t
                const len = t.assistants?.length ?? 0
                if (len === 0) return t
                const clamped = Math.max(0, Math.min(index, len - 1))
                return { ...t, currentAssistantIndex: clamped }
            }),
        })),

    updateTurnAssistant: (turnId, patchOrUpdater) =>
        set((state) => ({
            turns: state.turns.map((t) => {
                if (t.id !== turnId) return t
                const i = t.currentAssistantIndex ?? 0
                const prevArr = t.assistants ?? []
                const prev = prevArr[i]
                if (!prev) return t

                const patch: Partial<UIMessage> =
                    typeof patchOrUpdater === 'function'
                        ? (patchOrUpdater(prev) as Partial<UIMessage>)
                        : patchOrUpdater

                const nextVal = mergeMsg(prev, patch)
                const nextArr = prevArr.slice()
                nextArr[i] = nextVal
                return { ...t, assistants: nextArr }
            }),
        })),

    appendTurnAssistant: (turnId, delta) =>
        set((state) => ({
            turns: state.turns.map((t) => {
                if (t.id !== turnId) return t
                const i = t.currentAssistantIndex ?? 0
                const prevArr = t.assistants ?? []
                const prev = prevArr[i]
                if (!prev) return t

                const nextVal = mergeMsg(prev, {
                    type: 'text' as const, // keep the literal type so it does not widen to string
                    content: (prev.content || '') + (delta || ''),
                })
                const nextArr = prevArr.slice()
                nextArr[i] = nextVal
                return { ...t, assistants: nextArr }
            }),
        })),

    updateTurnStatus: (turnId, status) =>
        set((state) => ({
            turns: state.turns.map((t) => (t.id === turnId ? { ...t, status } : t)),
        })),

    updateTurnUser: (turnId, patchOrUpdater) =>
        set((state) => ({
            turns: state.turns.map((t) => {
                if (t.id !== turnId) return t
                const prev = t.user
                const patch: Partial<UIMessage> =
                    typeof patchOrUpdater === 'function'
                        ? (patchOrUpdater(prev) as Partial<UIMessage>)
                        : patchOrUpdater
                const next = mergeMsg(prev, patch)
                return { ...t, user: next }
            }),
        })),

    setTurnAssistants: (turnId, answers, activeId) =>
        set((state) => ({
            turns: state.turns.map((t) => {
                if (t.id !== turnId) return t
                let idx = answers.length ? answers.length - 1 : 0
                if (activeId) {
                    const hit = answers.findIndex((a) => a.id === activeId)
                    if (hit >= 0) idx = hit
                }
                const clamped = Math.max(0, Math.min(idx, Math.max(0, answers.length - 1)))
                return { ...t, assistants: answers, currentAssistantIndex: clamped }
            }),
        })),

    pushAssistantVersion: (turnId, placeholder) =>
        set((state) => ({
            turns: state.turns.map((t) => {
                if (t.id !== turnId) return t
                const exists = t.assistants?.some((a) => a.id === placeholder.id) ?? false
                logStreamMutation('push', turnId, placeholder.id, exists, state.selectedConversationId)
                const nextArr = [...(t.assistants ?? []), placeholder]
                return { ...t, assistants: nextArr, currentAssistantIndex: nextArr.length - 1 }
            }),
        })),

    patchAssistantById: (turnId, asstId, updater) =>
        set((state) => ({
            turns: state.turns.map((t) => {
                if (t.id !== turnId || !Array.isArray(t.assistants)) return t
                const exists = t.assistants.some((a) => a.id === asstId)
                logStreamMutation('patch', turnId, asstId, exists, state.selectedConversationId)
                const list = t.assistants.map((a) =>
                    a.id === asstId ? mergeMsg(a, (updater(a) as Partial<UIMessage>)) : a
                )
                const curIdx = Math.min(
                    Math.max(0, t.currentAssistantIndex ?? list.length - 1),
                    Math.max(0, list.length - 1)
                )
                return { ...t, assistants: list, currentAssistantIndex: curIdx }
            }),
        })),

    appendAssistantDeltaById: (turnId, asstId, delta) =>
        set((state) => ({
            turns: state.turns.map((t) => {
                if (t.id !== turnId || !Array.isArray(t.assistants)) return t
                const exists = t.assistants.some((a) => a.id === asstId)
                logStreamMutation('append', turnId, asstId, exists, state.selectedConversationId)
                const list = t.assistants.map((a) =>
                    a.id === asstId
                        ? mergeMsg(a, { type: 'text' as const, content: (a.content || '') + (delta || '') })
                        : a
                )
                const curIdx = Math.min(
                    Math.max(0, t.currentAssistantIndex ?? list.length - 1),
                    Math.max(0, list.length - 1)
                )
                return { ...t, assistants: list, currentAssistantIndex: curIdx }
            }),
        })),

    streamingSegmentsById: {},
    addStreamingSegment: (messageId, text, ts = Date.now()) =>
        set((state) => {
            if (!text) return {}
            const existing = state.streamingSegmentsById[messageId] ?? []
            let next = existing.slice()
            if (next.length >= MAX_STREAM_SEGMENTS && next.length >= 2) {
                const merged = { ...next[0], text: `${next[0].text}${next[1].text}` }
                next = [merged, ...next.slice(2)]
            }
            const segment: StreamingSegment = {
                id: `seg_${ts}_${streamSegmentCounter++}`,
                text,
                ts,
            }
            return {
                streamingSegmentsById: {
                    ...state.streamingSegmentsById,
                    [messageId]: [...next, segment],
                },
            }
        }),
    clearStreamingSegments: (messageId) =>
        set((state) => {
            if (!state.streamingSegmentsById[messageId]) return {}
            const next = { ...state.streamingSegmentsById }
            delete next[messageId]
            return { streamingSegmentsById: next }
        }),
    clearAllStreamingSegments: () => set({ streamingSegmentsById: {} }),
}))

export const useChatStore = <T,>(
    selector: (state: ChatState) => T,
    equalityFn?: (a: T, b: T) => boolean
): T => useStoreWithEqualityFn(chatStore, selector, equalityFn)
