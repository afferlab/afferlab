import { app } from 'electron'
import path from 'node:path'
import fs from 'node:fs'
import { createRequire } from 'node:module'
import type { Database } from 'better-sqlite3'
import { ensureSchema } from './schema'
import { runMigrations } from './migrations'
import { initializeVectorSupport, scheduleVectorSelfTest } from './vector'

const require = createRequire(import.meta.url)
const BetterSqlite3 = require('better-sqlite3') as typeof import('better-sqlite3')

let db: Database | null = null
let dbClosing = false

function resolveDbPath(): string {
    const override = process.env.LOOMA_DB_PATH?.trim() || process.env.SYNARA_DB_PATH?.trim()
    if (override) return path.resolve(override)
    return path.join(app.getPath('userData'), 'chat.db')
}

export function initDB(): Database {
    if (db) return db
    dbClosing = false
    const resolvedPath = resolveDbPath()
    console.log(`[db] opening ${resolvedPath}`)
    fs.mkdirSync(path.dirname(resolvedPath), { recursive: true })
    const instance = new BetterSqlite3(resolvedPath)

    instance.pragma('journal_mode = WAL')
    instance.pragma('synchronous = NORMAL')
    instance.pragma('temp_store = MEMORY')
    instance.pragma('foreign_keys = ON')
    instance.pragma('busy_timeout = 5000')

    initializeVectorSupport(instance)
    ensureSchema(instance)
    runMigrations(instance)

    db = instance
    console.log(`[db] ready ${resolvedPath}`)

    scheduleVectorSelfTest()

    return instance
}

export function getDB(): Database {
    if (!db) throw new Error('Database not initialized. Call initDB() before using getDB().')
    return db
}

export function isDBOpen(): boolean {
    return Boolean(db) && !dbClosing
}

export function closeDB(): void {
    if (db) {
        dbClosing = true
        db.close()
        db = null
    }
}
