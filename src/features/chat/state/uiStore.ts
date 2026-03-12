import { create } from 'zustand'
import { persist, createJSONStorage } from 'zustand/middleware'

type UIState = {
    sidebarCollapsed: boolean
    enableStreamReveal: boolean
    toggleSidebar: () => void
    setSidebarCollapsed: (value: boolean) => void
    setEnableStreamReveal: (value: boolean) => void
}

export const useUIStore = create<UIState>()(
    persist(
        (set) => ({
            sidebarCollapsed: false,
            enableStreamReveal: true,
            toggleSidebar: () => set((state) => ({ sidebarCollapsed: !state.sidebarCollapsed })),
            setSidebarCollapsed: (value) => set({ sidebarCollapsed: value }),
            setEnableStreamReveal: (value) => set({ enableStreamReveal: value }),
        }),
        {
            name: 'ui-settings',
            storage: createJSONStorage(() => localStorage),
            partialize: (state) => ({
                sidebarCollapsed: state.sidebarCollapsed,
                enableStreamReveal: state.enableStreamReveal,
            }),
        }
    )
)
