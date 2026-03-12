import type { LLMModelConfig } from './llm'
import type { ModelStatus } from './models'
import type { ToolPermissions } from './tools'
import type { WebSearchSettings } from './webSearch'

export type AppSettings = {
    id: 'singleton'
    active_model_id?: string | null
    active_strategy_id?: string | null
    last_used_model_id?: string | null
    theme_mode?: string | null
    launch_behavior?: string | null
    auto_scroll?: number | null
    model_default_params?: string | null
    strategy_prefs_json?: string | null
    web_search_settings?: string | null
    created_at: number
    updated_at: number
}

export type AppSettingsPatch = Partial<Omit<AppSettings, 'id' | 'created_at' | 'updated_at' | 'web_search_settings'>> & {
    web_search_settings?: string | Partial<WebSearchSettings>
}

export type MaxTokensTier =
    | 'max'
    | 4096
    | 8192
    | 16384
    | 32768
    | 65536
    | 131072
    | 262144

export type ModelDefaultParams = {
    temperature: number
    top_p: number
    maxTokensTier: MaxTokensTier
}

export type ModelOverrideRecord = {
    model_id: string
    enabled: boolean
    params_json: string
    requirements_json: string
    created_at: number
    updated_at: number
}

export type StrategyManifest = {
    allowlist?: string[]
    permissions?: ToolPermissions
    paramsSchema?: unknown
    dev?: {
        sourcePath?: string
        metaVersion?: string
        lastTest?: {
            status?: 'passed' | 'failed'
            at?: number
            diagnostics?: Array<{
                kind: 'compile' | 'smoke' | 'runtime'
                message: string
                stack?: string
                file?: string
                line?: number
                column?: number
                frame?: string
            }>
        }
    }
}

export type StrategyRecord = {
    id: string
    key: string
    source: string
    name: string
    description: string
    entry_path: string
    version: string
    hash: string
    capabilities_json: string
    default_allowlist_json: string
    manifest_json?: string | null
    enabled?: boolean
    created_at: number
    updated_at: number
}

export type StrategyOverrideRecord = {
    strategy_id: string
    enabled: boolean
    params_json: string
    allowlist_json: string
    created_at: number
    updated_at: number
}

export type ToolSetting = {
    tool_key: string
    enabled: boolean
    permissions: ToolPermissions
}

export type EffectiveModel = {
    model: LLMModelConfig
    status: ModelStatus
}

export type EffectiveStrategy = {
    id: string
    key: string
    name: string
    version: string
    hash: string
    manifest: StrategyManifest
    enabled: boolean
}

export type SettingsSnapshot = {
    appSettings: AppSettings
    modelOverrides: ModelOverrideRecord[]
    strategies: StrategyRecord[]
    strategyOverrides: StrategyOverrideRecord[]
    toolSettings: ToolSetting[]
    toolServers: import('./tools').ToolServerConfig[]
    effectiveStrategies?: EffectiveStrategy[]
}

export type SettingsBundle = SettingsSnapshot & {
    version: number
    exported_at: number
}
