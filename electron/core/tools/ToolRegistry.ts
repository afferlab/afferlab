import type { ToolDef, ToolExecuteContext, ToolExecuteResult, ToolListContext, ToolProvider } from '../../../contracts/index'
import type { ToolCall } from '../../../contracts/tools'

type ToolHandler = (ctx: ToolExecuteContext, call: ToolCall) => Promise<ToolExecuteResult>

export class ToolRegistry {
    private toolDefs = new Map<string, ToolDef>()
    private toolHandlers = new Map<string, ToolHandler>()
    private providers = new Map<string, ToolProvider>()
    private dynamicTools = new Map<string, ToolDef>()

    constructor() {}

    registerTool(tool: ToolDef, handler?: ToolHandler): void {
        this.toolDefs.set(tool.name, tool)
        if (handler) this.toolHandlers.set(tool.name, handler)
    }

    registerProvider(provider: ToolProvider): void {
        this.providers.set(provider.id, provider)
    }

    async listTools(ctx: ToolListContext): Promise<ToolDef[]> {
        const out: ToolDef[] = []
        for (const tool of this.toolDefs.values()) out.push(tool)
        this.dynamicTools.clear()
        for (const provider of this.providers.values()) {
            try {
                const tools = await provider.listTools(ctx)
                for (const tool of tools) {
                    this.dynamicTools.set(tool.name, tool)
                    out.push(tool)
                }
            } catch (err) {
                console.warn('[tools] provider list failed', { providerId: provider.id, err })
            }
        }
        return out
    }

    listStaticTools(): ToolDef[] {
        return Array.from(this.toolDefs.values())
    }

    async executeToolCall(ctx: ToolExecuteContext, call: ToolCall): Promise<ToolExecuteResult> {
        const fromStatic = this.toolDefs.get(call.name)
        if (fromStatic) {
            const handler = this.toolHandlers.get(call.name)
            if (!handler) {
                return { ok: false, resultText: 'Error: tool handler missing', error: { message: 'tool handler missing' } }
            }
            return handler(ctx, call)
        }

        let def = this.dynamicTools.get(call.name)
        if (!def) {
            await this.listTools({ conversationId: ctx.conversationId, turnId: ctx.turnId })
            def = this.dynamicTools.get(call.name)
        }
        if (!def) {
            return { ok: false, resultText: 'Error: tool not found', error: { message: 'tool not found' } }
        }
        const provider = this.providers.get(def.providerId)
        if (!provider) {
            return { ok: false, resultText: 'Error: tool provider missing', error: { message: 'tool provider missing' } }
        }
        return provider.execute(ctx, call)
    }
}
