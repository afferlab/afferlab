import type { Database } from 'better-sqlite3'
import { spawn } from 'node:child_process'
import type { ToolDef, ToolExecuteContext, ToolExecuteResult, ToolListContext, ToolProvider } from '../../../../contracts/index'
import type { ToolCall } from '../../../../contracts/tools'

type ToolServerRow = {
    id: string
    name: string
    type: 'stdio' | 'http'
    command: string | null
    url: string | null
    enabled: number
    permissions_json?: string | null
}

type McpTool = {
    name: string
    description?: string
    inputSchema?: unknown
    outputSchema?: unknown
}

type JsonRpcResponse = {
    jsonrpc?: string
    id?: string | number | null
    result?: unknown
    error?: { message?: string }
}

function listEnabledServers(db: Database): ToolServerRow[] {
    return db.prepare(`
        SELECT id, name, type, command, url, enabled, permissions_json
        FROM tool_servers
        WHERE enabled = 1
    `).all() as ToolServerRow[]
}

function parseMcpToolName(name: string): { serverId: string; toolName: string } | null {
    if (!name.startsWith('mcp.')) return null
    const parts = name.split('.')
    if (parts.length < 3) return null
    const serverId = parts[1]
    const toolName = parts.slice(2).join('.')
    return { serverId, toolName }
}

function parseServerPermissions(server: ToolServerRow): { network?: boolean; filesystem?: boolean; shell?: boolean } {
    if (server.permissions_json) {
        try {
            const parsed = JSON.parse(server.permissions_json) as { network?: boolean; filesystem?: boolean; shell?: boolean }
            return parsed ?? {}
        } catch {
            return {}
        }
    }
    if (server.type === 'stdio') return { shell: true }
    return { network: true }
}

function normalizeToolDef(server: ToolServerRow, tool: McpTool): ToolDef {
    return {
        name: `mcp.${server.id}.${tool.name}`,
        description: tool.description ?? `MCP tool ${tool.name} from ${server.name}`,
        inputSchema: tool.inputSchema ?? { type: 'object', properties: {} },
        outputSchema: tool.outputSchema,
        providerId: 'mcp',
        permissions: parseServerPermissions(server),
    }
}

async function requestMcpHttp(
    url: string,
    method: string,
    params: unknown,
    timeoutMs: number,
): Promise<JsonRpcResponse> {
    const controller = new AbortController()
    const timeout = setTimeout(() => controller.abort(), timeoutMs)
    try {
        const payload = { jsonrpc: '2.0', id: String(Date.now()), method, params }
        const res = await fetch(url, {
            method: 'POST',
            headers: { 'content-type': 'application/json' },
            body: JSON.stringify(payload),
            signal: controller.signal,
        })
        const data = (await res.json()) as JsonRpcResponse
        return data
    } finally {
        clearTimeout(timeout)
    }
}

function encodeJsonRpc(id: string, method: string, params: unknown): Buffer {
    const payload = JSON.stringify({ jsonrpc: '2.0', id, method, params })
    const body = Buffer.from(payload, 'utf8')
    const header = Buffer.from(`Content-Length: ${body.length}\r\n\r\n`, 'utf8')
    return Buffer.concat([header, body])
}

async function requestMcpStdio(
    command: string,
    method: string,
    params: unknown,
    timeoutMs: number,
): Promise<JsonRpcResponse> {
    return new Promise((resolve, reject) => {
        const child = spawn(command, { shell: true, stdio: ['pipe', 'pipe', 'pipe'] })
        const id = String(Date.now())
        let buffer = Buffer.alloc(0)
        const onData = (chunk: Buffer) => {
            buffer = Buffer.concat([buffer, chunk])
            for (;;) {
                const headerEnd = buffer.indexOf('\r\n\r\n')
                if (headerEnd < 0) return
                const header = buffer.slice(0, headerEnd).toString('utf8')
                const match = /content-length:\s*(\d+)/i.exec(header)
                if (!match) {
                    buffer = buffer.slice(headerEnd + 4)
                    continue
                }
                const length = Number(match[1])
                const bodyStart = headerEnd + 4
                if (buffer.length < bodyStart + length) return
                const body = buffer.slice(bodyStart, bodyStart + length).toString('utf8')
                buffer = buffer.slice(bodyStart + length)
                try {
                    const msg = JSON.parse(body) as JsonRpcResponse
                    if (String(msg.id) === id) {
                        cleanup()
                        resolve(msg)
                        return
                    }
                } catch {
                    // ignore parse errors
                }
            }
        }
        const onError = (err: Error) => {
            cleanup()
            reject(err)
        }
        const timeout = setTimeout(() => {
            cleanup()
            reject(new Error('mcp stdio timeout'))
        }, timeoutMs)
        const cleanup = () => {
            clearTimeout(timeout)
            child.stdout.off('data', onData)
            child.stderr.off('data', onError)
            child.off('error', onError)
            try {
                child.kill()
            } catch {
                // ignore
            }
        }
        child.stdout.on('data', onData)
        child.stderr.on('data', () => {
            /* ignore stderr */
        })
        child.on('error', onError)
        child.stdin.write(encodeJsonRpc(id, method, params))
    })
}

