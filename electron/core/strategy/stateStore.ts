import type { Database } from 'better-sqlite3'

export type StrategyStateScope = 'conversation'

type StrategyStateKey = {
    strategyId: string
    scopeType: StrategyStateScope
    scopeId: string
    key: string
}

function assertJsonSerializable(value: unknown, path: string, seen: WeakSet<object>): void {
    if (value === null) return

    if (typeof value === 'string' || typeof value === 'boolean') return

    if (typeof value === 'number') {
        if (!Number.isFinite(value)) {
            throw new Error(`state value at ${path} must be a finite number`)
        }
        return
    }

    if (typeof value === 'undefined') {
        throw new Error(`state value at ${path} cannot be undefined`)
    }

    if (typeof value === 'function') {
        throw new Error(`state value at ${path} cannot be a function`)
    }

    if (typeof value === 'bigint' || typeof value === 'symbol') {
        throw new Error(`state value at ${path} is not JSON-serializable`)
    }

    if (typeof value !== 'object') {
        throw new Error(`state value at ${path} is not JSON-serializable`)
    }

    if (seen.has(value)) {
        throw new Error(`state value at ${path} contains a circular reference`)
    }
    seen.add(value)

    if (Array.isArray(value)) {
        value.forEach((item, index) => {
            assertJsonSerializable(item, `${path}[${index}]`, seen)
        })
        seen.delete(value)
        return
    }

    for (const [key, entry] of Object.entries(value)) {
        assertJsonSerializable(entry, `${path}.${key}`, seen)
    }
    seen.delete(value)
}

function clonePersistableValue(value: unknown): unknown {
    assertJsonSerializable(value, 'value', new WeakSet<object>())

    try {
        const serialized = JSON.stringify(value)
        if (typeof serialized !== 'string') {
            throw new Error('state value could not be serialized')
        }
        return JSON.parse(serialized) as unknown
    } catch (err) {
        const message = err instanceof Error ? err.message : String(err)
        throw new Error(`state value must be JSON-serializable: ${message}`)
    }
}

function encodeValue(value: unknown): { dataType: 'json' | 'string' | 'number' | 'boolean'; stored: string } {
    const cloned = clonePersistableValue(value)

    if (typeof cloned === 'string') return { dataType: 'string', stored: cloned }
    if (typeof cloned === 'number') return { dataType: 'number', stored: String(cloned) }
    if (typeof cloned === 'boolean') return { dataType: 'boolean', stored: cloned ? 'true' : 'false' }
    return { dataType: 'json', stored: JSON.stringify(cloned) }
}

function decodeValue(row: { value: string; data_type: string }): unknown {
    if (row.data_type === 'number') return Number(row.value)
    if (row.data_type === 'boolean') return row.value === 'true'
    if (row.data_type === 'string') return row.value
    try {
        return JSON.parse(row.value)
    } catch {
        return null
    }
}

function makeId(input: StrategyStateKey): string {
    return `${input.strategyId}:${input.scopeType}:${input.scopeId}:${input.key}`
}

export function getStrategyState(db: Database, input: StrategyStateKey): unknown | null {
    const row = db.prepare(`
        SELECT value, data_type
        FROM strategy_state
        WHERE strategy_id = ?
          AND scope_type = ?
          AND scope_id = ?
          AND key = ?
    `).get(input.strategyId, input.scopeType, input.scopeId, input.key) as { value: string; data_type: string } | undefined

    if (!row) return null

    const now = Date.now()
    db.prepare(`
        UPDATE strategy_state
        SET accessed_at = ?, access_count = access_count + 1
        WHERE strategy_id = ?
          AND scope_type = ?
          AND scope_id = ?
          AND key = ?
    `).run(now, input.strategyId, input.scopeType, input.scopeId, input.key)

    return decodeValue(row)
}

export function setStrategyState(db: Database, input: StrategyStateKey & { value: unknown }): void {
    const now = Date.now()
    const encoded = encodeValue(input.value)
    const id = makeId(input)
    db.prepare(`
        INSERT INTO strategy_state(
            id, strategy_id, scope_type, scope_id, key, value, data_type,
            created_at, updated_at, accessed_at, access_count
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 0)
        ON CONFLICT(strategy_id, scope_type, scope_id, key) DO UPDATE SET
            value = excluded.value,
            data_type = excluded.data_type,
            updated_at = excluded.updated_at
    `).run(
        id,
        input.strategyId,
        input.scopeType,
        input.scopeId,
        input.key,
        encoded.stored,
        encoded.dataType,
        now,
        now,
        now,
    )
}

export function hasStrategyState(db: Database, input: StrategyStateKey): boolean {
    const row = db.prepare(`
        SELECT 1
        FROM strategy_state
        WHERE strategy_id = ?
          AND scope_type = ?
          AND scope_id = ?
          AND key = ?
        LIMIT 1
    `).get(input.strategyId, input.scopeType, input.scopeId, input.key)

    return Boolean(row)
}

export function deleteStrategyState(db: Database, input: StrategyStateKey): void {
    db.prepare(`
        DELETE FROM strategy_state
        WHERE strategy_id = ?
          AND scope_type = ?
          AND scope_id = ?
          AND key = ?
    `).run(input.strategyId, input.scopeType, input.scopeId, input.key)
}

export function listStrategyState(
    db: Database,
    input: { strategyId: string; scopeType: StrategyStateScope; scopeId: string },
): Array<{ key: string; value: unknown }> {
    const rows = db.prepare(`
        SELECT key, value, data_type
        FROM strategy_state
        WHERE strategy_id = ?
          AND scope_type = ?
          AND scope_id = ?
        ORDER BY key ASC
    `).all(input.strategyId, input.scopeType, input.scopeId) as Array<{ key: string; value: string; data_type: string }>

    return rows.map((row) => ({
        key: row.key,
        value: decodeValue({ value: row.value, data_type: row.data_type }),
    }))
}
