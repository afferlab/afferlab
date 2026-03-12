// electron/config/loadModels.ts
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { log } from '../core/logging/runtimeLogger'
type RepoModelConfig = Record<string, unknown>

const __filename = fileURLToPath(import.meta.url)
const __dirname  = path.dirname(__filename)

function resolveModelsPath(): string {
    const candidates = [
        path.resolve(process.cwd(), 'electron/config/models.json'),
        path.resolve(__dirname, '../config/models.json'),
        path.resolve(__dirname, '../../config/models.json'),
        path.resolve(__dirname, 'config/models.json'),
        path.resolve(process.cwd(), 'config/models.json'),
    ]
    for (const p of candidates) if (fs.existsSync(p)) return p
    return candidates[0]
}

let cache: RepoModelConfig[] | null = null
let chosenPath = ''

export function loadModelsSync(): RepoModelConfig[] {
    if (cache) return cache
    const modelsPath = resolveModelsPath()
    chosenPath = modelsPath
    try {
        const json = fs.readFileSync(modelsPath, 'utf-8')
        cache = JSON.parse(json) as RepoModelConfig[]
        const ids = cache.map(m => String(m.id ?? '')).filter(Boolean)
        log('info', '[MODELS]', {
            count: ids.length,
            selectedModelId: null,
            source: path.basename(modelsPath),
        })
        if (process.env.DEBUG_MODELS === '1') {
            log('debug', '[MODELS][ids]', { ids }, { debugFlag: 'DEBUG_MODELS' })
        }
    } catch (e) {
        log('error', '[MODELS][load_failed]', {
            source: path.basename(modelsPath),
            error: e instanceof Error ? e.message : String(e),
        })
        cache = []
    }
    return cache
}

export function invalidateModelsCache(): void {
    cache = null
    chosenPath = ''
}

export const getModelsSync = () => loadModelsSync()
export const getModelByIdSync = (id: string) => loadModelsSync().find(m => m.id === id)
export const debugModelsPath = () => chosenPath || resolveModelsPath()
