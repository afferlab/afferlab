import { ipcMain, nativeTheme } from 'electron'
import { IPC } from '../../ipc/channels'

export type ThemeSource = 'light' | 'dark' | 'system'

export function isThemeSource(value: unknown): value is ThemeSource {
    return value === 'light' || value === 'dark' || value === 'system'
}

export function applyNativeTheme(theme: ThemeSource): void {
    nativeTheme.themeSource = theme
}

export function registerThemeIPC(): void {
    ipcMain.handle(IPC.SET_THEME_SOURCE, (_event, theme: unknown) => {
        if (!isThemeSource(theme)) {
            throw new Error('invalid theme source')
        }
        applyNativeTheme(theme)
        return { ok: true }
    })
}
