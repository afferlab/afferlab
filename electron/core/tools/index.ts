import type { Database } from 'better-sqlite3'
import { ToolRegistry } from './ToolRegistry'
import { registerBuiltinTools } from './builtinTools'
import { McpProvider } from './mcp/McpProvider'

export function createToolRegistry(db: Database): ToolRegistry {
    const registry = new ToolRegistry()
    registerBuiltinTools(registry, db)
    registry.registerProvider(new McpProvider(db))
    return registry
}

export { ToolRegistry } from './ToolRegistry'
