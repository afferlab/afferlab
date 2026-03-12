import type { Database } from 'better-sqlite3'
import { v4 as uuidv4 } from 'uuid'
import type { ToolPermissions, ToolServerConfig } from '../../../../contracts/index'

type ToolServerRow = {
    id: string
    name: string
    type: 'stdio' | 'http'
    command: string | null
    url: string | null
    permissions_json: string | null
    enabled: number
    created_at: number
    updated_at: number
}

function parsePermissions(raw: string | null): ToolPermissions | undefined {
    if (!raw) return undefined
    try {
        return JSON.parse(raw) as ToolPermissions
    } catch {
        return undefined
    }
}

function toConfig(row: ToolServerRow): ToolServerConfig {
    const permissions = parsePermissions(row.permissions_json)
        ?? (row.type === 'stdio' ? { shell: true } : { network: true })
    return {
        id: row.id,
        name: row.name,
        type: row.type,
        command: row.command,
        url: row.url,
        enabled: row.enabled === 1,
        permissions,
    }
}

export function listToolServers(db: Database): ToolServerConfig[] {
    const rows = db.prepare(`
        SELECT id, name, type, command, url, permissions_json, enabled, created_at, updated_at
        FROM tool_servers
        ORDER BY created_at DESC
    `).all() as ToolServerRow[]
    return rows.map(toConfig)
}

export function upsertToolServer(
    db: Database,
    input: Omit<ToolServerConfig, 'id'> & { id?: string },
): ToolServerConfig {
    const now = Date.now()
    const id = input.id ?? uuidv4()
    const resolvedPermissions = input.permissions
        ?? (input.type === 'stdio' ? { shell: true } : { network: true })
    const permissions_json = resolvedPermissions ? JSON.stringify(resolvedPermissions) : null
    const enabled = input.enabled ? 1 : 0
    const existing = db.prepare(`SELECT id FROM tool_servers WHERE id = ?`).get(id) as { id?: string } | undefined
    if (existing?.id) {
        db.prepare(`
            UPDATE tool_servers
            SET name = ?, type = ?, command = ?, url = ?, permissions_json = ?, enabled = ?, updated_at = ?
            WHERE id = ?
        `).run(input.name, input.type, input.command ?? null, input.url ?? null, permissions_json, enabled, now, id)
    } else {
        db.prepare(`
            INSERT INTO tool_servers (
                id, name, type, command, url, permissions_json, enabled, created_at, updated_at
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
        `).run(id, input.name, input.type, input.command ?? null, input.url ?? null, permissions_json, enabled, now, now)
    }
    return {
        id,
        name: input.name,
        type: input.type,
        command: input.command,
        url: input.url,
        enabled: input.enabled,
        permissions: resolvedPermissions,
    }
}

export function setToolServerEnabled(db: Database, id: string, enabled: boolean): void {
    db.prepare(`
        UPDATE tool_servers
        SET enabled = ?, updated_at = ?
        WHERE id = ?
    `).run(enabled ? 1 : 0, Date.now(), id)
}

export function deleteToolServer(db: Database, id: string): void {
    db.prepare(`DELETE FROM tool_servers WHERE id = ?`).run(id)
}
