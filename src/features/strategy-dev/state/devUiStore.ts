import { create } from "zustand"

type DevUiState = {
    devPanelOpen: boolean
    devFilters: DevFilters
    devTurnScope: DevTurnScope
    setDevPanelOpen: (open: boolean) => void
    toggleDevPanel: () => void
    toggleDevFilter: (key: DevFilterKey) => void
    setDevFilter: (key: DevFilterKey, value: boolean) => void
    setDevTurnScope: (scope: DevTurnScope) => void
}

export type DevFilterKey = "input" | "strategy" | "prompt" | "result" | "logs"
export type DevFilters = Record<DevFilterKey, boolean>
export type DevTurnScope = "latest" | "last3" | "last5" | "all"

const DEFAULT_DEV_FILTERS: DevFilters = {
    input: true,
    strategy: true,
    prompt: true,
    result: true,
    logs: true,
}

export const useDevUiStore = create<DevUiState>((set) => ({
    devPanelOpen: true,
    devFilters: DEFAULT_DEV_FILTERS,
    devTurnScope: "latest",
    setDevPanelOpen: (open) => set({ devPanelOpen: open }),
    toggleDevPanel: () => set((state) => ({ devPanelOpen: !state.devPanelOpen })),
    toggleDevFilter: (key) =>
        set((state) => ({
            devFilters: { ...state.devFilters, [key]: !state.devFilters[key] },
        })),
    setDevFilter: (key, value) =>
        set((state) => ({
            devFilters: { ...state.devFilters, [key]: value },
        })),
    setDevTurnScope: (scope) => set({ devTurnScope: scope }),
}))
