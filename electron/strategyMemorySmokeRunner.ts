import { app } from 'electron'
import { initDB, closeDB } from './db'
import { registerStrategies } from './strategies'
import { registerDefaultEmbeddingsProviders } from './core/embeddings/registerDefaultProviders'
import { runStrategyMemorySmoke } from './core/strategy/__dev__/strategyMemorySmoke'
import { waitForPendingReindex } from './core/strategy/switchStrategy'

async function main(): Promise<void> {
    process.env.SKIP_VECTOR_SELF_TEST = '1'
    await app.whenReady()
    registerDefaultEmbeddingsProviders()
    initDB()
    registerStrategies()

    try {
        await runStrategyMemorySmoke()
        await waitForPendingReindex()
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
