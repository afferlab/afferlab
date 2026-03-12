import { ipcMain } from 'electron'
import { IPC } from '../channels'
import { getDB } from '../../db'
import { listToolServers, upsertToolServer, setToolServerEnabled, deleteToolServer } from '../../engine/tools/services/toolServers'
import { testMcpServer } from '../../core/tools/mcp/McpProvider'
import { ensureDefaultToolSettings, getToolSettings, setToolEnabled, setToolPermission } from '../../engine/settings/services/settingsStore'
import { createToolRegistry } from '../../core/tools'

export function registerToolsIPC() {
    ipcMain.handle(IPC.TOOL_LIST_SERVERS, () => {
        const db = getDB()
        return listToolServers(db)
    })

    ipcMain.handle(IPC.TOOL_UPSERT_SERVER, (_e, args) => {
        const db = getDB()
        if (!args?.name || !args?.type) throw new Error('invalid tool server')
        return upsertToolServer(db, {
            id: args.id,
            name: args.name,
            type: args.type,
            command: args.command,
            url: args.url,
            enabled: Boolean(args.enabled),
            permissions: args.permissions,
        })
    })

    ipcMain.handle(IPC.TOOL_SET_SERVER_ENABLED, (_e, args: { id: string; enabled: boolean }) => {
        if (!args?.id) throw new Error('server id missing')
        const db = getDB()
        setToolServerEnabled(db, args.id, args.enabled)
        return { ok: true }
    })

    ipcMain.handle(IPC.TOOL_DELETE_SERVER, (_e, args: { id: string }) => {
        if (!args?.id) throw new Error('server id missing')
        const db = getDB()
        deleteToolServer(db, args.id)
        return { ok: true }
    })

    ipcMain.handle(IPC.TOOL_TEST_SERVER, async (_e, args: { id: string }) => {
        if (!args?.id) throw new Error('server id missing')
        const db = getDB()
        try {
            const tools = await testMcpServer(db, args.id)
            return { ok: true, tools }
        } catch (err) {
            const msg = err instanceof Error ? err.message : String(err)
            return { ok: false, error: msg }
        }
    })

    ipcMain.handle(IPC.TOOL_GET_SETTINGS, () => {
        const db = getDB()
        ensureDefaultToolSettings(db)
        return getToolSettings(db)
    })

    ipcMain.handle(IPC.TOOL_SET_BUILTIN_ENABLED, (_e, args: { name: string; enabled: boolean }) => {
        if (!args?.name) throw new Error('tool name missing')
        const db = getDB()
        ensureDefaultToolSettings(db)
        setToolEnabled(db, args.name, args.enabled)
        return { ok: true }
    })

    ipcMain.handle(IPC.TOOL_SET_PERMISSION, (_e, args: { toolKey: string; permissions: Record<string, boolean> }) => {
        if (!args?.toolKey) throw new Error('tool key missing')
        const db = getDB()
        const updated = setToolPermission(db, args.toolKey, args.permissions)
        return updated
    })

    ipcMain.handle(IPC.TOOL_LIST_BUILTINS, () => {
        const db = getDB()
        const registry = createToolRegistry(db)
        return registry.listStaticTools().filter(tool => tool.providerId === 'builtin')
    })

    ipcMain.handle(IPC.TOOL_UPDATE_SETTINGS, (_e, args) => {
        const db = getDB()
        const next = args as Array<{ tool_key: string; enabled: boolean; permissions: Record<string, boolean> }>
        if (Array.isArray(next)) {
            for (const entry of next) {
                setToolEnabled(db, entry.tool_key, entry.enabled)
                setToolPermission(db, entry.tool_key, entry.permissions)
            }
        }
        return { ok: true }
    })
}
