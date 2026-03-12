import type { Database } from 'better-sqlite3'
import type { StrategyManifest, StrategyRecord } from '../../../contracts/index'
import { getStrategyOverrideParams } from '../settings/settingsStore'

type StrategyConfigFieldType = 'number' | 'string' | 'text' | 'boolean'

type StrategyConfigField = {
    key: string
    type: StrategyConfigFieldType
    defaultValue?: unknown
    min?: number
    max?: number
}

function safeJson<T>(raw: string | null | undefined, fallback: T): T {
    if (!raw) return fallback
    try {
        return JSON.parse(raw) as T
    } catch {
        return fallback
    }
}

function toFiniteNumber(value: unknown): number | undefined {
    if (typeof value !== 'number' || !Number.isFinite(value)) return undefined
    return value
}

function normalizeFieldType(raw: unknown): StrategyConfigFieldType | null {
    if (raw === 'number') return 'number'
    if (raw === 'boolean') return 'boolean'
    if (raw === 'text') return 'text'
    if (raw === 'string') return 'string'
    return null
}

function inferFieldType(raw: Record<string, unknown>): StrategyConfigFieldType | null {
    const explicit = normalizeFieldType(raw.type)
    if (explicit) return explicit
    const def = raw.default ?? raw.defaultValue ?? raw.initial
    if (typeof def === 'boolean') return 'boolean'
    if (typeof def === 'number') return 'number'
    if (typeof def === 'string') return 'string'
    return null
}

function normalizeArraySchema(schema: unknown[]): StrategyConfigField[] {
    const fields: StrategyConfigField[] = []
    for (const item of schema) {
        if (!item || typeof item !== 'object') continue
        const raw = item as Record<string, unknown>
        const keyRaw = raw.key ?? raw.name ?? raw.id
        if (typeof keyRaw !== 'string' || !keyRaw.trim()) continue
        const type = inferFieldType(raw)
        if (!type) continue
        fields.push({
            key: keyRaw.trim(),
            type,
            defaultValue: raw.default ?? raw.defaultValue ?? raw.initial,
            min: toFiniteNumber(raw.min ?? raw.minimum),
            max: toFiniteNumber(raw.max ?? raw.maximum),
        })
    }
    return fields
}

function normalizeObjectSchema(schema: Record<string, unknown>): StrategyConfigField[] {
    const props = schema.properties
    if (!props || typeof props !== 'object') return []
    const fields: StrategyConfigField[] = []
    for (const [key, value] of Object.entries(props as Record<string, unknown>)) {
        if (!value || typeof value !== 'object') continue
        const raw = value as Record<string, unknown>
        const type = inferFieldType(raw)
        if (!type) continue
        fields.push({
            key,
            type,
            defaultValue: raw.default,
            min: toFiniteNumber(raw.min ?? raw.minimum),
            max: toFiniteNumber(raw.max ?? raw.maximum),
        })
    }
    return fields
}

function normalizeParamsSchema(schema: unknown): StrategyConfigField[] {
    if (!schema) return []
    if (Array.isArray(schema)) return normalizeArraySchema(schema)
    if (typeof schema === 'object') return normalizeObjectSchema(schema as Record<string, unknown>)
    return []
}

function clampNumber(value: number, field: StrategyConfigField): number {
    let out = value
    if (typeof field.min === 'number') out = Math.max(out, field.min)
    if (typeof field.max === 'number') out = Math.min(out, field.max)
    return out
}

function sanitizeFieldValue(field: StrategyConfigField, value: unknown): unknown | undefined {
    if (field.type === 'boolean') {
        return typeof value === 'boolean' ? value : undefined
    }
    if (field.type === 'string' || field.type === 'text') {
        return typeof value === 'string' ? value : undefined
    }
    if (field.type === 'number') {
        const num = toFiniteNumber(value)
        if (num == null) return undefined
        return clampNumber(num, field)
    }
    return undefined
}

function buildDefaults(fields: StrategyConfigField[]): Record<string, unknown> {
    const defaults: Record<string, unknown> = {}
    for (const field of fields) {
        const normalized = sanitizeFieldValue(field, field.defaultValue)
        if (normalized !== undefined) defaults[field.key] = normalized
    }
    return defaults
}

function readManifest(record: StrategyRecord): StrategyManifest {
    return safeJson<StrategyManifest>(record.manifest_json ?? '{}', {})
}

export function buildStrategyRuntimeConfig(
    db: Database,
    record: StrategyRecord,
): Record<string, unknown> {
    const manifest = readManifest(record)
    const fields = normalizeParamsSchema(manifest.paramsSchema)
    if (fields.length === 0) return {}

    const defaults = buildDefaults(fields)
    const overrides = getStrategyOverrideParams(db, record.id)
    const merged: Record<string, unknown> = { ...defaults }

    for (const field of fields) {
        if (!Object.prototype.hasOwnProperty.call(overrides, field.key)) continue
        const normalized = sanitizeFieldValue(field, overrides[field.key])
        if (normalized !== undefined) {
            merged[field.key] = normalized
        } else if (!Object.prototype.hasOwnProperty.call(defaults, field.key)) {
            delete merged[field.key]
        }
    }

    return merged
}