async function listToolsForServer(server: ToolServerRow): Promise<McpTool[]> {
    if (server.type === 'http' && server.url) {
        const res = await requestMcpHttp(server.url, 'tools/list', {}, 5000)
        const tools = (res.result as { tools?: McpTool[] } | undefined)?.tools
        return Array.isArray(tools) ? tools : []
    }
    if (server.type === 'stdio' && server.command) {
        const res = await requestMcpStdio(server.command, 'tools/list', {}, 5000)
        const tools = (res.result as { tools?: McpTool[] } | undefined)?.tools
        return Array.isArray(tools) ? tools : []
    }
    return []
}

async function callToolOnServer(
    server: ToolServerRow,
    toolName: string,
    args: Record<string, unknown>,
): Promise<ToolExecuteResult> {
    const params = { name: toolName, arguments: args }
    let res: JsonRpcResponse
    if (server.type === 'http' && server.url) {
        res = await requestMcpHttp(server.url, 'tools/call', params, 15000)
    } else if (server.type === 'stdio' && server.command) {
        res = await requestMcpStdio(server.command, 'tools/call', params, 15000)
    } else {
        return { ok: false, resultText: 'Error: MCP server not configured', error: { message: 'MCP server not configured' } }
    }
    if (res.error) {
        const msg = res.error.message ?? 'MCP tool error'
        return { ok: false, resultText: `Error: ${msg}`, error: { message: msg } }
    }
    const result = res.result as { content?: Array<{ type?: string; text?: string }>; text?: string } | undefined
    if (result?.content && Array.isArray(result.content)) {
        const text = result.content.map(part => part.text ?? '').join('\n')
        return { ok: true, resultText: text, raw: result }
    }
    if (typeof result?.text === 'string') {
        return { ok: true, resultText: result.text, raw: result }
    }
    return { ok: true, resultText: JSON.stringify(res.result ?? {}), raw: res.result }
}

export class McpProvider implements ToolProvider {
    id = 'mcp'

    constructor(private db: Database) {}

    async listTools(_ctx: ToolListContext): Promise<ToolDef[]> {
        void _ctx
        const servers = listEnabledServers(this.db)
        const tools: ToolDef[] = []
        for (const server of servers) {
            try {
                const serverTools = await listToolsForServer(server)
                for (const tool of serverTools) {
                    tools.push(normalizeToolDef(server, tool))
                }
            } catch (err) {
                console.warn('[mcp] listTools failed', { serverId: server.id, err })
            }
        }
        return tools
    }

    async execute(_ctx: ToolExecuteContext, call: ToolCall): Promise<ToolExecuteResult> {
        void _ctx
        const parsed = parseMcpToolName(call.name)
        if (!parsed) {
            return { ok: false, resultText: 'Error: invalid MCP tool name', error: { message: 'invalid MCP tool name' } }
        }
        const server = this.db.prepare(`
            SELECT id, name, type, command, url, enabled, permissions_json
            FROM tool_servers WHERE id = ?
        `).get(parsed.serverId) as ToolServerRow | undefined
        if (!server || server.enabled !== 1) {
            return { ok: false, resultText: 'Error: MCP server not enabled', error: { message: 'MCP server not enabled' } }
        }
        const args = call.args && typeof call.args === 'object'
            ? (call.args as Record<string, unknown>)
            : typeof call.args === 'string'
                ? (() => {
                    try { return JSON.parse(call.args) as Record<string, unknown> } catch { return {} }
                })()
                : {}
        return callToolOnServer(server, parsed.toolName, args)
    }
}

export async function testMcpServer(db: Database, serverId: string): Promise<ToolDef[]> {
    const server = db.prepare(`
        SELECT id, name, type, command, url, enabled, permissions_json
        FROM tool_servers WHERE id = ?
    `).get(serverId) as ToolServerRow | undefined
    if (!server) return []
    const tools = await listToolsForServer(server)
    return tools.map(tool => normalizeToolDef(server, tool))
}
