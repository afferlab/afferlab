import fs from 'node:fs'
import path from 'node:path'
import { Worker, type WorkerOptions } from 'node:worker_threads'
import { pathToFileURL } from 'node:url'
import type { StrategyDevCompileResult, StrategyDevError, StrategyDevLogEntry } from '../../../../contracts/index'

type DevWorkerResponse = {
    id: string
    ok: boolean
    meta?: Record<string, unknown>
    paramsSchema?: unknown
    exportsDetected?: string[]
    smokeTest?: {
        calledOnContextBuild?: boolean
        slotsAdded?: number
    }
    errors?: StrategyDevError[]
    logs?: StrategyDevLogEntry[]
}

const WORKER_TIMEOUT_MS = 5000

function buildWorkerPath(): string {
    const appRoot = process.env.APP_ROOT ?? process.cwd()
    return path.join(appRoot, 'dist-electron', 'strategyDevWorker.js')
}

export async function runDevSandboxTest(code: string): Promise<StrategyDevCompileResult> {
    const workerFile = buildWorkerPath()
    if (!fs.existsSync(workerFile)) {
        return { ok: false, errors: [{ message: `dev worker not found: ${workerFile}` }] }
    }

    const workerUrl = pathToFileURL(workerFile)
    const worker = new Worker(workerUrl, { type: 'module' } as unknown as WorkerOptions)
    const id = '1'

    return new Promise((resolve) => {
        let settled = false

        const finish = (result: StrategyDevCompileResult) => {
            if (settled) return
            settled = true
            resolve(result)
            try {
                void worker.terminate()
            } catch {
                // ignore terminate failures
            }
        }

        const timeoutId = setTimeout(() => {
            finish({
                ok: false,
                errors: [{ message: `dev worker timeout after ${WORKER_TIMEOUT_MS}ms` }],
            })
        }, WORKER_TIMEOUT_MS)

        worker.on('message', (msg: DevWorkerResponse) => {
            if (msg.id !== id) return
            clearTimeout(timeoutId)
            finish({
                ok: msg.ok,
                meta: msg.meta,
                paramsSchema: msg.paramsSchema,
                exportsDetected: msg.exportsDetected,
                smokeTest: msg.smokeTest,
                errors: msg.errors,
                logs: msg.logs,
            })
        })

        worker.on('error', (err) => {
            const error = err instanceof Error ? err : new Error(String(err))
            clearTimeout(timeoutId)
            finish({
                ok: false,
                errors: [{ message: error.message, stack: error.stack }],
            })
        })

        worker.on('exit', (code) => {
            if (settled) return
            clearTimeout(timeoutId)
            if (code !== 0) {
                finish({
                    ok: false,
                    errors: [{ message: `dev worker exited with code ${code ?? 'unknown'}` }],
                })
            }
        })

        worker.postMessage({ id, code })
    })
}
