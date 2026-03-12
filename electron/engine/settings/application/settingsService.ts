import { BrowserWindow } from 'electron'
import type { ModelDefaultParams, SettingsBundle, ToolPermissions, UIMessage } from '../types'
import { getDB } from '../../../db'
import {
    ensureDefaultToolSettings,
    getAppSettings,
    getModelDefaultParams,
    getWebSearchSettings,
    listModelOverrides,
    listStrategyOverrides,
    listToolSettings,
    migrateLegacyModelSettings,
    migrateLegacyToolSettings,
    setAppSettingsPatch,
    setModelDefaultParams,
    setToolEnabled,
    setToolPermission,
    upsertModelOverride,
    upsertStrategyOverride,
} from '../services/settingsStore'
import { getEffectiveStrategies } from '../services/effectiveConfig'
import { listStrategies } from '../../../core/strategy/strategyRegistry'
import { listToolServers } from '../../tools/services/toolServers'
import { exportSettingsBundle, importSettingsBundle } from '../importExport/importExport'
import { callLLMUniversalNonStream, hasProvider } from '../../../llm'
import {
    addPersistedProviderModel,
    deletePersistedProviderModel,
    getCustomModelIds,
    loadRepoModels,
    reloadModels,
    resolveModelConfig,
    refreshProviderModels as refreshRemoteProviderModels,
    updatePersistedProviderModel,
} from '../../../core/models/modelRegistry'
import { hasLogStateChanged, log } from '../../../core/logging/runtimeLogger'
import {
    loadProviderSettings,
    updateProviderSettings,
    resetProviderApiHost,
    refreshProviderModels,
} from '../../../config/providerSettings'

const MODELS_UPDATED_CHANNEL = 'models-updated'

function safeJson<T>(raw: string | null | undefined, fallback: T): T {
    if (!raw) return fallback
    try {
        return JSON.parse(raw) as T
    } catch {
        return fallback
    }
}

function normalizeWebSearchPatch(input: unknown) {
    if (!input || typeof input !== 'object') return undefined
    const raw = input as Record<string, unknown>
    const enabled = typeof raw.enabled === 'boolean' ? raw.enabled : undefined
    const provider = typeof raw.provider === 'string' ? raw.provider : undefined
    const limitRaw = typeof raw.limit === 'number' ? raw.limit : undefined
    const limit = typeof limitRaw === 'number' ? Math.min(20, Math.max(1, Math.round(limitRaw))) : undefined
    const normalized = {
        ...(enabled !== undefined ? { enabled } : {}),
        ...(provider ? { provider } : {}),
        ...(limit !== undefined ? { limit } : {}),
    }
    return Object.keys(normalized).length ? normalized : undefined
}

export function getSettingsSnapshot() {
    const db = getDB()
    migrateLegacyModelSettings(db)
    migrateLegacyToolSettings(db)
    ensureDefaultToolSettings(db)
    const webSearch = getWebSearchSettings(db)
    const settingsGetData = { web_search_settings: webSearch }
    if (process.env.DEBUG_SETTINGS === '1' || hasLogStateChanged('settings:get:web_search', settingsGetData)) {
        log('info', '[SETTINGS][get]', settingsGetData)
    }
    return {
        appSettings: getAppSettings(db),
        modelOverrides: listModelOverrides(db),
        strategies: listStrategies(db),
        strategyOverrides: listStrategyOverrides(db),
        toolSettings: listToolSettings(db),
        toolServers: listToolServers(db),
        effectiveStrategies: getEffectiveStrategies(db),
    }
}

export function updateAppSettings(patch: unknown) {
    if (!patch || typeof patch !== 'object') throw new Error('patch must be object')
    const nextPatch = { ...(patch as Record<string, unknown>) }
    if ('web_search_settings' in nextPatch) {
        const normalized = normalizeWebSearchPatch(nextPatch.web_search_settings)
        if (normalized) {
            nextPatch.web_search_settings = normalized
        } else {
            delete nextPatch.web_search_settings
        }
    }
    if ('theme_mode' in nextPatch) {
        const theme = nextPatch.theme_mode
        if (theme === 'system' || theme === 'light' || theme === 'dark') {
            nextPatch.theme_mode = theme
        } else {
            delete nextPatch.theme_mode
        }
    }
    if ('launch_behavior' in nextPatch) {
        const launch = nextPatch.launch_behavior
        if (launch === 'open_last' || launch === 'show_home') {
            nextPatch.launch_behavior = launch
        } else {
            delete nextPatch.launch_behavior
        }
    }
    if ('auto_scroll' in nextPatch) {
        const autoScroll = nextPatch.auto_scroll
        if (typeof autoScroll === 'boolean') {
            nextPatch.auto_scroll = autoScroll ? 1 : 0
        } else if (typeof autoScroll === 'number') {
            nextPatch.auto_scroll = autoScroll ? 1 : 0
        } else {
            delete nextPatch.auto_scroll
        }
    }

    const db = getDB()
    log('info', '[SETTINGS][update]', { patch: nextPatch })
    const updated = setAppSettingsPatch(db, nextPatch)
    const persisted = getAppSettings(db)
    const webSearch = getWebSearchSettings(db)
    log('info', '[SETTINGS][update]', { persisted, web_search_settings: webSearch })
    return updated
}

