import { IPC } from '../ipc/channels'
import type { ToolDef, ToolServerConfig, ToolServerTestResult, ToolPermissions, ToolSetting } from '../../contracts/index'
import { safeInvoke } from './ipcHelpers'

export function createToolAPI() {
    return {
        listToolServers: () => safeInvoke<ToolServerConfig[]>(IPC.TOOL_LIST_SERVERS),
        upsertToolServer: (payload: Partial<ToolServerConfig> & { name: string; type: 'stdio' | 'http' }) =>
            safeInvoke<ToolServerConfig>(IPC.TOOL_UPSERT_SERVER, payload),
        setToolServerEnabled: (id: string, enabled: boolean) =>
            safeInvoke<{ ok: true }>(IPC.TOOL_SET_SERVER_ENABLED, { id, enabled }),
        deleteToolServer: (id: string) =>
            safeInvoke<{ ok: true }>(IPC.TOOL_DELETE_SERVER, { id }),
        testToolServer: (id: string) =>
            safeInvoke<ToolServerTestResult>(IPC.TOOL_TEST_SERVER, { id }),
        getToolSettings: () =>
            safeInvoke<ToolSetting[]>(IPC.TOOL_GET_SETTINGS),
        setToolEnabled: (toolKey: string, enabled: boolean) =>
            safeInvoke<{ ok: true }>(IPC.TOOL_SET_BUILTIN_ENABLED, { name: toolKey, enabled }),
        setToolPermission: (toolKey: string, permissions: ToolPermissions) =>
            safeInvoke<ToolSetting>(IPC.TOOL_SET_PERMISSION, { toolKey, permissions }),
        listBuiltinTools: (conversationId?: string) =>
            safeInvoke<ToolDef[]>(IPC.TOOL_LIST_BUILTINS, { conversationId }),
    }
}
