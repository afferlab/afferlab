export type ToolPermissions = {
    network?: boolean
    filesystem?: boolean
    shell?: boolean
}

export type ToolDef = {
    name: string
    description: string
    inputSchema: unknown
    outputSchema?: unknown
    permissions?: ToolPermissions
    providerId: string
}

export type ToolCall = {
    id?: string
    name: string
    args?: unknown
}

export type ToolExecuteContext = {
    conversationId: string
    turnId?: string
}

export type ToolExecuteResult = {
    ok: boolean
    resultText: string
    raw?: unknown
    error?: { message?: string }
}

export type ToolListContext = {
    conversationId: string
    turnId?: string
}

export type ToolProvider = {
    id: string
    listTools: (ctx: ToolListContext) => Promise<ToolDef[]>
    execute: (ctx: ToolExecuteContext, call: ToolCall) => Promise<ToolExecuteResult>
}

export type ToolServerConfig = {
    id: string
    name: string
    type: 'stdio' | 'http'
    command?: string | null
    url?: string | null
    enabled: boolean
    permissions?: ToolPermissions
}

export type ToolSettings = {
    builtin: Record<string, { enabled: boolean }>
    permissions: ToolPermissions
}

export type ToolServerTestResult = {
    ok: boolean
    tools?: ToolDef[]
    error?: string
}
