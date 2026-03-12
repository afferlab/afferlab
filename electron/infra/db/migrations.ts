import type { Database } from 'better-sqlite3'
import { TARGET_SCHEMA_VERSION } from './schema'

export { TARGET_SCHEMA_VERSION }

export function runMigrations(instance: Database): void {
    const current = getUserVersion(instance)
    if (current === TARGET_SCHEMA_VERSION) return

    const tx = instance.transaction(() => {
        setUserVersion(instance, TARGET_SCHEMA_VERSION)
    })
    tx()

    console.log(`[db] schema version ${current} -> ${TARGET_SCHEMA_VERSION}`)
}

function getUserVersion(instance: Database): number {
    return instance.pragma('user_version', { simple: true }) as number
}

function setUserVersion(instance: Database, version: number): void {
    instance.pragma(`user_version = ${version}`)
}
