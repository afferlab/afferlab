import type { Database } from 'better-sqlite3'
import type { StrategyManifest, StrategyRecord } from '../../../contracts/index'
import { getStrategyOverrideParams } from '../settings/settingsStore'
import {
    buildNormalizedConfigFromEntries,
    cloneValidatedConfigSchema,
} from './configSchema'

const schemaCache = new Map<string, ReturnType<typeof cloneValidatedConfigSchema>>()

function safeJson<T>(raw: string | null | undefined, fallback: T): T {
    if (!raw) return fallback
    try {
        return JSON.parse(raw) as T
    } catch {
        return fallback
    }
}

function readManifest(record: StrategyRecord): StrategyManifest {
    return safeJson<StrategyManifest>(record.manifest_json ?? '{}', {})
}

function getValidatedRuntimeSchema(record: StrategyRecord, manifest: StrategyManifest) {
    const rawSchema = manifest.configSchema ?? manifest.paramsSchema
    if (!rawSchema) return []
    const cacheKey = `${record.id}:${record.manifest_json ?? ''}`
    const cached = schemaCache.get(cacheKey)
    if (cached) return cached
    const validated = cloneValidatedConfigSchema(rawSchema)
    schemaCache.set(cacheKey, validated)
    return validated
}

export function buildStrategyRuntimeConfig(
    db: Database,
    record: StrategyRecord,
): Record<string, unknown> {
    const manifest = readManifest(record)
    const schema = getValidatedRuntimeSchema(record, manifest)
    if (schema.length === 0) return {}
    const overrides = getStrategyOverrideParams(db, record.id)
    return buildNormalizedConfigFromEntries({
        schema,
        overrides,
    })
}
