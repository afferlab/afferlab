import type { Database } from 'better-sqlite3'
import crypto from 'node:crypto'
import fs from 'node:fs'
import path from 'node:path'
import type { StrategyManifest, StrategyRecord } from '../../../contracts/index'
import { getAppSettings, getStrategyPrefs, listStrategyOverrides } from '../settings/settingsStore'
import { DEFAULT_STRATEGY_ID } from './strategyScope'
import minimalStrategy, { configSchema as minimalConfigSchema } from '../../strategies/builtin/minimal'
import memoryFirstStrategy, { configSchema as memoryFirstConfigSchema } from '../../strategies/builtin/memory-first'
import { cloneValidatedConfigSchema } from './configSchema'

type BuiltinStrategySeed = {
    id: string
    key: string
    source: 'builtin'
    name: string
    description: string
    entry_path: string
    version: string
    capabilities: Record<string, unknown>
    default_allowlist: string[]
    manifest: StrategyManifest
}

const BUILTIN_STRATEGIES: BuiltinStrategySeed[] = [
    {
        id: 'builtin:minimal',
        key: 'minimal',
        source: 'builtin',
        name: minimalStrategy.meta.name,
        description: minimalStrategy.meta.description,
        entry_path: 'strategies/builtin/minimal.js',
        version: '1',
        capabilities: {},
        default_allowlist: [],
        manifest: {
            paramsSchema: cloneValidatedConfigSchema(minimalConfigSchema) as any,
            configSchema: cloneValidatedConfigSchema(minimalConfigSchema) as any,
        },
    },
    {
        id: 'builtin:memory-first',
        key: 'default',
        source: 'builtin',
        name: memoryFirstStrategy.meta.name,
        description: memoryFirstStrategy.meta.description,
        entry_path: 'strategies/builtin/memory-first.js',
        version: '1',
        capabilities: { supportsMemoryIngest: true },
        default_allowlist: ['memories.*', 'builtin.web_search', 'builtin.web_fetch', 'mcp.*'],
        manifest: {
            paramsSchema: cloneValidatedConfigSchema(memoryFirstConfigSchema) as any,
            configSchema: cloneValidatedConfigSchema(memoryFirstConfigSchema) as any,
        },
    },
]

function hashContent(input: string | Buffer): string {
    return crypto.createHash('sha256').update(input).digest('hex')
}

function resolveEntryPath(entryPath: string): string | null {
    if (!entryPath) return null
    const abs = path.isAbsolute(entryPath) ? entryPath : path.join(process.cwd(), entryPath)
    if (!fs.existsSync(abs)) return null
    return abs
}

function computeStrategyHash(seed: BuiltinStrategySeed): string {
    const filePath = resolveEntryPath(seed.entry_path)
    if (filePath) {
        const file = fs.readFileSync(filePath)
        return hashContent(Buffer.concat([file, Buffer.from(seed.id)]))
    }
    const fallback = JSON.stringify({
        id: seed.id,
        key: seed.key,
        name: seed.name,
        description: seed.description,
        version: seed.version,
        entry_path: seed.entry_path,
        default_allowlist: seed.default_allowlist,
        capabilities: seed.capabilities,
    })
    return hashContent(fallback)
}

