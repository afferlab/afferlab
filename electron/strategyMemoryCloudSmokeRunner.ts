import { app, BrowserWindow } from 'electron'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { initDB, closeDB } from './db'
import { registerAllIPC } from './ipc'
import { registerStrategies } from './strategies'
import { registerDefaultEmbeddingsProviders } from './core/embeddings/registerDefaultProviders'
import { runStrategyMemoryCloudSmoke } from './core/strategy/__dev__/strategyMemoryCloudSmoke'

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)

async function createHiddenWindow(): Promise<BrowserWindow> {
    const win = new BrowserWindow({
        show: false,
        webPreferences: {
            preload: path.join(__dirname, 'preload.mjs'),
        },
    })
    await win.loadURL('data:text/html,<html><body>smoke</body></html>')
    return win
}

async function main(): Promise<void> {
    process.env.SKIP_VECTOR_SELF_TEST = '1'
    await app.whenReady()
    registerDefaultEmbeddingsProviders()
    initDB()
    registerStrategies()
    registerAllIPC()

    const win = await createHiddenWindow()
    try {
        await runStrategyMemoryCloudSmoke(win)
        console.log('PASS')
        win.destroy()
        closeDB()
        app.quit()
        process.exit(0)
    } catch (err) {
        const msg = err instanceof Error ? err.message : String(err)
        console.error('FAIL', msg)
        win.destroy()
        closeDB()
        app.quit()
        process.exit(1)
    }
}

void main()
