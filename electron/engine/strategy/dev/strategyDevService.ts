import { app, shell } from 'electron'
import crypto from 'node:crypto'
import fs from 'node:fs'
import path from 'node:path'
import {
    compileStrategyFile,
} from './devCompiler'
import { runDevSandboxTest } from './devSandboxManager'
import { getDB } from '../../../db'
import {
    getAppSettings,
    getStrategyPrefs,
    listStrategies,
    setStrategyPrefs,
    upsertStrategy,
} from '../../settings/services/settingsStore'
import { getAvailableModel } from '../../../core/models/modelRegistry'
import { getStrategyOrFallback } from '../../../core/strategy/strategyRegistry'
import { switchConversationStrategy } from '../../../core/strategy/switchStrategy'
import { disposeStrategyWorkers } from '../host/createStrategyHost'
import { emitStrategyDevEvent } from './devEventBus'
import { cloneValidatedConfigSchema } from '../../../core/strategy/configSchema'

import type {
    StrategyConfigSchema,
    StrategyDevCompileRequest,
    StrategyDevCompileResult,
    StrategyDevDiagnostic,
    StrategyDevError,
    StrategyDevOpenChatRequest,
    StrategyDevOpenChatResult,
    StrategyDevOpenSourceFolderRequest,
    StrategyDevOpenSourceFolderResult,
    StrategyDevReloadRequest,
    StrategyDevReloadResult,
    StrategyDevSaveRequest,
    StrategyDevSaveResult,
    StrategyDevSnapshotRequest,
    StrategyDevSnapshotResult,
    StrategyManifest,
    StrategyRecord,
} from '../../../../contracts/index'

function toManifestConfigSchema(schema: unknown): StrategyConfigSchema {
    return cloneValidatedConfigSchema(schema) as unknown as StrategyConfigSchema
}

function toErrorEntry(err: unknown): StrategyDevError {
    if (err instanceof Error) {
        return { message: err.message, stack: err.stack }
    }
    return { message: typeof err === 'string' ? err : JSON.stringify(err) }
}

function toErrorEntries(err: unknown): StrategyDevError[] {
    const maybe = err as { errors?: Array<{ text?: string }> } | undefined
    if (maybe?.errors?.length) {
        return maybe.errors.map((item) => ({
            message: item.text ?? 'unknown error',
        }))
    }
    return [toErrorEntry(err)]
}

function toDiagnostics(kind: StrategyDevDiagnostic['kind'], err: unknown): StrategyDevDiagnostic[] {
    const maybe = err as {
        errors?: Array<{
            text?: string
            location?: { file?: string; line?: number; column?: number; lineText?: string }
        }>
    } | undefined
    if (maybe?.errors?.length) {
        return maybe.errors.map((item) => ({
            kind,
            message: item.text ?? 'unknown error',
            file: item.location?.file,
            line: item.location?.line,
            column: item.location?.column,
            frame: item.location?.lineText,
        }))
    }
    const base = toErrorEntry(err)
    return [{
        kind,
        message: base.message,
        stack: base.stack,
    }]
}

function errorResult(err: unknown, kind: StrategyDevDiagnostic['kind'] = 'compile'): StrategyDevCompileResult {
    return { ok: false, errors: toErrorEntries(err), diagnostics: toDiagnostics(kind, err) }
}

function safeJson<T>(raw: string | null | undefined, fallback: T): T {
    if (!raw) return fallback
    try {
        return JSON.parse(raw) as T
    } catch {
        return fallback
    }
}

function normalizeMeta(meta: StrategyDevCompileResult['meta'] | undefined, fallbackName: string) {
    const name = typeof meta?.name === 'string' ? meta.name.trim() : ''
    const description = typeof meta?.description === 'string' ? meta.description.trim() : ''
    if (!name) {
        throw new Error('meta.name is required')
    }
    if (name.length > 80) {
        throw new Error('meta.name must be <= 80 characters')
    }
    if (!description) {
        throw new Error('meta.description is required')
    }
    if (description.length > 240) {
        throw new Error('meta.description must be <= 240 characters')
    }
    return {
        name: name || fallbackName,
        description,
        version: typeof meta?.version === 'string' ? meta.version.trim() : undefined,
    }
}

function writeSnapshotFile(devRoot: string, sourceSnapshot: string | undefined) {
    if (!sourceSnapshot) return
    try {
        const snapshotPath = path.join(devRoot, 'source.ts')
        fs.writeFileSync(snapshotPath, sourceSnapshot, 'utf-8')
    } catch {
        // ignore snapshot write failures
    }
}

