import type { Database } from 'better-sqlite3'
import type { SettingsBundle, ToolPermissions } from '../../../../contracts/index'
import {
    getAppSettings,
    listModelOverrides,
    listStrategyOverrides,
    listToolSettings,
    setAppSettingsPatch,
    setToolEnabled,
    setToolPermission,
    upsertModelOverride,
    upsertStrategy,
    upsertStrategyOverride,
} from '../services/settingsStore'
import { listStrategies } from '../../../core/strategy/strategyRegistry'
import { listToolServers, upsertToolServer } from '../../tools/services/toolServers'

function safeJson<T>(raw: string | null | undefined, fallback: T): T {
    if (!raw) return fallback
    try {
        return JSON.parse(raw) as T
    } catch {
        return fallback
    }
}

export function exportSettingsBundle(db: Database): SettingsBundle {
    return {
        version: 1,
        exported_at: Date.now(),
        appSettings: getAppSettings(db),
        modelOverrides: listModelOverrides(db),
        strategies: listStrategies(db),
        strategyOverrides: listStrategyOverrides(db),
        toolSettings: listToolSettings(db),
        toolServers: listToolServers(db),
    }
}

export function importSettingsBundle(db: Database, bundle: SettingsBundle): void {
    if (!bundle) return
    const tx = db.transaction(() => {
        if (bundle.appSettings) {
            setAppSettingsPatch(db, {
                active_model_id: bundle.appSettings.active_model_id ?? null,
                active_strategy_id: bundle.appSettings.active_strategy_id ?? null,
            })
        }

        for (const row of bundle.modelOverrides ?? []) {
            upsertModelOverride(db, {
                model_id: row.model_id,
                enabled: row.enabled,
                params: safeJson<Record<string, unknown>>(row.params_json, {}),
                requirements: safeJson<Record<string, unknown>>(row.requirements_json, {}),
            })
        }

        for (const strategy of bundle.strategies ?? []) {
            const normalized = {
                ...strategy,
                source: strategy.source ?? 'local',
                description: strategy.description ?? '',
                entry_path: strategy.entry_path ?? strategy.id,
                capabilities_json: strategy.capabilities_json ?? '{}',
                default_allowlist_json: strategy.default_allowlist_json ?? '[]',
                manifest_json: strategy.manifest_json ?? '{}',
                enabled: strategy.enabled ?? true,
            }
            upsertStrategy(db, normalized)
        }

        for (const override of bundle.strategyOverrides ?? []) {
            upsertStrategyOverride(db, {
                strategy_id: override.strategy_id,
                enabled: override.enabled,
                params: safeJson<Record<string, unknown>>(override.params_json, {}),
                allowlist: safeJson<string[]>(override.allowlist_json, []),
            })
        }

        for (const setting of bundle.toolSettings ?? []) {
            const permissions = (setting.permissions ?? {}) as ToolPermissions
            setToolPermission(db, setting.tool_key, permissions)
            setToolEnabled(db, setting.tool_key, setting.enabled)
        }

        for (const server of bundle.toolServers ?? []) {
            upsertToolServer(db, server)
        }
    })

    tx()
}