export function seedBuiltinStrategies(db: Database): void {
    const now = Date.now()
    const existing = db.prepare(`
        SELECT id, key, name, description, entry_path, version, hash,
               capabilities_json, default_allowlist_json, manifest_json
        FROM strategies
    `).all() as Array<{
        id: string
        key: string
        name: string
        description: string
        entry_path: string
        version: string
        hash: string
        capabilities_json?: string | null
        default_allowlist_json?: string | null
        manifest_json?: string | null
    }>
    const existingById = new Map(existing.map(row => [row.id, row]))

    const insert = db.prepare(`
        INSERT INTO strategies (
            id, key, source, name, description, entry_path, version, hash,
            capabilities_json, default_allowlist_json, manifest_json, enabled,
            created_at, updated_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 1, ?, ?)
    `)
    const update = db.prepare(`
        UPDATE strategies
        SET key = ?, source = ?, name = ?, description = ?, entry_path = ?, version = ?,
            hash = ?, capabilities_json = ?, default_allowlist_json = ?, manifest_json = ?, updated_at = ?
        WHERE id = ?
    `)

    const tx = db.transaction(() => {
        for (const seed of BUILTIN_STRATEGIES) {
            const hash = computeStrategyHash(seed)
            const existingRow = existingById.get(seed.id)
            const capabilitiesJson = JSON.stringify(seed.capabilities ?? {})
            const allowlistJson = JSON.stringify(seed.default_allowlist ?? [])
            const manifestJson = JSON.stringify(seed.manifest ?? {})
            if (existingRow) {
                const changed = (
                    existingRow.key !== seed.key
                    || existingRow.name !== seed.name
                    || existingRow.description !== seed.description
                    || existingRow.entry_path !== seed.entry_path
                    || existingRow.version !== seed.version
                    || existingRow.hash !== hash
                    || (existingRow.capabilities_json ?? '{}') !== capabilitiesJson
                    || (existingRow.default_allowlist_json ?? '[]') !== allowlistJson
                    || (existingRow.manifest_json ?? '{}') !== manifestJson
                )
                if (changed) {
                    update.run(
                        seed.key,
                        seed.source,
                        seed.name,
                        seed.description,
                        seed.entry_path,
                        seed.version,
                        hash,
                        capabilitiesJson,
                        allowlistJson,
                        manifestJson,
                        now,
                        seed.id,
                    )
                }
            } else {
                insert.run(
                    seed.id,
                    seed.key,
                    seed.source,
                    seed.name,
                    seed.description,
                    seed.entry_path,
                    seed.version,
                    hash,
                    capabilitiesJson,
                    allowlistJson,
                    manifestJson,
                    now,
                    now,
                )
            }
        }
    })

    tx()
}

export function listStrategies(db: Database): StrategyRecord[] {
    seedBuiltinStrategies(db)
    const rows = db.prepare(`
        SELECT id, key, source, name, description, entry_path, version, hash,
               capabilities_json, default_allowlist_json, manifest_json,
               created_at, updated_at, enabled
        FROM strategies
        ORDER BY created_at DESC
    `).all() as Array<StrategyRecord & { enabled?: number }>
    return rows.map((row) => ({
        ...row,
        enabled: row.enabled == null ? undefined : row.enabled === 1,
    }))
}

export function getStrategyOrFallback(
    db: Database,
    args: { requestedStrategyId?: string | null; conversationId?: string },
): { strategy: StrategyRecord; reason?: string } {
    const strategies = listStrategies(db)
    const prefs = getStrategyPrefs(db)
    const enabledSet = new Set(prefs.enabledIds)
    const overrides = listStrategyOverrides(db)
    const disabled = new Set(overrides.filter(o => o.enabled === false).map(o => o.strategy_id))
    for (const strategy of strategies) {
        if (strategy.enabled === false) disabled.add(strategy.id)
        if (!enabledSet.has(strategy.id)) disabled.add(strategy.id)
    }

    let requested = args.requestedStrategyId ?? null
    if (!requested && args.conversationId) {
        const row = db.prepare(`SELECT strategy_id FROM conversations WHERE id = ?`)
            .get(args.conversationId) as { strategy_id?: string | null } | undefined
        requested = row?.strategy_id ?? null
    }

    if (requested) {
        const found = strategies.find(s => s.id === requested)
        if (found && !disabled.has(found.id)) {
            return { strategy: found }
        }
        if (found && disabled.has(found.id)) {
            const fallback = pickFallback(db, strategies, disabled)
            return { strategy: fallback, reason: 'disabled' }
        }
    }

    const fallback = pickFallback(db, strategies, disabled)
    return { strategy: fallback, reason: requested ? 'not_found' : undefined }
}

function pickFallback(db: Database, strategies: StrategyRecord[], disabled: Set<string>): StrategyRecord {
    const prefs = getStrategyPrefs(db)
    const app = getAppSettings(db)
    const preferred = prefs.defaultId ?? app.active_strategy_id
    if (preferred) {
        const entry = strategies.find(s => s.id === preferred)
        if (entry && !disabled.has(entry.id)) return entry
    }
    const def = strategies.find(s => s.id === DEFAULT_STRATEGY_ID)
    if (def && !disabled.has(def.id)) return def
    return strategies.find(s => !disabled.has(s.id)) ?? strategies[0]
}