export async function compileAndTestStrategy(input: StrategyDevCompileRequest): Promise<StrategyDevCompileResult> {
    try {
        const filePath = input?.filePath
        if (!filePath) return errorResult('filePath required')
        if (!path.isAbsolute(filePath)) return errorResult('filePath must be absolute')
        if (!fs.existsSync(filePath)) return errorResult(`file not found: ${filePath}`)
        if (path.extname(filePath) !== '.ts') {
            return errorResult('only .ts strategy files are supported')
        }

        let bundle
        try {
            bundle = await compileStrategyFile(filePath)
        } catch (err) {
            return errorResult(err, 'compile')
        }
        const result = await runDevSandboxTest(bundle.code)
        const diagnostics = result.ok
            ? []
            : (result.errors ?? []).map((entry) => ({
                kind: 'smoke' as const,
                message: entry.message,
                stack: entry.stack,
            }))
        return {
            ...result,
            diagnostics,
            bundleSize: bundle.bundleSize,
            code: bundle.code,
            hash: bundle.hash,
        }
    } catch (err) {
        return errorResult(err, 'compile')
    }
}

export async function saveStrategyDev(input: StrategyDevSaveRequest): Promise<StrategyDevSaveResult> {
    try {
        const filePath = input?.filePath
        const code = input?.code
        if (!filePath) return { ok: false, error: 'filePath required' }
        if (!code) return { ok: false, error: 'code required' }
        if (!path.isAbsolute(filePath)) return { ok: false, error: 'filePath must be absolute' }
        if (!fs.existsSync(filePath)) return { ok: false, error: `file not found: ${filePath}` }
        let sourceSnapshot: string | undefined
        let sourceError: string | undefined
        try {
            sourceSnapshot = fs.readFileSync(filePath, 'utf-8')
        } catch (err) {
            sourceError = err instanceof Error ? err.message : String(err)
        }
        const db = getDB()
        const devId = `dev:${crypto.createHash('sha256').update(filePath).digest('hex').slice(0, 16)}`
        const devKey = `dev-${devId.split(':')[1]}`
        const devRoot = path.join(app.getPath('userData'), 'strategies', 'dev', devId.split(':')[1])
        fs.mkdirSync(devRoot, { recursive: true })
        const hash = input.hash ?? crypto.createHash('sha256').update(code).digest('hex')
        const shortHash = hash.slice(0, 8)
        const entryPath = path.join(devRoot, `index.${hash}.mjs`)

        fs.writeFileSync(entryPath, code, 'utf-8')

        const meta = normalizeMeta(input.meta, path.basename(filePath, '.ts'))
        const name = meta.name
        const description = meta.description
        const version = shortHash
        const now = Date.now()
        const configSchema = toManifestConfigSchema(input.paramsSchema)
        const manifest: StrategyManifest = {
            paramsSchema: configSchema,
            configSchema: configSchema,
            dev: {
                sourcePath: filePath,
                metaVersion: meta.version,
                lastTest: {
                    status: 'passed',
                    at: now,
                    diagnostics: input.diagnostics ?? [],
                },
            },
        }
        const record: StrategyRecord = {
            id: devId,
            key: devKey,
            source: 'dev',
            name,
            description,
            entry_path: entryPath,
            version,
            hash,
            capabilities_json: '{}',
            default_allowlist_json: '[]',
            manifest_json: JSON.stringify(manifest),
            enabled: true,
            created_at: now,
            updated_at: now,
        }

        upsertStrategy(db, record)

        const metaPath = path.join(devRoot, 'meta.json')
        fs.writeFileSync(
            metaPath,
            JSON.stringify(
                {
                    meta: input.meta ?? {},
                    sourcePath: filePath,
                    hash,
                    savedAt: now,
                },
                null,
                2,
            ),
            'utf-8',
        )
        writeSnapshotFile(devRoot, sourceSnapshot)

        const prefs = getStrategyPrefs(db)
        if (!prefs.enabledIds.includes(devId)) {
            setStrategyPrefs(db, { enabledIds: [...prefs.enabledIds, devId] })
        }

        return { ok: true, strategyId: devId, sourceSnapshot, sourceError }
    } catch (err) {
        return { ok: false, error: err instanceof Error ? err.message : String(err) }
    }
}

