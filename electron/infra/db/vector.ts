import path from 'node:path'
import fs from 'node:fs'
import type { Database } from 'better-sqlite3'
import { ensureVectorIndex, initVectorService, vectorSelfTest } from '../../core/vectorService'

export function initializeVectorSupport(instance: Database): void {
    const libName = process.platform === 'darwin' ? 'vec0.dylib'
        : process.platform === 'win32' ? 'vec0.dll'
            : 'vec0.so'

    const libPath = path.join(process.cwd(), 'native', 'sqlite-extensions', process.platform, libName)

    try {
        if (!fs.existsSync(libPath)) {
            throw new Error(`Extension file not found: ${libPath}`)
        }
        instance.loadExtension(libPath)
        console.log('✅ sqlite-vec loaded from', libPath)
    } catch (e) {
        const error = e instanceof Error ? e : new Error(String(e))
        console.error('❌ Failed to load sqlite-vec:', error.message)
        // Handle the error...
    }

    initVectorService(instance)
    ensureVectorIndex({ level: 'mem', model: 'bge-small', dim: 768, metric: 'cosine' })
}

export function scheduleVectorSelfTest(): void {
    if (process.env.NODE_ENV !== 'production' && process.env.SKIP_VECTOR_SELF_TEST !== '1') {
        try {
            // Use setImmediate here to avoid the transaction block
            setImmediate(async () => {
                try {
                    await vectorSelfTest()
                    console.log('✅ vector self-test passed')
                } catch (e) {
                    console.error('❌ vector self-test failed:', e)
                }
            })
        } catch (e) {
            console.error('❌ failed to schedule vector self-test:', e)
        }
    }
}
