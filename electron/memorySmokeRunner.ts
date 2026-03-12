import { app } from 'electron'
import { initDB, getDB, closeDB } from './db'
import { runMemorySmoke } from './core/memory/__dev__/memorySmoke'

async function main(): Promise<void> {
    process.env.SKIP_VECTOR_SELF_TEST = '1'
    await app.whenReady()
    initDB()

    try {
        await runMemorySmoke(getDB())
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