export async function reloadStrategyDev(input: StrategyDevReloadRequest): Promise<StrategyDevReloadResult> {
    try {
        const { strategyId, filePath, code } = input
        if (!strategyId) return { ok: false, error: 'strategyId required' }
        if (!filePath) return { ok: false, error: 'filePath required' }
        if (!code) return { ok: false, error: 'code required' }
        let sourceSnapshot: string | undefined
        let sourceError: string | undefined
        try {
            sourceSnapshot = fs.readFileSync(filePath, 'utf-8')
        } catch (err) {
            sourceError = err instanceof Error ? err.message : String(err)
        }
        const db = getDB()
        const existing = listStrategies(db).find((row) => row.id === strategyId)
        if (!existing) return { ok: false, error: 'strategy not found' }
        if (existing.source !== 'dev') return { ok: false, error: 'strategy is not dev' }

        const hash = input.hash ?? crypto.createHash('sha256').update(code).digest('hex')
        const shortHash = hash.slice(0, 8)
        const devRoot = path.dirname(existing.entry_path)
        const entryPath = path.join(devRoot, `index.${hash}.mjs`)
        fs.writeFileSync(entryPath, code, 'utf-8')

        const meta = normalizeMeta(input.meta, existing.name)
        const name = meta.name
        const description = meta.description
        const version = shortHash
        const manifest = safeJson<StrategyManifest>(existing.manifest_json ?? '{}', {})
        const configSchema = toManifestConfigSchema(input.paramsSchema ?? manifest.configSchema ?? manifest.paramsSchema)
        const nextManifest: StrategyManifest = {
            ...manifest,
            paramsSchema: configSchema,
            configSchema: configSchema,
            dev: {
                sourcePath: filePath,
                metaVersion: meta.version,
                lastTest: {
                    status: 'passed',
                    at: Date.now(),
                    diagnostics: input.diagnostics ?? [],
                },
            },
        }

        const record: StrategyRecord = {
            ...existing,
            name,
            description,
            version,
            hash,
            entry_path: entryPath,
            manifest_json: JSON.stringify(nextManifest),
            enabled: existing.enabled ?? true,
        }

        upsertStrategy(db, record)

        const metaPath = path.join(devRoot, 'meta.json')
        fs.writeFileSync(
            metaPath,
            JSON.stringify(
                {
                    meta: input.meta ?? {},
                    sourcePath: filePath,
                    hash,
                    savedAt: Date.now(),
                },
                null,
                2,
            ),
            'utf-8',
        )
        writeSnapshotFile(devRoot, sourceSnapshot)

        const rows = db.prepare(`SELECT id FROM conversations WHERE strategy_id = ?`)
            .all(strategyId) as Array<{ id: string }>
        disposeStrategyWorkers(rows.map((row) => row.id))

        for (const row of rows) {
            emitStrategyDevEvent({
                type: 'reload',
                conversationId: row.id,
                strategyId,
                turnId: null,
                timestamp: Date.now(),
                version,
                hash,
            })
        }

        return { ok: true, sourceSnapshot, sourceError }
    } catch (err) {
        return { ok: false, error: err instanceof Error ? err.message : String(err) }
    }
}

export async function getStrategyDevSnapshot(input: StrategyDevSnapshotRequest): Promise<StrategyDevSnapshotResult> {
    try {
        const strategyId = input?.strategyId
        if (!strategyId) return { ok: false, error: 'strategyId required' }
        const db = getDB()
        const existing = listStrategies(db).find((row) => row.id === strategyId)
        if (!existing) return { ok: false, error: 'strategy not found' }
        if (existing.source !== 'dev') return { ok: false, error: 'strategy is not dev' }

        const devRoot = path.dirname(existing.entry_path)
        const snapshotPath = path.join(devRoot, 'source.ts')
        let sourceSnapshot: string | undefined
        let sourceError: string | undefined

        try {
            if (fs.existsSync(snapshotPath)) {
                sourceSnapshot = fs.readFileSync(snapshotPath, 'utf-8')
            } else {
                const manifest = safeJson<StrategyManifest>(existing.manifest_json ?? '{}', {})
                const sourcePath = manifest.dev?.sourcePath
                if (sourcePath && fs.existsSync(sourcePath)) {
                    sourceSnapshot = fs.readFileSync(sourcePath, 'utf-8')
                    writeSnapshotFile(devRoot, sourceSnapshot)
                } else {
                    sourceError = sourcePath ? `file not found: ${sourcePath}` : 'source path not available'
                }
            }
        } catch (err) {
            sourceError = err instanceof Error ? err.message : String(err)
        }

        return { ok: true, sourceSnapshot, sourceError }
    } catch (err) {
        return { ok: false, error: err instanceof Error ? err.message : String(err) }
    }
}

