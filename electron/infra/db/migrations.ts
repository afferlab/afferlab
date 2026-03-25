import type { Database } from 'better-sqlite3'
import { SCHEMA_SQL, TARGET_SCHEMA_VERSION } from './schema'

export { TARGET_SCHEMA_VERSION }

export function runMigrations(instance: Database, currentVersion: number): void {
    if (currentVersion > TARGET_SCHEMA_VERSION) {
        throw new Error(
            `Database schema version ${currentVersion} is newer than supported version ${TARGET_SCHEMA_VERSION}.`
        )
    }

    if (currentVersion === TARGET_SCHEMA_VERSION) return

    let version = currentVersion

    while (version < TARGET_SCHEMA_VERSION) {
        switch (version) {
            case 0:
                migrateToV1(instance)
                version = 1
                break
            default:
                throw new Error(`No migration path from schema version ${version}.`)
        }
    }

    console.log(`[db] schema version ${currentVersion} -> ${version}`)
}

function migrateToV1(instance: Database): void {
    const tx = instance.transaction(() => {
        instance.exec(SCHEMA_SQL)
        setSchemaVersion(instance, 1)
    })
    tx()
}

function setSchemaVersion(instance: Database, version: number): void {
    const updatedAt = Date.now()

    instance
        .prepare(`
            INSERT INTO schema_version (id, version, updated_at)
            VALUES (1, ?, ?)
            ON CONFLICT(id) DO UPDATE SET
                version = excluded.version,
                updated_at = excluded.updated_at
        `)
        .run(version, updatedAt)

    instance.pragma(`user_version = ${version}`)
}
