export type StrategyConfigType = 'text' | 'number' | 'boolean' | 'select'

export type StrategyConfigOption = {
    label: string
    value: string
}

export type StrategyConfigEntry = {
    key: string
    type: StrategyConfigType
    default: string | number | boolean
    label?: string
    description?: string
    min?: number
    max?: number
    step?: number
    options?: StrategyConfigOption[]
}

function toFiniteNumber(value: unknown): number | undefined {
    if (typeof value !== 'number' || !Number.isFinite(value)) return undefined
    return value
}

function normalizeType(raw: unknown): StrategyConfigType | null {
    if (raw === 'text' || raw === 'number' || raw === 'boolean' || raw === 'select') return raw
    if (raw === 'string') return 'text'
    return null
}

function normalizeOptions(raw: unknown): StrategyConfigOption[] | undefined {
    if (!Array.isArray(raw)) return undefined
    const options: StrategyConfigOption[] = []
    for (const item of raw) {
        if (typeof item === 'string' && item.trim()) {
            options.push({ label: item.trim(), value: item.trim() })
            continue
        }
        if (!item || typeof item !== 'object') continue
        const rec = item as Record<string, unknown>
        const value = typeof rec.value === 'string' && rec.value.trim()
            ? rec.value.trim()
            : typeof rec.id === 'string' && rec.id.trim()
                ? rec.id.trim()
                : null
        if (!value) continue
        const label = typeof rec.label === 'string' && rec.label.trim()
            ? rec.label.trim()
            : typeof rec.name === 'string' && rec.name.trim()
                ? rec.name.trim()
                : value
        options.push({ label, value })
    }
    return options
}

function readDefault(raw: Record<string, unknown>): unknown {
    if (Object.prototype.hasOwnProperty.call(raw, 'default')) return raw.default
    if (Object.prototype.hasOwnProperty.call(raw, 'defaultValue')) return raw.defaultValue
    if (Object.prototype.hasOwnProperty.call(raw, 'initial')) return raw.initial
    return undefined
}

function invalidSchemaError(key: string, field: string, constraint: string): Error {
    return new Error(`Invalid configSchema for key "${key}":\n"${field}" must ${constraint}.`)
}

function missingFieldError(key: string, field: string): Error {
    return invalidSchemaError(key, field, 'be defined')
}

function normalizeEntry(raw: unknown, index: number): StrategyConfigEntry {
    if (!raw || typeof raw !== 'object') {
        throw new Error(`Invalid configSchema at index ${index}: entry must be an object.`)
    }
    const rec = raw as Record<string, unknown>
    const keyRaw = rec.key ?? rec.name ?? rec.id
    if (typeof keyRaw !== 'string' || !keyRaw.trim()) {
        throw new Error(`Invalid configSchema at index ${index}: "key" must be a non-empty string.`)
    }
    const key = keyRaw.trim()
    const type = normalizeType(rec.type)
    if (!type) {
        throw invalidSchemaError(key, 'type', 'be one of "text", "number", "boolean", or "select"')
    }
    const defaultValue = readDefault(rec)
    if (defaultValue === undefined) {
        throw missingFieldError(key, 'default')
    }

    const entry: StrategyConfigEntry = {
        key,
        type,
        default: defaultValue as StrategyConfigEntry['default'],
        label: typeof rec.label === 'string' && rec.label.trim() ? rec.label.trim() : undefined,
        description: typeof rec.description === 'string' && rec.description.trim() ? rec.description.trim() : undefined,
        min: toFiniteNumber(rec.min ?? rec.minimum),
        max: toFiniteNumber(rec.max ?? rec.maximum),
        step: toFiniteNumber(rec.step ?? rec.multipleOf),
    }

    if (type === 'number') {
        if (typeof entry.default !== 'number' || !Number.isFinite(entry.default)) {
            throw invalidSchemaError(key, 'default', 'be a finite number')
        }
        if (typeof entry.min === 'number' && typeof entry.max === 'number' && entry.min > entry.max) {
            throw invalidSchemaError(key, 'min', 'be less than or equal to "max"')
        }
        if (typeof entry.min === 'number' && entry.default < entry.min) {
            throw invalidSchemaError(key, 'default', 'be within [min, max]')
        }
        if (typeof entry.max === 'number' && entry.default > entry.max) {
            throw invalidSchemaError(key, 'default', 'be within [min, max]')
        }
        return entry
    }

    if (type === 'boolean') {
        if (typeof entry.default !== 'boolean') {
            throw invalidSchemaError(key, 'default', 'be boolean')
        }
        return entry
    }

    if (type === 'text') {
        if (typeof entry.default !== 'string') {
            throw invalidSchemaError(key, 'default', 'be string')
        }
        return entry
    }

    const options = normalizeOptions(rec.options ?? rec.enum)
    if (!options || options.length === 0) {
        throw invalidSchemaError(key, 'options', 'exist and contain at least one option')
    }
    if (typeof entry.default !== 'string') {
        throw invalidSchemaError(key, 'default', 'be string')
    }
    if (!options.some((option) => option.value === entry.default)) {
        throw invalidSchemaError(key, 'default', 'match one of the provided options')
    }
    entry.options = options
    return entry
}

