// noinspection SqlNoDataSourceInspection,SqlResolve

import type {Database} from 'better-sqlite3'
import crypto from 'node:crypto'

/** Distance metric and level. */
export type Metric = 'cosine' | 'l2' | 'dot'
export type Level  = 'mem' | 'asset'

/** Specification for one vector index (virtual table). */
export interface VectorIndexSpec {
    level: Level
    model: string
    dim: number
    metric: Metric
}

let db: Database | null = null
function assertDB(): Database {
    if (!db) throw new Error('[vectorService] initVectorService() has not been called.')
    return db
}

/** Normalize a virtual table name (avoid special characters). */
function makeVtabName(spec: VectorIndexSpec): string {
    const modelSafe = spec.model.replace(/[^a-zA-Z0-9_]+/g, '_').slice(0, 64)
    return `vec_${spec.level}_${modelSafe}_${spec.dim}_${spec.metric}`
}

/** Initialize backing tables. */
export function initVectorService(instance: Database): void {
    db = instance
    instance.exec(`
        CREATE TABLE IF NOT EXISTS vector_indexes (
                                                      id         TEXT PRIMARY KEY,
                                                      level      TEXT NOT NULL CHECK(level IN ('mem','asset')),
                                                      model      TEXT NOT NULL,
                                                      dim        INTEGER NOT NULL,
                                                      metric     TEXT NOT NULL CHECK(metric IN ('cosine','l2','dot')),
                                                      table_name TEXT NOT NULL UNIQUE,
                                                      created_at INTEGER NOT NULL,
                                                      UNIQUE(level, model, dim, metric)
        );
    `)
    instance.exec(`
        CREATE TABLE IF NOT EXISTS vector_rowids (
                                                     rid INTEGER PRIMARY KEY AUTOINCREMENT,
                                                     id  TEXT UNIQUE NOT NULL
        );
    `)
}

/** Ensure the matching virtual table exists and return its name. */
export function ensureVectorIndex(spec: VectorIndexSpec): string {
    const dbc = assertDB()
    const table = makeVtabName(spec)
    const id = `${spec.level}:${spec.model}:${spec.dim}:${spec.metric}`
    const now = Date.now()

    const found = dbc.prepare(`SELECT table_name FROM vector_indexes WHERE id=?`).get(id) as { table_name?: string } | undefined
    if (found?.table_name) return found.table_name

    const createVtabSQL = `
    CREATE VIRTUAL TABLE IF NOT EXISTS ${table}
    USING vec0( embedding FLOAT[${spec.dim}] )
  `
    const tx = dbc.transaction(() => {
        dbc.exec(createVtabSQL)
        dbc.prepare(`
      INSERT OR IGNORE INTO vector_indexes(id, level, model, dim, metric, table_name, created_at)
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `).run(id, spec.level, spec.model, spec.dim, spec.metric, table, now)
    })
    tx()
    return table
}

/** rowid mapping helpers. */
export function getOrCreateRowId(externalId: string): number {
    const dbc = assertDB()
    const tx = dbc.transaction(() => {
        const got = dbc.prepare(`SELECT rid FROM vector_rowids WHERE id=?`).get(externalId) as { rid: number } | undefined
        if (got) return got.rid
        dbc.prepare(`INSERT OR IGNORE INTO vector_rowids(id) VALUES (?)`).run(externalId)
        const row = dbc.prepare(`SELECT rid FROM vector_rowids WHERE id=?`).get(externalId) as { rid: number } | undefined
        if (!row) throw new Error(`[vector_rowids] insert failed for id=${externalId}`)
        return row.rid
    })
    return tx()
}
export function rowIdToId(rid: number): string | null {
    const dbc = assertDB()
    const r = dbc.prepare(`SELECT id FROM vector_rowids WHERE rid=?`).get(rid) as { id: string } | undefined
    return r?.id ?? null
}

/** L2 normalization. */
export function l2Normalize(src: Float32Array | number[]): Float32Array {
    const v = src instanceof Float32Array ? new Float32Array(src) : new Float32Array(src)
    let s = 0; for (let i=0;i<v.length;i++) s += v[i]*v[i]
    const inv = s > 0 ? 1/Math.sqrt(s) : 1
    for (let i=0;i<v.length;i++) v[i] = v[i]*inv
    return v
}

/** Insert or update a vector. */
export function upsertEmbedding(
    spec: VectorIndexSpec,
    ids: {
        vecId: string
        memId?: string
        assetId?: string
        modality?: 'text'|'image'|'audio'|'video'
        conversationId: string
    },
    vector: Float32Array | number[],
): void {
    const dbc = assertDB()
    const hasMem = ids.memId != null
    const hasAsset = ids.assetId != null
    if (hasMem === hasAsset) throw new Error('[upsertEmbedding] require exactly one of memId or assetId.')
    if (vector.length !== spec.dim) throw new Error(`[upsertEmbedding] dim mismatch: expect ${spec.dim}, got ${vector.length}`)

    const table = ensureVectorIndex(spec)

    // Map to an integer rowid and validate it
    const ridRaw = getOrCreateRowId(ids.vecId)
    const rid = Math.trunc(ridRaw)
    if (!Number.isSafeInteger(rid) || rid <= 0) {
        throw new Error(`[upsertEmbedding] invalid rid=${rid} (from ${ridRaw}) for vecId=${ids.vecId}`)
    }

    // Apply L2 normalization first for cosine distance
    const vecArr = spec.metric === 'cosine'
        ? l2Normalize(vector)
        : (vector instanceof Float32Array ? vector : new Float32Array(vector))

    // Convert to binary (BLOB)
    const vecBuf = Buffer.from(new Uint8Array(vecArr.buffer, vecArr.byteOffset, vecArr.byteLength))
    const tx = dbc.transaction(() => {
        // Virtual table: key fix to ensure rowid is passed in as INTEGER
        dbc.prepare(`INSERT OR REPLACE INTO ${table}(rowid, embedding) VALUES (CAST(? AS INTEGER), ?)`)
            .run(rid, vecBuf)
    })

    tx()
}


/** Utility helpers. */
export function newVectorId(prefix='vec'): string {
    return `${prefix}_${crypto.randomUUID()}`
}

export async function vectorSelfTest(): Promise<void> {
    const dbc = assertDB()
    const spec: VectorIndexSpec = { level: 'mem', model: 'bge-small', dim: 8, metric: 'cosine' }
    const table = ensureVectorIndex(spec)
    const vecId = `selftest_${crypto.randomUUID()}`
    const rid = getOrCreateRowId(vecId)
    const vec = new Float32Array(spec.dim)
    vec[0] = 1
    const vecBuf = Buffer.from(vec.buffer, vec.byteOffset, vec.byteLength)
    dbc.prepare(`INSERT OR REPLACE INTO ${table}(rowid, embedding) VALUES (CAST(? AS INTEGER), ?)`)
        .run(rid, vecBuf)
    const row = dbc.prepare(`SELECT rowid FROM ${table} WHERE embedding MATCH ? LIMIT 1`)
        .get(vecBuf) as { rowid?: number } | undefined
    if (!row?.rowid) {
        throw new Error('[vectorSelfTest] vec0 query failed')
    }
}

// Debug helper for inspecting vector contents when needed
export function debugVector(vecBuf: Buffer, dim: number): number[] {
    const arr = new Float32Array(vecBuf.buffer, vecBuf.byteOffset, dim)
    return Array.from(arr)
}
