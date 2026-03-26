import { app, ipcMain, session, shell } from 'electron'
import path from 'node:path'
import fs from 'node:fs/promises'

import { IPC } from '../channels'
import { getDB } from '../../db'
import { listStrategies, setStrategyPrefs } from '../../engine/settings/services/settingsStore'

async function ensureDir(targetPath: string) {
    await fs.mkdir(targetPath, { recursive: true })
}

function assertExternalUrl(url: string): string {
    const parsed = new URL(url)
    if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
        throw new Error(`Unsupported external URL protocol: ${parsed.protocol}`)
    }
    return parsed.toString()
}

export function registerPrivacyIPC() {
    ipcMain.handle(IPC.GET_USER_DATA_PATH, () => {
        return app.getPath('userData')
    })

    ipcMain.handle(IPC.OPEN_USER_DATA_PATH, async () => {
        const userDataPath = app.getPath('userData')
        await ensureDir(userDataPath)
        await shell.openPath(userDataPath)
        return { ok: true, path: userDataPath }
    })

    ipcMain.handle(IPC.OPEN_STRATEGIES_PATH, async () => {
        const strategiesPath = path.join(app.getPath('userData'), 'strategies')
        await ensureDir(strategiesPath)
        await shell.openPath(strategiesPath)
        return { ok: true, path: strategiesPath }
    })

    ipcMain.handle(IPC.OPEN_EXTERNAL_URL, async (_event, url: string) => {
        const target = assertExternalUrl(url)
        await shell.openExternal(target)
        return { ok: true }
    })

    ipcMain.handle(IPC.RESET_STRATEGIES, async () => {
        const db = await getDB()
        db.prepare(`DELETE FROM strategies WHERE source != 'builtin'`).run()
        db.prepare(`DELETE FROM strategy_overrides WHERE strategy_id NOT IN (SELECT id FROM strategies)`).run()
        const remaining = listStrategies(db)
        const enabledIds = remaining.filter((strategy) => strategy.enabled !== false).map((strategy) => strategy.id)
        setStrategyPrefs(db, { enabledIds })

        const strategiesPath = path.join(app.getPath('userData'), 'strategies')
        await fs.rm(strategiesPath, { recursive: true, force: true })
        return { ok: true }
    })

    ipcMain.handle(IPC.CLEAR_CACHE, async () => {
        await session.defaultSession.clearCache()
        return { ok: true }
    })
}