function normalizeArraySchema(schema: unknown[]): StrategyConfigEntry[] {
    const entries = schema.map((item, index) => normalizeEntry(item, index))
    const seen = new Set<string>()
    for (const entry of entries) {
        if (seen.has(entry.key)) {
            throw invalidSchemaError(entry.key, 'key', 'be unique')
        }
        seen.add(entry.key)
    }
    return entries
}

function normalizeObjectSchema(schema: Record<string, unknown>): StrategyConfigEntry[] {
    if (!schema.properties || typeof schema.properties !== 'object') {
        throw new Error('Invalid configSchema: schema must be an array of entries.')
    }
    const entries = Object.entries(schema.properties as Record<string, unknown>).map(([key, value], index) => {
        const record = value && typeof value === 'object'
            ? { ...(value as Record<string, unknown>), key }
            : { key }
        return normalizeEntry(record, index)
    })
    const seen = new Set<string>()
    for (const entry of entries) {
        if (seen.has(entry.key)) {
            throw invalidSchemaError(entry.key, 'key', 'be unique')
        }
        seen.add(entry.key)
    }
    return entries
}

export function validateConfigSchema(schema: unknown): StrategyConfigEntry[] {
    if (schema == null) return []
    if (Array.isArray(schema)) return normalizeArraySchema(schema)
    if (typeof schema === 'object') return normalizeObjectSchema(schema as Record<string, unknown>)
    throw new Error('Invalid configSchema: schema must be an array of entries.')
}

export function sanitizeConfigValue(entry: StrategyConfigEntry, value: unknown): unknown {
    if (entry.type === 'number') {
        if (typeof value !== 'number' || !Number.isFinite(value)) return entry.default
        let next = value
        if (typeof entry.min === 'number') next = Math.max(next, entry.min)
        if (typeof entry.max === 'number') next = Math.min(next, entry.max)
        return next
    }
    if (entry.type === 'boolean') {
        return typeof value === 'boolean' ? value : entry.default
    }
    if (entry.type === 'text') {
        return typeof value === 'string' ? value : entry.default
    }
    const options = entry.options ?? []
    if (typeof value !== 'string') return entry.default
    return options.some((option) => option.value === value) ? value : entry.default
}

export function buildNormalizedConfigFromEntries(args: {
    schema: StrategyConfigEntry[]
    overrides?: Record<string, unknown> | null | undefined
}): Record<string, unknown> {
    const overrides = args.overrides && typeof args.overrides === 'object' && !Array.isArray(args.overrides)
        ? args.overrides
        : {}
    const config: Record<string, unknown> = {}
    for (const entry of args.schema) {
        const hasOverride = Object.prototype.hasOwnProperty.call(overrides, entry.key)
        config[entry.key] = sanitizeConfigValue(entry, hasOverride ? overrides[entry.key] : entry.default)
    }
    return config
}

export function buildNormalizedConfig(args: {
    schema: unknown
    overrides?: Record<string, unknown> | null | undefined
}): Record<string, unknown> {
    return buildNormalizedConfigFromEntries({
        schema: validateConfigSchema(args.schema),
        overrides: args.overrides,
    })
}

export function cloneValidatedConfigSchema(schema: unknown): StrategyConfigEntry[] {
    return validateConfigSchema(schema).map((entry) => ({
        ...entry,
        ...(entry.options ? { options: entry.options.map((option) => ({ ...option })) } : {}),
    }))
}
