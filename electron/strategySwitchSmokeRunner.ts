import { app } from 'electron'
import { initDB, getDB, closeDB } from './db'
import { runStrategySwitchSmoke } from './core/strategy/__dev__/strategySwitchSmoke'

async function main(): Promise<void> {
    await app.whenReady()
    initDB()

    try {
        await runStrategySwitchSmoke(getDB())
        console.log('PASS')
        closeDB()
        app.quit()
        process.exit(0)
    } catch (err) {
        const msg = err instanceof Error ? err.message : String(err)
        console.error('FAIL', msg)
        closeDB()
        app.quit()
        process.exit(1)
    }
}

void main()
