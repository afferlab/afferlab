import fs from 'node:fs'
import path from 'node:path'
import { pathToFileURL } from 'node:url'
import type { StrategyRecord } from '../../../contracts/index'

type StrategyFeatureFlags = {
    memoryCloud?: boolean
}

type CachedFeatures = {
    mtimeMs: number
    size: number
    flags: StrategyFeatureFlags
}

const featureCache = new Map<string, CachedFeatures>()

function safeJson<T>(raw: string | null | undefined, fallback: T): T {
    if (!raw) return fallback
    try {
        return JSON.parse(raw) as T
    } catch {
        return fallback
    }
}

function fallbackMemoryCloudByCapabilities(strategy: Pick<StrategyRecord, 'capabilities_json'>): boolean {
    const capabilities = safeJson<Record<string, unknown>>(
        strategy.capabilities_json ?? '{}',
        {},
    )
    return Boolean((capabilities as { supportsMemoryIngest?: boolean }).supportsMemoryIngest)
}

function isRecord(value: unknown): value is Record<string, unknown> {
    return Boolean(value && typeof value === 'object')
}

function readMetaMemoryCloud(mod: Record<string, unknown>): boolean | undefined {
    const defaultExport = isRecord(mod.default) ? mod.default : null
    const meta = (isRecord(mod.meta) ? mod.meta : null)
        ?? (defaultExport && isRecord(defaultExport.meta) ? defaultExport.meta : null)
    if (!meta || !isRecord(meta.features)) return undefined
    const value = (meta.features as { memoryCloud?: unknown }).memoryCloud
    return typeof value === 'boolean' ? value : undefined
}

function resolveStrategyEntryPath(entryPath: string): string | null {
    if (!entryPath || typeof entryPath !== 'string') return null
    const appRoot = process.env.APP_ROOT ?? process.cwd()
    const candidates: string[] = []

    if (entryPath.startsWith('builtin:')) {
        const name = entryPath.split(':')[1] ?? entryPath
        candidates.push(path.join(appRoot, 'dist-electron', 'strategies', 'builtin', `${name}.js`))
        candidates.push(path.join(appRoot, 'electron', 'strategies', 'builtin', `${name}.ts`))
    }

    if (path.isAbsolute(entryPath)) {
        candidates.push(entryPath)
    } else {
        candidates.push(path.join(appRoot, entryPath))
        candidates.push(path.join(appRoot, 'dist-electron', entryPath))
    }

    if (entryPath.endsWith('.js')) {
        const tsPath = entryPath.replace(/\.js$/, '.ts')
        candidates.push(path.join(appRoot, tsPath))
        candidates.push(path.join(appRoot, 'electron', tsPath))
    }

    for (const candidate of candidates) {
        if (!candidate || !fs.existsSync(candidate)) continue
        return candidate
    }
    return null
}

export async function resolveStrategyMemoryCloudFeature(
    strategy: Pick<StrategyRecord, 'entry_path' | 'capabilities_json'>,
): Promise<boolean> {
    const fallback = fallbackMemoryCloudByCapabilities(strategy)
    const resolvedPath = resolveStrategyEntryPath(strategy.entry_path)
    if (!resolvedPath) return fallback

    let stat: fs.Stats
    try {
        stat = fs.statSync(resolvedPath)
    } catch {
        return fallback
    }

    const cached = featureCache.get(resolvedPath)
    if (cached && cached.mtimeMs === stat.mtimeMs && cached.size === stat.size) {
        return typeof cached.flags.memoryCloud === 'boolean' ? cached.flags.memoryCloud : fallback
    }

    try {
        const fileUrl = pathToFileURL(resolvedPath).href
        const cacheBust = `?v=${Math.trunc(stat.mtimeMs)}-${stat.size}`
        const mod = await import(`${fileUrl}${cacheBust}`) as Record<string, unknown>
        const memoryCloud = readMetaMemoryCloud(mod)
        featureCache.set(resolvedPath, {
            mtimeMs: stat.mtimeMs,
            size: stat.size,
            flags: { memoryCloud },
        })
        return typeof memoryCloud === 'boolean' ? memoryCloud : fallback
    } catch {
        return fallback
    }
}