export function getModelDefaultSettings() {
    return getModelDefaultParams(getDB())
}

export function setModelDefaultSettings(patch: Partial<ModelDefaultParams>) {
    return setModelDefaultParams(getDB(), patch)
}

export function upsertSettingsModelOverride(input: {
    modelId: string
    enabled?: boolean
    params?: Record<string, unknown>
    requirements?: Record<string, unknown>
}) {
    if (!input?.modelId) throw new Error('modelId missing')
    const db = getDB()
    const updated = upsertModelOverride(db, {
        model_id: input.modelId,
        enabled: input.enabled,
        params: input.params,
        requirements: input.requirements,
    })
    broadcastModelsUpdated()
    return updated
}

export function upsertSettingsStrategyOverride(input: {
    strategyId: string
    enabled?: boolean
    params?: Record<string, unknown>
    allowlist?: string[]
}) {
    if (!input?.strategyId) throw new Error('strategyId missing')
    return upsertStrategyOverride(getDB(), {
        strategy_id: input.strategyId,
        enabled: input.enabled,
        params: input.params ?? {},
        allowlist: input.allowlist ?? [],
    })
}

export function setSettingsToolEnabled(args: { toolKey: string; enabled: boolean }) {
    if (!args?.toolKey) throw new Error('toolKey missing')
    return setToolEnabled(getDB(), args.toolKey, args.enabled)
}

export function setSettingsToolPermission(args: { toolKey: string; permissions: ToolPermissions }) {
    if (!args?.toolKey) throw new Error('toolKey missing')
    return setToolPermission(getDB(), args.toolKey, args.permissions ?? {})
}

export function exportSettings() {
    return exportSettingsBundle(getDB())
}

export function importSettings(bundle: SettingsBundle) {
    importSettingsBundle(getDB(), bundle)
    return { ok: true as const }
}

export function getProvidersConfig() {
    return loadProviderSettings()
}

export function setProviderConfig(args: {
    providerId: string
    patch: { enabled?: boolean; apiKey?: string; apiHost?: string }
}) {
    if (!args?.providerId) throw new Error('providerId missing')
    const updated = updateProviderSettings(args.providerId, args.patch ?? {})
    broadcastModelsUpdated()
    return updated
}

export function listAvailableModels() {
    const customIds = getCustomModelIds()
    const models = loadRepoModels()
    return sortModelsForSettingsList(models, customIds)
}

export function addSettingsProviderModel(args: {
    providerId: string
    modelId: string
    modelName?: string
}) {
    if (!args?.providerId) throw new Error('providerId missing')
    if (!args?.modelId?.trim()) throw new Error('modelId missing')
    if (!hasProvider(args.providerId)) {
        throw new Error(`provider not registered: ${args.providerId}`)
    }
    const models = addPersistedProviderModel({
        providerId: args.providerId,
        modelId: args.modelId,
        modelName: args.modelName,
    })
    broadcastModelsUpdated()
    return sortModelsForSettingsList(models, getCustomModelIds())
}

export function updateSettingsProviderModel(args: {
    providerId: string
    modelId: string
    nextModelId: string
    modelName?: string
}) {
    const models = updatePersistedProviderModel(args)
    broadcastModelsUpdated()
    return sortModelsForSettingsList(models, getCustomModelIds())
}

export function deleteSettingsProviderModel(args: {
    providerId: string
    modelId: string
}) {
    const models = deletePersistedProviderModel(args)
    broadcastModelsUpdated()
    return sortModelsForSettingsList(models, getCustomModelIds())
}

export function setProviderModelOverride(args: {
    providerId: string
    modelId: string
    override: { temperature?: number; maxTokens?: number; top_p?: number; stop?: string[] }
}) {
    if (!args?.providerId) throw new Error('providerId missing')
    if (!args?.modelId) throw new Error('modelId missing')
    const db = getDB()
    const row = listModelOverrides(db).find((record) => record.model_id === args.modelId)
    const current = safeJson<Record<string, unknown>>(row?.params_json, {})
    const next: Record<string, unknown> = { ...current, ...(args.override ?? {}) }
    for (const key of Object.keys(next)) {
        if (next[key] === undefined) delete next[key]
    }
    upsertModelOverride(db, {
        model_id: args.modelId,
        params: next,
    })
    return loadProviderSettings()
}

export function resetProviderModelOverride(args: { providerId: string; modelId: string }) {
    if (!args?.providerId) throw new Error('providerId missing')
    if (!args?.modelId) throw new Error('modelId missing')
    upsertModelOverride(getDB(), {
        model_id: args.modelId,
        params: {},
    })
    return loadProviderSettings()
}

