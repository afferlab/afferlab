import { ipcMain } from 'electron'
import { IPC } from '../channels'
import {
    getProviderConfigForModel,
    listModelsWithStatus,
    loadLocalSettings,
    reloadModels,
    refreshProviderModels,
} from '../../core/models/modelRegistry'
import { loadRepoModels } from '../../core/models/modelRegistry'
import { getEffectiveModels } from '../../engine/settings/services/effectiveConfig'
import { setAppSettingsPatch, upsertModelOverride } from '../../engine/settings/services/settingsStore'
import type { LLMModelConfig, ModelOverride, ProviderConfig } from '../../../contracts/index'
import { getDB } from '../../db'

export function registerModelsIPC() {
    ipcMain.handle(IPC.GET_MODELS, async () => {
        const db = getDB()
        await refreshProviderModels()
        const models = getEffectiveModels(db).map(({ model }) => model)
        return models.map((m) => ({ ...m, name: m.name ?? m.label })) as LLMModelConfig[]
    })

    ipcMain.handle(IPC.GET_MODELS_WITH_STATUS, async () => {
        await refreshProviderModels()
        return listModelsWithStatus()
    })

    ipcMain.handle(IPC.GET_MODEL_SETTINGS, (_e, { includeSecrets } = {}) => {
        const settings = loadLocalSettings()
        if (includeSecrets) return settings
        return { ...settings, providers: {} as Record<string, ProviderConfig> }
    })

    ipcMain.handle(IPC.UPDATE_PROVIDER_CONFIG, (_e, args: { provider: string; patch: ProviderConfig }) => {
        if (!args?.provider) throw new Error('provider missing')
        const db = getDB()
        const models = loadRepoModels().filter(m => m.provider === args.provider)
        for (const model of models) {
            const current = getProviderConfigForModel(model.id)
            const requirements: Record<string, unknown> = { ...current }
            if (args.patch.apiKey !== undefined) requirements.apiKey = args.patch.apiKey
            if (args.patch.baseUrl !== undefined) requirements.baseUrl = args.patch.baseUrl
            void upsertModelOverride(db, {
                model_id: model.id,
                requirements,
            })
        }
        return { ok: true }
    })

    ipcMain.handle(IPC.UPDATE_MODEL_OVERRIDE, (_e, args: { modelId: string; patch: ModelOverride }) => {
        if (!args?.modelId) throw new Error('modelId missing')
        const requirements: Record<string, unknown> = {}
        if (args.patch.endpointOverride !== undefined) requirements.baseUrl = args.patch.endpointOverride
        if (args.patch.providerOverride !== undefined) requirements.providerOverride = args.patch.providerOverride
        const db = getDB()
        void upsertModelOverride(db, {
            model_id: args.modelId,
            enabled: args.patch.enabled,
            params: args.patch.defaultsOverride,
            requirements: Object.keys(requirements).length ? requirements : undefined,
        })
        return { ok: true }
    })

    ipcMain.handle(IPC.SET_DEFAULT_MODELS, (_e, defaults: { chatModelId?: string; embeddingModelId?: string }) => {
        const db = getDB()
        setAppSettingsPatch(db, { active_model_id: defaults.chatModelId })
        return { ok: true }
    })

    ipcMain.handle(IPC.RELOAD_MODELS, () => {
        if (process.env.NODE_ENV === 'production') return { ok: false }
        reloadModels()
        return { ok: true }
    })
}
