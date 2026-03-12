import type { Database } from 'better-sqlite3'
import type {
    EffectiveModel,
    EffectiveStrategy,
    StrategyManifest,
    ToolDef,
    ToolPermissions,
} from '../../../../contracts/index'
import { loadRepoModels, resolveModelConfig } from '../../../core/models/modelRegistry'
import { createToolRegistry } from '../../../core/tools'
import { DEFAULT_STRATEGY_ID } from '../../../core/strategy/strategyScope'
import { listStrategies } from '../../../core/strategy/strategyRegistry'
import {
    ensureDefaultToolSettings,
    getAppSettings,
    getStrategyPrefs,
    getWebSearchSettings,
    listModelOverrides,
    listStrategyOverrides,
    listToolSettings,
    migrateLegacyModelSettings,
    migrateLegacyToolSettings,
} from './settingsStore'

function safeJson<T>(raw: string | null | undefined, fallback: T): T {
    if (!raw) return fallback
    try {
        return JSON.parse(raw) as T
    } catch {
        return fallback
    }
}

function extractProviderConfig(req: Record<string, unknown>): { apiKey?: string; baseUrl?: string; providerOverride?: string } {
    const apiKey = typeof req.apiKey === 'string' ? req.apiKey : undefined
    const baseUrl = typeof req.baseUrl === 'string' ? req.baseUrl : undefined
    const providerOverride = typeof req.providerOverride === 'string' ? req.providerOverride : undefined
    return { apiKey, baseUrl, providerOverride }
}

export function getEffectiveModels(db: Database): EffectiveModel[] {
    migrateLegacyModelSettings(db)
    getAppSettings(db)
    const baseModels = loadRepoModels()
    return baseModels.map((base) => {
        const resolved = resolveModelConfig({ modelId: base.id })
        return { model: resolved.model, status: resolved.availability }
    })
}

export function getProviderConfigForModel(db: Database, modelId: string): { apiKey?: string; baseUrl?: string } {
    const override = listModelOverrides(db).find(row => row.model_id === modelId)
    if (!override) return {}
    const req = safeJson<Record<string, unknown>>(override.requirements_json, {})
    const cfg = extractProviderConfig(req)
    return { apiKey: cfg.apiKey, baseUrl: cfg.baseUrl }
}

export function getEffectiveStrategies(db: Database): EffectiveStrategy[] {
    const prefs = getStrategyPrefs(db)
    const byId = new Map<string, EffectiveStrategy>()
    const rows = listStrategies(db)
    for (const row of rows) {
        const legacyManifest = safeJson<StrategyManifest>(row.manifest_json ?? '{}', {})
        const legacyAllowlist = Array.isArray(legacyManifest.allowlist) ? legacyManifest.allowlist : []
        const defaultAllowlist = safeJson<string[]>(row.default_allowlist_json ?? '[]', [])
        const allowlist = defaultAllowlist.length > 0 ? defaultAllowlist : legacyAllowlist
        const manifest: StrategyManifest = {
            ...legacyManifest,
            allowlist,
        }
        byId.set(row.id, {
            id: row.id,
            key: row.key,
            name: row.name,
            version: row.version,
            hash: row.hash,
            manifest,
            enabled: row.enabled !== false,
        })
    }

    const overrides = listStrategyOverrides(db)
    for (const override of overrides) {
        const target = byId.get(override.strategy_id)
        if (!target) continue
        const allowlist = safeJson<string[]>(override.allowlist_json, [])
        const manifest: StrategyManifest = {
            ...target.manifest,
            allowlist,
        }
        byId.set(override.strategy_id, {
            ...target,
            enabled: override.enabled !== false,
            manifest,
        })
    }

    const enabledSet = new Set(prefs.enabledIds)
    return Array.from(byId.values()).map((entry) => ({
        ...entry,
        enabled: entry.enabled && enabledSet.has(entry.id),
    }))
}

function allowByPermissions(required: ToolPermissions | undefined, granted: ToolPermissions | undefined): boolean {
    if (!required) return true
    const perms: Array<keyof ToolPermissions> = ['network', 'filesystem', 'shell']
    for (const key of perms) {
        if (!required[key]) continue
        if (!granted?.[key]) return false
    }
    return true
}

function allowByAllowlist(toolName: string, allowlist?: string[]): boolean {
    if (!allowlist) return true
    if (allowlist.length === 0) {
        return toolName === 'builtin.web_search' || toolName === 'builtin.web_fetch'
    }
    if (toolName === 'builtin.web_fetch' && allowlist.includes('builtin.web_search')) {
        return true
    }
    return allowlist.some(rule => {
        if (rule.endsWith('*')) return toolName.startsWith(rule.slice(0, -1))
        return toolName === rule
    })
}

function parseServerKey(toolName: string): string | null {
    if (!toolName.startsWith('mcp.')) return null
    const parts = toolName.split('.')
    if (parts.length < 3) return null
    return `mcp.server.${parts[1]}`
}

export async function getEffectiveToolsForRun(
    db: Database,
    args: { conversationId: string; strategyId?: string },
): Promise<ToolDef[]> {
    migrateLegacyToolSettings(db)
    ensureDefaultToolSettings(db)
    const webSearch = getWebSearchSettings(db)
    console.log('[tools]', { web_search_settings: webSearch })

    const strategyId = args.strategyId ?? DEFAULT_STRATEGY_ID
    const strategies = getEffectiveStrategies(db)
    const strategy =
        strategies.find(s => s.id === strategyId && s.enabled)
        ?? strategies.find(s => s.enabled)
        ?? strategies[0]
    const allowlist = strategy?.manifest?.allowlist ?? []

    const toolSettings = listToolSettings(db)
    const toolSettingsMap = new Map(toolSettings.map(s => [s.tool_key, s]))

    const registry = createToolRegistry(db)
    const tools = await registry.listTools({ conversationId: args.conversationId })

    const filtered = tools.filter(tool => {
        if ((tool.name === 'builtin.web_search' || tool.name === 'builtin.web_fetch') && !webSearch.enabled) {
            console.log('[tools]', { skip: tool.name, reason: 'web_search disabled' })
            return false
        }
        let setting = toolSettingsMap.get(tool.name)
        if (!setting) {
            const serverKey = parseServerKey(tool.name)
            if (serverKey) {
                setting = toolSettingsMap.get(serverKey)
            }
        }

        let enabled: boolean
        if (setting) {
            enabled = setting.enabled
        } else if (tool.providerId === 'builtin' && tool.name.startsWith('memories.')) {
            enabled = true
        } else if (tool.providerId === 'builtin' && tool.name === 'builtin.web_search') {
            enabled = false
        } else {
            enabled = true
        }

        if (!enabled) {
            console.log('[tools]', { skip: tool.name, reason: 'tool_settings disabled' })
            return false
        }
        if (!allowByAllowlist(tool.name, allowlist)) return false

        const granted = setting?.permissions ?? tool.permissions
        if (!allowByPermissions(tool.permissions, granted)) return false
        return true
    })
    const hasWebSearch = filtered.some(tool => tool.name === 'builtin.web_search')
    console.log('[tools]', { web_search: hasWebSearch ? 'enabled' : 'disabled' })
    return filtered
}
