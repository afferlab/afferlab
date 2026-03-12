import type { Database } from 'better-sqlite3'
import fs from 'node:fs'
import path from 'node:path'
import { app } from 'electron'
import type {
    AppSettings,
    ModelDefaultParams,
    MaxTokensTier,
    ModelOverrideRecord,
    StrategyOverrideRecord,
    StrategyPrefs,
    StrategyPrefsInput,
    StrategyRecord,
    ToolPermissions,
    ToolSetting,
    WebSearchSettings,
} from '../../../../contracts/index'
import { DEFAULT_STRATEGY_ID } from '../../../core/strategy/strategyScope'

const APP_SETTINGS_ID = 'singleton'
const DEFAULT_MODEL_DEFAULT_PARAMS: ModelDefaultParams = {
    temperature: 0.7,
    top_p: 1,
    maxTokensTier: 'max',
}

const DEFAULT_WEB_SEARCH_SETTINGS: WebSearchSettings = {
    enabled: true,
    provider: 'bing_browser',
    limit: 5,
}

const DEFAULT_THEME_MODE = 'system'
const DEFAULT_LAUNCH_BEHAVIOR = 'open_last'
const DEFAULT_AUTO_SCROLL = 1

const DEFAULT_STRATEGY_PREFS: StrategyPrefs = {
    enabledIds: [],
    defaultId: DEFAULT_STRATEGY_ID,
}

const MAX_TOKEN_TIERS: MaxTokensTier[] = [
    4096,
    8192,
    16384,
    32768,
    65536,
    131072,
    262144,
    'max',
]

type LegacyModelSettings = {
    providers?: Record<string, { apiKey?: string; baseUrl?: string }>
    modelOverrides?: Record<string, { enabled?: boolean; defaultsOverride?: Record<string, unknown>; endpointOverride?: string; providerOverride?: string }>
    defaults?: { chatModelId?: string; embeddingModelId?: string }
}

type LegacyToolSettings = {
    builtin?: Record<string, { enabled: boolean }>
    permissions?: ToolPermissions
}

function nowMs() {
    return Date.now()
}

function getLegacyPath(filename: string): string {
    try {
        if (app?.isReady?.()) {
            return path.join(app.getPath('userData'), filename)
        }
    } catch {
        // ignore
    }
    return path.join(process.cwd(), filename)
}

function readLegacyJson<T>(filename: string): T | null {
    const file = getLegacyPath(filename)
    if (!fs.existsSync(file)) return null
    try {
        const raw = fs.readFileSync(file, 'utf-8')
        return JSON.parse(raw) as T
    } catch {
        return null
    }
}

function renameLegacyFile(filename: string): void {
    const file = getLegacyPath(filename)
    if (!fs.existsSync(file)) return
    const next = `${file}.migrated`
    try {
        fs.renameSync(file, next)
    } catch {
        // ignore migration rename failures
    }
}

function pruneUndefined<T>(value: T): T {
    if (Array.isArray(value)) {
        return value
            .map((item) => pruneUndefined(item))
            .filter((item) => item !== undefined) as unknown as T
    }
    if (value && typeof value === 'object') {
        const out: Record<string, unknown> = {}
        for (const [key, val] of Object.entries(value as Record<string, unknown>)) {
            if (val === undefined) continue
            const next = pruneUndefined(val)
            if (next === undefined) continue
            out[key] = next
        }
        return out as T
    }
    return value
}

