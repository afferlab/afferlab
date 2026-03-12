export type StrategyConfigFieldType = "number" | "string" | "text" | "boolean"

export type StrategyConfigField = {
    key: string
    label: string
    type: StrategyConfigFieldType
    description?: string
    defaultValue?: unknown
    min?: number
    max?: number
    step?: number
}

function toFiniteNumber(value: unknown): number | undefined {
    if (typeof value !== "number" || !Number.isFinite(value)) return undefined
    return value
}

function clampNumber(value: number, field: StrategyConfigField): number {
    let out = value
    if (typeof field.min === "number") out = Math.max(field.min, out)
    if (typeof field.max === "number") out = Math.min(field.max, out)
    return out
}

function normalizeFieldType(raw: unknown): StrategyConfigFieldType | null {
    if (raw === "number") return "number"
    if (raw === "boolean") return "boolean"
    if (raw === "text") return "text"
    if (raw === "string") return "string"
    return null
}

function inferFieldType(input: Record<string, unknown>): StrategyConfigFieldType | null {
    const explicit = normalizeFieldType(input.type)
    if (explicit) return explicit
    const control = typeof input.control === "string" ? input.control : undefined
    if (control === "textarea") return "text"
    const widget = typeof input.widget === "string" ? input.widget : undefined
    if (widget === "textarea") return "text"
    const def = input.default ?? input.defaultValue ?? input.initial
    if (typeof def === "boolean") return "boolean"
    if (typeof def === "number") return "number"
    if (typeof def === "string") return "string"
    return null
}

function fromArraySchema(schema: unknown[]): StrategyConfigField[] {
    const fields: StrategyConfigField[] = []
    schema.forEach((item, index) => {
        if (!item || typeof item !== "object") return
        const raw = item as Record<string, unknown>
        const keyRaw = raw.key ?? raw.name ?? raw.id
        if (typeof keyRaw !== "string" || !keyRaw.trim()) return
        const type = inferFieldType(raw)
        if (!type) return
        const field: StrategyConfigField = {
            key: keyRaw.trim(),
            label: typeof raw.label === "string" ? raw.label : keyRaw.trim(),
            type,
            description: typeof raw.description === "string" ? raw.description : undefined,
            defaultValue: raw.default ?? raw.defaultValue ?? raw.initial,
            min: toFiniteNumber(raw.min ?? raw.minimum),
            max: toFiniteNumber(raw.max ?? raw.maximum),
            step: toFiniteNumber(raw.step ?? raw.multipleOf),
        }
        if (!field.label) {
            field.label = `Field ${index + 1}`
        }
        fields.push(field)
    })
    return fields
}

function fromObjectSchema(schema: Record<string, unknown>): StrategyConfigField[] {
    const props = schema.properties
    if (!props || typeof props !== "object") return []
    const entries = Object.entries(props as Record<string, unknown>)
    const fields: StrategyConfigField[] = []
    entries.forEach(([key, value]) => {
        if (!value || typeof value !== "object") return
        const raw = value as Record<string, unknown>
        const type = inferFieldType(raw)
        if (!type) return
        fields.push({
            key,
            label: typeof raw.title === "string" ? raw.title : key,
            type,
            description: typeof raw.description === "string" ? raw.description : undefined,
            defaultValue: raw.default,
            min: toFiniteNumber(raw.min ?? raw.minimum),
            max: toFiniteNumber(raw.max ?? raw.maximum),
            step: toFiniteNumber(raw.step ?? raw.multipleOf),
        })
    })
    return fields
}

export function normalizeStrategyParamsSchema(schema: unknown): StrategyConfigField[] {
    if (!schema) return []
    if (Array.isArray(schema)) return fromArraySchema(schema)
    if (typeof schema === "object") return fromObjectSchema(schema as Record<string, unknown>)
    return []
}

export function sanitizeFieldValue(field: StrategyConfigField, value: unknown): unknown | undefined {
    if (field.type === "boolean") {
        return typeof value === "boolean" ? value : undefined
    }
    if (field.type === "string" || field.type === "text") {
        return typeof value === "string" ? value : undefined
    }
    if (field.type === "number") {
        const num = toFiniteNumber(value)
        if (num == null) return undefined
        return clampNumber(num, field)
    }
    return undefined
}

export function buildDefaultConfig(fields: StrategyConfigField[]): Record<string, unknown> {
    const defaults: Record<string, unknown> = {}
    for (const field of fields) {
        const normalized = sanitizeFieldValue(field, field.defaultValue)
        if (normalized !== undefined) {
            defaults[field.key] = normalized
        }
    }
    return defaults
}

export function mergeWithOverrides(
    fields: StrategyConfigField[],
    overrides: Record<string, unknown> | null | undefined,
): Record<string, unknown> {
    const defaults = buildDefaultConfig(fields)
    const merged: Record<string, unknown> = { ...defaults }
    const source = (overrides && typeof overrides === "object" && !Array.isArray(overrides))
        ? overrides
        : {}
    for (const field of fields) {
        if (!Object.prototype.hasOwnProperty.call(source, field.key)) continue
        const normalized = sanitizeFieldValue(field, source[field.key])
        if (normalized !== undefined) {
            merged[field.key] = normalized
        } else if (!Object.prototype.hasOwnProperty.call(defaults, field.key)) {
            delete merged[field.key]
        }
    }
    return merged
}

export function buildOverridesDiff(
    fields: StrategyConfigField[],
    effective: Record<string, unknown>,
): Record<string, unknown> {
    const defaults = buildDefaultConfig(fields)
    const diff: Record<string, unknown> = {}
    for (const field of fields) {
        if (!Object.prototype.hasOwnProperty.call(effective, field.key)) continue
        const current = sanitizeFieldValue(field, effective[field.key])
        if (current === undefined) continue
        if (!Object.prototype.hasOwnProperty.call(defaults, field.key)) {
            diff[field.key] = current
            continue
        }
        const def = defaults[field.key]
        if (!Object.is(current, def)) {
            diff[field.key] = current
        }
    }
    return diff
}
