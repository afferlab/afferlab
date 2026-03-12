import { ipcMain } from 'electron'
import type { ToolPermissions, ModelDefaultParams } from '../../../contracts/index'
import { IPC } from '../channels'
import {
    checkProvider,
    exportSettings,
    addSettingsProviderModel,
    deleteSettingsProviderModel,
    getModelDefaultSettings,
    getProvidersConfig,
    getSettingsSnapshot,
    importSettings,
    listAvailableModels,
    refreshSettingsProviderModels,
    resetProviderHost,
    resetProviderModelOverride,
    setModelDefaultSettings,
    setProviderConfig,
    setProviderModelOverride,
    setSettingsToolEnabled,
    setSettingsToolPermission,
    testProviderModel,
    updateSettingsProviderModel,
    updateAppSettings,
    upsertSettingsModelOverride,
    upsertSettingsStrategyOverride,
} from '../../engine/settings/application/settingsService'

export function registerSettingsIPC() {
    ipcMain.handle(IPC.SETTINGS_GET, () => getSettingsSnapshot())

    ipcMain.handle(IPC.SETTINGS_UPDATE_APP, (_e, patch) => updateAppSettings(patch))

    ipcMain.handle(IPC.SETTINGS_GET_MODEL_DEFAULT_PARAMS, () => getModelDefaultSettings())

    ipcMain.handle(IPC.SETTINGS_SET_MODEL_DEFAULT_PARAMS, (_e, patch: Partial<ModelDefaultParams>) => (
        setModelDefaultSettings(patch)
    ))

    ipcMain.handle(IPC.SETTINGS_UPSERT_MODEL_OVERRIDE, (_e, input: {
        modelId: string
        enabled?: boolean
        params?: Record<string, unknown>
        requirements?: Record<string, unknown>
    }) => upsertSettingsModelOverride(input))

    ipcMain.handle(IPC.SETTINGS_UPSERT_STRATEGY_OVERRIDE, (_e, input: {
        strategyId: string
        enabled?: boolean
        params?: Record<string, unknown>
        allowlist?: string[]
    }) => upsertSettingsStrategyOverride(input))

    ipcMain.handle(IPC.SETTINGS_SET_TOOL_ENABLED, (_e, args: { toolKey: string; enabled: boolean }) => (
        setSettingsToolEnabled(args)
    ))

    ipcMain.handle(IPC.SETTINGS_SET_TOOL_PERMISSION, (_e, args: { toolKey: string; permissions: ToolPermissions }) => (
        setSettingsToolPermission(args)
    ))

    ipcMain.handle(IPC.SETTINGS_EXPORT, () => exportSettings())

    ipcMain.handle(IPC.SETTINGS_IMPORT, (_e, bundle) => importSettings(bundle))

    ipcMain.handle(IPC.SETTINGS_GET_PROVIDERS_CONFIG, () => getProvidersConfig())

    ipcMain.handle(IPC.SETTINGS_SET_PROVIDER_CONFIG, (_e, args: {
        providerId: string
        patch: { enabled?: boolean; apiKey?: string; apiHost?: string }
    }) => setProviderConfig(args))

    ipcMain.handle(IPC.SETTINGS_LIST_MODELS, () => listAvailableModels())

    ipcMain.handle(IPC.SETTINGS_ADD_PROVIDER_MODEL, (_e, input: {
        providerId: string
        modelId: string
        modelName?: string
    }) => addSettingsProviderModel(input))

    ipcMain.handle(IPC.SETTINGS_UPDATE_PROVIDER_MODEL, (_e, input: {
        providerId: string
        modelId: string
        nextModelId: string
        modelName?: string
    }) => updateSettingsProviderModel(input))

    ipcMain.handle(IPC.SETTINGS_DELETE_PROVIDER_MODEL, (_e, input: {
        providerId: string
        modelId: string
    }) => deleteSettingsProviderModel(input))

    ipcMain.handle(IPC.SETTINGS_SET_MODEL_OVERRIDE, (_e, args: {
        providerId: string
        modelId: string
        override: { temperature?: number; maxTokens?: number; top_p?: number; stop?: string[] }
    }) => setProviderModelOverride(args))

    ipcMain.handle(IPC.SETTINGS_RESET_MODEL_OVERRIDE, (_e, args: { providerId: string; modelId: string }) => (
        resetProviderModelOverride(args)
    ))

    ipcMain.handle(IPC.SETTINGS_RESET_API_HOST, (_e, args: { providerId: string }) => resetProviderHost(args))

    ipcMain.handle(IPC.SETTINGS_REFRESH_PROVIDER_MODELS, (_e, args: { providerId: string }) => (
        refreshSettingsProviderModels(args)
    ))

    ipcMain.handle(IPC.SETTINGS_CHECK_PROVIDER, (_e, args: { providerId: string }) => checkProvider(args))

    ipcMain.handle(IPC.SETTINGS_TEST_PROVIDER_MODEL, (_e, args: { providerId: string; modelId: string }) => (
        testProviderModel(args)
    ))
}
