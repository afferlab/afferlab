import { create } from "zustand"

type SourceEntry = {
    text?: string
    error?: string
    updatedAt?: number
}

type DevStrategySourceState = {
    sources: Record<string, SourceEntry>
    setSnapshot: (strategyId: string, text: string) => void
    setError: (strategyId: string, error: string) => void
    clear: (strategyId: string) => void
}

export const useDevStrategySourceStore = create<DevStrategySourceState>((set) => ({
    sources: {},
    setSnapshot: (strategyId, text) =>
        set((state) => ({
            sources: {
                ...state.sources,
                [strategyId]: { text, error: undefined, updatedAt: Date.now() },
            },
        })),
    setError: (strategyId, error) =>
        set((state) => ({
            sources: {
                ...state.sources,
                [strategyId]: { text: undefined, error, updatedAt: Date.now() },
            },
        })),
    clear: (strategyId) =>
        set((state) => {
            const next = { ...state.sources }
            delete next[strategyId]
            return { sources: next }
        }),
}))