export function resetProviderHost(args: { providerId: string }) {
    if (!args?.providerId) throw new Error('providerId missing')
    const updated = resetProviderApiHost(args.providerId)
    broadcastModelsUpdated()
    return updated
}

export async function refreshSettingsProviderModels(args: { providerId: string }) {
    if (!args?.providerId) throw new Error('providerId missing')
    const isDynamicProvider = args.providerId === 'ollama' || args.providerId === 'lmstudio'
    if (isDynamicProvider) {
        await refreshRemoteProviderModels()
        const customIds = getCustomModelIds()
        const models = sortModelsForSettingsList(
            loadRepoModels().filter((model) => model.provider === args.providerId),
            customIds,
        )
        broadcastModelsUpdated()
        return models
    }
    const models = refreshProviderModels(args.providerId)
    reloadModels()
    broadcastModelsUpdated()
    return models
}

function sortModelsForSettingsList<T extends { id: string; provider: string }>(
    models: T[],
    customIds: Set<string>,
): T[] {
    const byProvider = new Map<string, T[]>()
    for (const model of models) {
        const list = byProvider.get(model.provider) ?? []
        list.push(model)
        byProvider.set(model.provider, list)
    }
    const out: T[] = []
    for (const model of models) {
        const bucket = byProvider.get(model.provider)
        if (!bucket) continue
        const custom = bucket.filter((item) => customIds.has(item.id))
        const standard = bucket.filter((item) => !customIds.has(item.id))
        out.push(...custom, ...standard)
        byProvider.delete(model.provider)
    }
    return out
}

export async function checkProvider(args: { providerId: string }) {
    if (!args?.providerId) throw new Error('providerId missing')
    if (!hasProvider(args.providerId)) {
        return { ok: false, error: `provider not registered: ${args.providerId}` }
    }
    const models = loadRepoModels().filter((model) => model.provider === args.providerId)
    const model = models[0]
    if (!model) return { ok: false, error: 'no model found for provider' }

    const history: UIMessage[] = [
        {
            id: 'ping',
            conversation_id: 'settings',
            role: 'user',
            type: 'text',
            content: 'ping',
            timestamp: Date.now(),
        },
    ]
    try {
        const resolved = resolveModelConfig({ modelId: model.id })
        await callLLMUniversalNonStream(resolved, history)
        return { ok: true }
    } catch (err) {
        const msg = err instanceof Error ? err.message : String(err)
        return { ok: false, error: msg }
    }
}

export async function testProviderModel(args: { providerId: string; modelId: string }) {
    if (!args?.providerId) throw new Error('providerId missing')
    if (!args?.modelId) throw new Error('modelId missing')
    if (!hasProvider(args.providerId)) {
        return { ok: false, error: `provider not registered: ${args.providerId}` }
    }

    const providerCfg = loadProviderSettings()[args.providerId]
    const isLocalProvider = args.providerId === 'ollama' || args.providerId === 'lmstudio'
    if (!isLocalProvider && !providerCfg?.apiKey) {
        return { ok: false, error: 'missing api key' }
    }

    await refreshRemoteProviderModels()
    const model = loadRepoModels().find((entry) => entry.id === args.modelId)
    if (!model) return { ok: false, error: 'model not found' }
    if (model.provider !== args.providerId) {
        return { ok: false, error: 'model/provider mismatch' }
    }

    const history: UIMessage[] = [
        {
            id: 'ping',
            conversation_id: 'settings',
            role: 'user',
            type: 'text',
            content: 'ping',
            timestamp: Date.now(),
        },
    ]

    const params = {
        ...(model.params ?? model.defaults ?? {}),
        temperature: 0,
        maxTokens: 1,
    }
    const testModel = resolveModelConfig({
        modelId: model.id,
        runtimeOverrides: { params },
    })
    const startedAt = Date.now()
    const timeoutMs = 8000
    let timeoutId: NodeJS.Timeout | null = null
    let timedOut = false
    const timeout = new Promise<never>((_, reject) => {
        timeoutId = setTimeout(() => {
            timedOut = true
            reject(new Error('timeout'))
        }, timeoutMs)
    })

    try {
        await Promise.race([
            callLLMUniversalNonStream(testModel, history),
            timeout,
        ])
        return { ok: true, latencyMs: Date.now() - startedAt }
    } catch (err) {
        const msg = timedOut ? 'timeout' : (err instanceof Error ? err.message : String(err))
        return { ok: false, error: msg, latencyMs: Date.now() - startedAt }
    } finally {
        if (timeoutId) clearTimeout(timeoutId)
    }
}

function broadcastModelsUpdated() {
    for (const win of BrowserWindow.getAllWindows()) {
        if (win.isDestroyed()) continue
        win.webContents.send(MODELS_UPDATED_CHANNEL, { at: Date.now() })
    }
}
