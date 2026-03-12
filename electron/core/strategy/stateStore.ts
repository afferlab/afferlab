import type { Database } from 'better-sqlite3'

export type StrategyStateScope = 'conversation'

type StrategyStateKey = {
    strategyId: string
    scopeType: StrategyStateScope
    scopeId: string
    key: string
}

function encodeValue(value: unknown): { dataType: 'json' | 'string' | 'number' | 'boolean'; stored: string } {
    if (typeof value === 'string') return { dataType: 'string', stored: value }
    if (typeof value === 'number' && Number.isFinite(value)) return { dataType: 'number', stored: String(value) }
    if (typeof value === 'boolean') return { dataType: 'boolean', stored: value ? 'true' : 'false' }
    return { dataType: 'json', stored: JSON.stringify(value ?? null) }
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
