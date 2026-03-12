import { IPC } from '../ipc/channels'
import { safeInvoke } from './ipcHelpers'

export type ElectronThemeSource = 'light' | 'dark' | 'system'

export function createElectronAPI() {
    return {
        setTheme: (theme: ElectronThemeSource) =>
            safeInvoke<{ ok: true }>(IPC.SET_THEME_SOURCE, theme),
    }
}