export async function openStrategyDevChat(
    input: StrategyDevOpenChatRequest,
    webContentsId?: number,
): Promise<StrategyDevOpenChatResult> {
    const db = getDB()
    const strategyId = input?.strategyId
    if (!strategyId) throw new Error('strategyId required')

    const strategy = listStrategies(db).find((row) => row.id === strategyId)
    if (!strategy) throw new Error('strategy not found')

    const prefs = getStrategyPrefs(db)
    if (!prefs.enabledIds.includes(strategy.id)) {
        setStrategyPrefs(db, { enabledIds: [...prefs.enabledIds, strategy.id] })
    }

    const now = Date.now()
    const title = strategy.name ? `${strategy.name} (Dev)` : 'Dev Strategy'
    const appSettings = getAppSettings(db)
    const candidateId = appSettings.last_used_model_id ?? appSettings.active_model_id ?? null
    const available = getAvailableModel(candidateId)
    const modelToUse = available?.id ?? null
    const fallback = getStrategyOrFallback(db, {
        requestedStrategyId: appSettings.active_strategy_id,
    }).strategy

    const conversationId = crypto.randomUUID()

    db.prepare(`
            INSERT INTO conversations (
              id, title, title_source, created_at, updated_at, model, strategy_id, strategy_key, strategy_version, archived, summary, pinned
            )
            VALUES (?, ?, 'default', ?, ?, ?, ?, ?, ?, 0, '', 0)
        `).run(
        conversationId,
        title,
        now,
        now,
        modelToUse,
        fallback.id,
        fallback.key,
        fallback.version,
    )

    switchConversationStrategy(db, {
        conversationId,
        mode: 'no_replay',
        strategyId: strategy.id,
        webContentsId,
    })

    return { conversationId }
}

export async function openStrategyDevSourceFolder(
    input: StrategyDevOpenSourceFolderRequest,
): Promise<StrategyDevOpenSourceFolderResult> {
    const db = getDB()
    const strategyId = input?.strategyId
    if (!strategyId) throw new Error('strategyId required')

    const strategy = listStrategies(db).find((row) => row.id === strategyId)
    if (!strategy) throw new Error('strategy not found')
    if (strategy.source !== 'dev') throw new Error('strategy is not dev')

    const manifest = safeJson<StrategyManifest>(strategy.manifest_json ?? '{}', {})
    const sourcePath = manifest.dev?.sourcePath
    if (!sourcePath) throw new Error('source path not available')

    shell.showItemInFolder(sourcePath)
    return { ok: true, path: path.dirname(sourcePath) }
}

export async function recordStrategyDevTest(input: {
    strategyId: string
    status: 'passed' | 'failed'
    diagnostics?: StrategyDevDiagnostic[]
}) {
    const db = getDB()
    if (!input?.strategyId) throw new Error('strategyId required')
    const existing = listStrategies(db).find((row) => row.id === input.strategyId)
    if (!existing) throw new Error('strategy not found')
    if (existing.source !== 'dev') throw new Error('strategy is not dev')

    const manifest = safeJson<StrategyManifest>(existing.manifest_json ?? '{}', {})
    const nextManifest: StrategyManifest = {
        ...manifest,
        dev: {
            ...manifest.dev,
            lastTest: {
                status: input.status,
                at: Date.now(),
                diagnostics: input.diagnostics ?? [],
            },
        },
    }
    upsertStrategy(db, {
        ...existing,
        manifest_json: JSON.stringify(nextManifest),
        updated_at: Date.now(),
    })

    return { ok: true as const }
}

export async function removeStrategyDev(input: { strategyId: string }) {
    const db = getDB()
    const strategyId = input?.strategyId
    if (!strategyId) throw new Error('strategyId required')
    const victim = listStrategies(db).find((row) => row.id === strategyId)
    if (!victim) throw new Error('strategy not found')
    if (victim.source !== 'dev') throw new Error('strategy is not dev')

    const strategies = listStrategies(db)
    let fallback = getStrategyOrFallback(db, {}).strategy
    if (fallback.id === strategyId) {
        const candidate = strategies.find((row) => row.id !== strategyId && row.enabled !== false)
        if (!candidate) throw new Error('no fallback strategy available')
        fallback = candidate
    }
    const rows = db.prepare(`SELECT id FROM conversations WHERE strategy_id = ?`)
        .all(strategyId) as Array<{ id: string }>

    db.transaction(() => {
        for (const row of rows) {
            switchConversationStrategy(db, {
                conversationId: row.id,
                mode: 'no_replay',
                strategyId: fallback.id,
            })
        }
        const prefs = getStrategyPrefs(db)
        const nextEnabled = prefs.enabledIds.filter((id) => id !== strategyId)
        const nextDefault = prefs.defaultId === strategyId ? fallback.id : prefs.defaultId
        setStrategyPrefs(db, { enabledIds: nextEnabled, defaultId: nextDefault })
        db.prepare(`DELETE FROM strategies WHERE id = ?`).run(strategyId)
    })()

    const devRoot = path.dirname(victim.entry_path)
    try {
        fs.rmSync(devRoot, { recursive: true, force: true })
    } catch {
        // ignore remove failures
    }

    disposeStrategyWorkers(rows.map((row) => row.id))

    return { ok: true as const }
}
