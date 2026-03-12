import type { ToolDef, ToolPermissions, ToolServerConfig, ToolServerTestResult } from '../tools'
import type { ToolSetting } from '../settings'

declare global {
    interface Window {
        toolAPI: {
            listToolServers: () => Promise<ToolServerConfig[]>
            upsertToolServer: (payload: Partial<ToolServerConfig> & { name: string; type: 'stdio' | 'http' }) => Promise<ToolServerConfig>
            setToolServerEnabled: (id: string, enabled: boolean) => Promise<{ ok: true }>
            deleteToolServer: (id: string) => Promise<{ ok: true }>
            testToolServer: (id: string) => Promise<ToolServerTestResult>
            getToolSettings: () => Promise<ToolSetting[]>
            setToolEnabled: (toolKey: string, enabled: boolean) => Promise<{ ok: true }>
            setToolPermission: (toolKey: string, permissions: ToolPermissions) => Promise<ToolSetting>
            listBuiltinTools: (conversationId?: string) => Promise<ToolDef[]>
        }
    }
}

export {}