export function getAppSettings(db: Database): AppSettings {
    const row = db.prepare(`
        SELECT id, active_model_id, active_strategy_id, last_used_model_id, theme_mode, launch_behavior, auto_scroll, model_default_params, strategy_prefs_json, web_search_settings, created_at, updated_at
        FROM app_settings
        WHERE id = ?
    `).get(APP_SETTINGS_ID) as AppSettings | undefined

    if (row) return row
    const created = nowMs()
    db.prepare(`
        INSERT INTO app_settings (id, active_model_id, active_strategy_id, last_used_model_id, theme_mode, launch_behavior, auto_scroll, model_default_params, strategy_prefs_json, web_search_settings, created_at, updated_at)
        VALUES (?, NULL, ?, NULL, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
        APP_SETTINGS_ID,
        DEFAULT_STRATEGY_ID,
        DEFAULT_THEME_MODE,
        DEFAULT_LAUNCH_BEHAVIOR,
        DEFAULT_AUTO_SCROLL,
        JSON.stringify(DEFAULT_MODEL_DEFAULT_PARAMS),
        JSON.stringify(DEFAULT_STRATEGY_PREFS),
        JSON.stringify(DEFAULT_WEB_SEARCH_SETTINGS),
        created,
        created
    )
    return {
        id: APP_SETTINGS_ID,
        active_model_id: null,
        active_strategy_id: DEFAULT_STRATEGY_ID,
        last_used_model_id: null,
        theme_mode: DEFAULT_THEME_MODE,
        launch_behavior: DEFAULT_LAUNCH_BEHAVIOR,
        auto_scroll: DEFAULT_AUTO_SCROLL,
        model_default_params: JSON.stringify(DEFAULT_MODEL_DEFAULT_PARAMS),
        strategy_prefs_json: JSON.stringify(DEFAULT_STRATEGY_PREFS),
        web_search_settings: JSON.stringify(DEFAULT_WEB_SEARCH_SETTINGS),
        created_at: created,
        updated_at: created,
    }
}

export function setAppSettingsPatch(db: Database, patch: Partial<AppSettings>): AppSettings {
    const current = getAppSettings(db)
    const cleanPatch = pruneUndefined(patch) as Partial<AppSettings>
    if (Object.keys(cleanPatch).length === 0) return current

    const patchJson = JSON.stringify(cleanPatch)
    db.prepare(`
        WITH merged(app) AS (
            SELECT json_patch(
                json_object(
                    'active_model_id', active_model_id,
                    'active_strategy_id', active_strategy_id,
                    'last_used_model_id', last_used_model_id,
                    'theme_mode', theme_mode,
                    'launch_behavior', launch_behavior,
                    'auto_scroll', auto_scroll,
                    'model_default_params', model_default_params,
                    'strategy_prefs_json', strategy_prefs_json,
                    'web_search_settings', web_search_settings
                ),
                json(?)
            )
            FROM app_settings
            WHERE id = '${APP_SETTINGS_ID}'
        )
        UPDATE app_settings
        SET
            active_model_id = json_extract((SELECT app FROM merged), '$.active_model_id'),
            active_strategy_id = json_extract((SELECT app FROM merged), '$.active_strategy_id'),
            last_used_model_id = json_extract((SELECT app FROM merged), '$.last_used_model_id'),
            theme_mode = json_extract((SELECT app FROM merged), '$.theme_mode'),
            launch_behavior = json_extract((SELECT app FROM merged), '$.launch_behavior'),
            auto_scroll = json_extract((SELECT app FROM merged), '$.auto_scroll'),
            model_default_params = json_extract((SELECT app FROM merged), '$.model_default_params'),
            strategy_prefs_json = json_extract((SELECT app FROM merged), '$.strategy_prefs_json'),
            web_search_settings = json_extract((SELECT app FROM merged), '$.web_search_settings'),
            updated_at = CAST(strftime('%s','now') AS INTEGER) * 1000
        WHERE id = '${APP_SETTINGS_ID}';
    `).run(patchJson)

    return getAppSettings(db)
}

export function getModelDefaultParams(db: Database): ModelDefaultParams {
    getAppSettings(db)
    const row = db.prepare(`
        SELECT model_default_params
        FROM app_settings
        WHERE id = ?
    `).get(APP_SETTINGS_ID) as { model_default_params?: string | null } | undefined
    if (!row?.model_default_params) return DEFAULT_MODEL_DEFAULT_PARAMS
    return normalizeModelDefaultParams(row.model_default_params)
}

export function setModelDefaultParams(db: Database, patch: Partial<ModelDefaultParams>): ModelDefaultParams {
    const current = getModelDefaultParams(db)
    const merged = { ...current, ...patch }
    const normalized = normalizeModelDefaultParams(merged)
    const now = nowMs()
    db.prepare(`
        UPDATE app_settings
        SET model_default_params = ?, updated_at = ?
        WHERE id = ?
    `).run(JSON.stringify(normalized), now, APP_SETTINGS_ID)
    return normalized
}

export function getWebSearchSettings(db: Database): WebSearchSettings {
    getAppSettings(db)
    const row = db.prepare(`
        SELECT web_search_settings
        FROM app_settings
        WHERE id = ?
    `).get(APP_SETTINGS_ID) as { web_search_settings?: string | null } | undefined
    if (!row?.web_search_settings) return DEFAULT_WEB_SEARCH_SETTINGS
    return normalizeWebSearchSettings(row.web_search_settings)
}

export function setWebSearchSettings(db: Database, patch: Partial<WebSearchSettings>): WebSearchSettings {
    const current = getWebSearchSettings(db)
    const merged = { ...current, ...patch }
    const normalized = normalizeWebSearchSettings(merged)
    const now = nowMs()
    db.prepare(`
        UPDATE app_settings
        SET web_search_settings = ?, updated_at = ?
        WHERE id = ?
    `).run(JSON.stringify(normalized), now, APP_SETTINGS_ID)
    return normalized
}

function normalizeStrategyPrefs(
    db: Database,
    input: StrategyPrefsInput | null | undefined,
    fallbackDefaultId?: string | null,
): StrategyPrefs {
    const allIds = listStrategies(db).map((strategy) => strategy.id)
    const unique = (ids: string[]) => Array.from(new Set(ids))
    const enabledIds = unique(
        Array.isArray(input?.enabledIds) ? input.enabledIds.filter((id) => allIds.includes(id)) : []
    )
    const finalEnabled = enabledIds.length > 0 ? enabledIds : (allIds.length > 0 ? allIds : [DEFAULT_STRATEGY_ID])

    const candidates = [
        input?.defaultId,
        fallbackDefaultId ?? undefined,
        DEFAULT_STRATEGY_ID,
        finalEnabled[0],
    ].filter((id): id is string => Boolean(id))
    const defaultId = candidates.find((id) => finalEnabled.includes(id)) ?? finalEnabled[0] ?? DEFAULT_STRATEGY_ID

    return { enabledIds: finalEnabled, defaultId }
}

export function getStrategyPrefs(db: Database): StrategyPrefs {
    const appSettings = getAppSettings(db)
    const raw = appSettings.strategy_prefs_json ?? '{}'
    let parsed: StrategyPrefsInput | null = null
    try {
        parsed = JSON.parse(raw) as StrategyPrefsInput
    } catch {
        parsed = null
    }
    return normalizeStrategyPrefs(db, parsed, appSettings.active_strategy_id ?? null)
}

export function setStrategyPrefs(db: Database, input: StrategyPrefsInput): StrategyPrefs {
    const current = getStrategyPrefs(db)
    const merged: StrategyPrefsInput = {
        enabledIds: input.enabledIds ?? current.enabledIds,
        defaultId: input.defaultId ?? current.defaultId,
    }
    const normalized = normalizeStrategyPrefs(db, merged, current.defaultId)
    setAppSettingsPatch(db, {
        active_strategy_id: normalized.defaultId,
        strategy_prefs_json: JSON.stringify(normalized),
    })
    return normalized
}

function normalizeModelDefaultParams(raw: unknown): ModelDefaultParams {
    let data: Partial<ModelDefaultParams> = {}
    if (typeof raw === 'string') {
        try {
            data = JSON.parse(raw) as Partial<ModelDefaultParams>
        } catch {
            data = {}
        }
    } else if (raw && typeof raw === 'object') {
        data = raw as Partial<ModelDefaultParams>
    }
    const temperature = clampNumber(data.temperature, 0, 1, DEFAULT_MODEL_DEFAULT_PARAMS.temperature)
    const top_p = clampNumber(data.top_p, 0.1, 1, DEFAULT_MODEL_DEFAULT_PARAMS.top_p)
    const maxTokensTier = isValidTier(data.maxTokensTier) ? data.maxTokensTier : DEFAULT_MODEL_DEFAULT_PARAMS.maxTokensTier
    return { temperature, top_p, maxTokensTier }
}

function normalizeWebSearchSettings(raw: unknown): WebSearchSettings {
    let data: Partial<WebSearchSettings> = {}
    if (typeof raw === 'string') {
        try {
            data = JSON.parse(raw) as Partial<WebSearchSettings>
        } catch {
            data = {}
        }
    } else if (typeof raw === 'object' && raw) {
        data = raw as Partial<WebSearchSettings>
    }
    const enabled = typeof data.enabled === 'boolean' ? data.enabled : DEFAULT_WEB_SEARCH_SETTINGS.enabled
    let provider = data.provider === 'bing_browser' || data.provider === 'ddg_html' || data.provider === 'auto'
        ? data.provider
        : DEFAULT_WEB_SEARCH_SETTINGS.provider
    if (provider === 'auto') provider = 'bing_browser'
    const limitRaw = typeof data.limit === 'number' ? data.limit : DEFAULT_WEB_SEARCH_SETTINGS.limit
    const limit = Math.min(20, Math.max(1, Math.round(limitRaw)))
    return { enabled, provider, limit }
}

function clampNumber(value: unknown, min: number, max: number, fallback: number): number {
    if (typeof value !== 'number' || Number.isNaN(value)) return fallback
    return Math.min(max, Math.max(min, value))
}

function isValidTier(value: unknown): value is MaxTokensTier {
    return MAX_TOKEN_TIERS.includes(value as MaxTokensTier)
}

export function listModelOverrides(db: Database): ModelOverrideRecord[] {
    return db.prepare(`
        SELECT model_id, enabled, params_json, requirements_json, created_at, updated_at
        FROM model_overrides
    `).all() as ModelOverrideRecord[]
}

export function upsertModelOverride(db: Database, input: {
    model_id: string
    enabled?: boolean
    params?: Record<string, unknown>
    requirements?: Record<string, unknown>
}): ModelOverrideRecord {
    const existing = db.prepare(`SELECT model_id, enabled, params_json, requirements_json FROM model_overrides WHERE model_id = ?`)
        .get(input.model_id) as { model_id?: string; enabled?: number; params_json?: string; requirements_json?: string } | undefined
    const now = nowMs()
    const paramsJson = input.params !== undefined
        ? JSON.stringify(input.params ?? {})
        : (existing?.params_json ?? '{}')
    // TODO: requirements_json may include secrets; migrate to keychain-backed storage.
    const requirementsJson = input.requirements !== undefined
        ? JSON.stringify(input.requirements ?? {})
        : (existing?.requirements_json ?? '{}')
    const enabled = input.enabled ?? (existing?.enabled != null ? existing.enabled === 1 : true)
    if (existing?.model_id) {
        db.prepare(`
            UPDATE model_overrides
            SET enabled = ?, params_json = ?, requirements_json = ?, updated_at = ?
            WHERE model_id = ?
        `).run(enabled ? 1 : 0, paramsJson, requirementsJson, now, input.model_id)
    } else {
        db.prepare(`
            INSERT INTO model_overrides (model_id, enabled, params_json, requirements_json, created_at, updated_at)
            VALUES (?, ?, ?, ?, ?, ?)
        `).run(input.model_id, enabled ? 1 : 0, paramsJson, requirementsJson, now, now)
    }
    return {
        model_id: input.model_id,
        enabled,
        params_json: paramsJson,
        requirements_json: requirementsJson,
        created_at: now,
        updated_at: now,
    }
}

export function listStrategies(db: Database): StrategyRecord[] {
    const rows = db.prepare(`
        SELECT id, key, source, name, description, entry_path, version, hash,
               capabilities_json, default_allowlist_json, manifest_json, enabled,
               created_at, updated_at
        FROM strategies
        ORDER BY created_at DESC
    `).all() as Array<StrategyRecord & { enabled?: number }>
    return rows.map((row) => ({
        ...row,
        enabled: row.enabled == null ? undefined : row.enabled === 1,
    }))
}

export function upsertStrategy(db: Database, input: StrategyRecord): StrategyRecord {
    const existing = db.prepare(`SELECT id FROM strategies WHERE id = ?`)
        .get(input.id) as { id?: string } | undefined
    if (existing?.id) {
        db.prepare(`
            UPDATE strategies
            SET key = ?, source = ?, name = ?, description = ?, entry_path = ?, version = ?,
                hash = ?, capabilities_json = ?, default_allowlist_json = ?, manifest_json = ?,
                enabled = ?, updated_at = ?
            WHERE id = ?
        `).run(
            input.key,
            input.source,
            input.name,
            input.description,
            input.entry_path,
            input.version,
            input.hash,
            input.capabilities_json,
            input.default_allowlist_json,
            input.manifest_json ?? '{}',
            input.enabled !== false ? 1 : 0,
            nowMs(),
            input.id
        )
    } else {
        db.prepare(`
            INSERT INTO strategies (
                id, key, source, name, description, entry_path, version, hash,
                capabilities_json, default_allowlist_json, manifest_json, enabled,
                created_at, updated_at
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        `).run(
            input.id,
            input.key,
            input.source,
            input.name,
            input.description,
            input.entry_path,
            input.version,
            input.hash,
            input.capabilities_json,
            input.default_allowlist_json,
            input.manifest_json ?? '{}',
            input.enabled !== false ? 1 : 0,
            input.created_at,
            input.updated_at,
        )
    }
    return input
}

export function listStrategyOverrides(db: Database): StrategyOverrideRecord[] {
    const rows = db.prepare(`
        SELECT strategy_id, enabled, params_json, allowlist_json, created_at, updated_at
        FROM strategy_overrides
    `).all() as Array<Omit<StrategyOverrideRecord, 'enabled'> & { enabled?: number }>
    return rows.map(row => ({
        ...row,
        enabled: row.enabled === 1,
    }))
}

export function getStrategyOverrideParams(db: Database, strategyId: string): Record<string, unknown> {
    const row = db.prepare(`
        SELECT params_json
        FROM strategy_overrides
        WHERE strategy_id = ?
    `).get(strategyId) as { params_json?: string } | undefined
    const parsed = safeJson<unknown>(row?.params_json, {})
    return (parsed && typeof parsed === 'object' && !Array.isArray(parsed))
        ? parsed as Record<string, unknown>
        : {}
}

export function setStrategyOverrideParams(
    db: Database,
    args: { strategyId: string; params: Record<string, unknown> },
): Record<string, unknown> {
    const existing = db.prepare(`
        SELECT enabled, allowlist_json
        FROM strategy_overrides
        WHERE strategy_id = ?
    `).get(args.strategyId) as { enabled?: number; allowlist_json?: string } | undefined
    const allowlist = safeJson<unknown>(existing?.allowlist_json, [])
    upsertStrategyOverride(db, {
        strategy_id: args.strategyId,
        enabled: existing?.enabled != null ? existing.enabled === 1 : true,
        allowlist: Array.isArray(allowlist)
            ? allowlist.filter((item): item is string => typeof item === 'string')
            : [],
        params: args.params,
    })
    return getStrategyOverrideParams(db, args.strategyId)
}

export function upsertStrategyOverride(db: Database, input: {
    strategy_id: string
    enabled?: boolean
    params?: Record<string, unknown>
    allowlist?: string[]
}): StrategyOverrideRecord {
    const existing = db.prepare(`SELECT strategy_id FROM strategy_overrides WHERE strategy_id = ?`)
        .get(input.strategy_id) as { strategy_id?: string } | undefined
    const now = nowMs()
    const enabled = input.enabled ?? true
    const paramsJson = JSON.stringify(input.params ?? {})
    const allowlistJson = JSON.stringify(input.allowlist ?? [])
    if (existing?.strategy_id) {
        db.prepare(`
            UPDATE strategy_overrides
            SET enabled = ?, params_json = ?, allowlist_json = ?, updated_at = ?
            WHERE strategy_id = ?
        `).run(enabled ? 1 : 0, paramsJson, allowlistJson, now, input.strategy_id)
    } else {
        db.prepare(`
            INSERT INTO strategy_overrides (strategy_id, enabled, params_json, allowlist_json, created_at, updated_at)
            VALUES (?, ?, ?, ?, ?, ?)
        `).run(input.strategy_id, enabled ? 1 : 0, paramsJson, allowlistJson, now, now)
    }
    return {
        strategy_id: input.strategy_id,
        enabled,
        params_json: paramsJson,
        allowlist_json: allowlistJson,
        created_at: now,
        updated_at: now,
    }
}

export function listToolSettings(db: Database): ToolSetting[] {
    const rows = db.prepare(`
        SELECT tool_key, enabled, permissions_json
        FROM tool_settings
    `).all() as Array<{ tool_key: string; enabled: number; permissions_json: string }>
    return rows.map((row) => ({
        tool_key: row.tool_key,
        enabled: row.enabled === 1,
        permissions: safeJson<ToolPermissions>(row.permissions_json, {}),
    })) as ToolSetting[]
}

export function getToolSettings(db: Database): ToolSetting[] {
    return listToolSettings(db)
}

export function setToolEnabled(db: Database, toolKey: string, enabled: boolean): ToolSetting {
    const now = nowMs()
    const existing = db.prepare(`SELECT tool_key FROM tool_settings WHERE tool_key = ?`)
        .get(toolKey) as { tool_key?: string } | undefined
    if (existing?.tool_key) {
        db.prepare(`
            UPDATE tool_settings
            SET enabled = ?, updated_at = ?
            WHERE tool_key = ?
        `).run(enabled ? 1 : 0, now, toolKey)
    } else {
        db.prepare(`
            INSERT INTO tool_settings (tool_key, enabled, permissions_json, created_at, updated_at)
            VALUES (?, ?, ?, ?, ?)
        `).run(toolKey, enabled ? 1 : 0, '{}', now, now)
    }
    const row = db.prepare(`SELECT permissions_json FROM tool_settings WHERE tool_key = ?`)
        .get(toolKey) as { permissions_json?: string } | undefined
    return {
        tool_key: toolKey,
        enabled,
        permissions: safeJson<ToolPermissions>(row?.permissions_json ?? '{}', {}),
    }
}

export function setToolPermission(db: Database, toolKey: string, permissions: ToolPermissions): ToolSetting {
    const now = nowMs()
    const existing = db.prepare(`SELECT tool_key FROM tool_settings WHERE tool_key = ?`)
        .get(toolKey) as { tool_key?: string } | undefined
    const payload = JSON.stringify(permissions ?? {})
    if (existing?.tool_key) {
        db.prepare(`
            UPDATE tool_settings
            SET permissions_json = ?, updated_at = ?
            WHERE tool_key = ?
        `).run(payload, now, toolKey)
    } else {
        db.prepare(`
            INSERT INTO tool_settings (tool_key, enabled, permissions_json, created_at, updated_at)
            VALUES (?, 1, ?, ?, ?)
        `).run(toolKey, payload, now, now)
    }
    const row = db.prepare(`SELECT enabled FROM tool_settings WHERE tool_key = ?`)
        .get(toolKey) as { enabled?: number } | undefined
    return { tool_key: toolKey, enabled: row?.enabled === 1, permissions: permissions ?? {} }
}

export function ensureDefaultToolSettings(db: Database): void {
    const existing = db.prepare(`SELECT COUNT(1) as cnt FROM tool_settings`)
        .get() as { cnt?: number } | undefined
    const now = nowMs()
    const insert = db.prepare(`
        INSERT INTO tool_settings (tool_key, enabled, permissions_json, created_at, updated_at)
        VALUES (?, ?, ?, ?, ?)
    `)
    const defaults: Array<{ tool_key: string; enabled: number; permissions_json: string }> = [
        { tool_key: 'memories.search', enabled: 1, permissions_json: '{}' },
        { tool_key: 'memories.query', enabled: 1, permissions_json: '{}' },
        { tool_key: 'memories.readAsset', enabled: 1, permissions_json: '{}' },
        { tool_key: 'memories.ingest', enabled: 0, permissions_json: '{}' },
        { tool_key: 'memories.retire', enabled: 0, permissions_json: '{}' },
        { tool_key: 'builtin.web_search', enabled: 1, permissions_json: JSON.stringify({ network: true }) },
        { tool_key: 'builtin.web_fetch', enabled: 1, permissions_json: JSON.stringify({ network: true }) },
    ]
    if ((existing?.cnt ?? 0) === 0) {
        const tx = db.transaction(() => {
            for (const row of defaults) {
                insert.run(row.tool_key, row.enabled, row.permissions_json, now, now)
            }
        })
        tx()
        return
    }

    // Backfill builtin.web_search + builtin.web_fetch for existing DBs to ensure availability.
    const backfill = (toolKey: string) => {
        const row = db.prepare(`SELECT enabled, permissions_json FROM tool_settings WHERE tool_key = ?`)
            .get(toolKey) as { enabled?: number; permissions_json?: string } | undefined
        if (!row) {
            insert.run(toolKey, 1, JSON.stringify({ network: true }), now, now)
            return
        }
        if (row.enabled !== 1) {
            db.prepare(`
                UPDATE tool_settings
                SET enabled = 1, permissions_json = ?, updated_at = ?
                WHERE tool_key = ?
            `).run(JSON.stringify({ network: true }), now, toolKey)
        }
    }
    backfill('builtin.web_search')
    backfill('builtin.web_fetch')
}

export function migrateLegacyToolSettings(db: Database): void {
    const legacy = readLegacyJson<LegacyToolSettings>('tool-settings.json')
    if (!legacy) return
    const existing = db.prepare(`SELECT COUNT(1) as cnt FROM tool_settings`)
        .get() as { cnt?: number } | undefined
    if ((existing?.cnt ?? 0) > 0) return

    const now = nowMs()
    const insert = db.prepare(`
        INSERT INTO tool_settings (tool_key, enabled, permissions_json, created_at, updated_at)
        VALUES (?, ?, ?, ?, ?)
    `)
    const tx = db.transaction(() => {
        for (const [toolKey, cfg] of Object.entries(legacy.builtin ?? {})) {
            const enabled = cfg.enabled ? 1 : 0
            const permissions_json = JSON.stringify(legacy.permissions ?? {})
            insert.run(toolKey, enabled, permissions_json, now, now)
        }
    })
    tx()
    renameLegacyFile('tool-settings.json')
}

export function migrateLegacyModelSettings(db: Database): void {
    const legacy = readLegacyJson<LegacyModelSettings>('model-settings.json')
    if (!legacy) return
    const hasOverrides = db.prepare(`SELECT COUNT(1) as cnt FROM model_overrides`)
        .get() as { cnt?: number } | undefined
    if ((hasOverrides?.cnt ?? 0) > 0) return

    const overrides = legacy.modelOverrides ?? {}
    for (const [modelId, override] of Object.entries(overrides)) {
        const requirements: Record<string, unknown> = {}
        if (override.endpointOverride) requirements.baseUrl = override.endpointOverride
        if (override.providerOverride) requirements.providerOverride = override.providerOverride
        void upsertModelOverride(db, {
            model_id: modelId,
            enabled: override.enabled ?? true,
            params: override.defaultsOverride ?? {},
            requirements,
        })
    }

    if (legacy.defaults?.chatModelId) {
        setAppSettingsPatch(db, { active_model_id: legacy.defaults.chatModelId })
    }
    renameLegacyFile('model-settings.json')
}

function safeJson<T>(input: string | null | undefined, fallback: T): T {
    if (typeof input !== 'string') return fallback
    try {
        return JSON.parse(input) as T
    } catch {
        return fallback
    }
}
