export type ElectronThemeSource = 'light' | 'dark' | 'system'

export interface ElectronAPI {
    setTheme(theme: ElectronThemeSource): Promise<{ ok: true }>
}

declare global {
    interface Window {
        electronAPI?: ElectronAPI
    }
}

export {}
