import fs from 'node:fs'
import path from 'node:path'
import { app } from 'electron'
import { loadModelsSync } from './loadModels'
import type { ModelDefinition } from '../../contracts/index'

export type ProviderModelOverride = {
    temperature?: number
    maxTokens?: number
    top_p?: number
    stop?: string[]
}

export type ProviderSettings = Record<string, {
    enabled?: boolean
    apiKey?: string
    apiHost?: string
    modelOverrides?: Record<string, ProviderModelOverride>
}>

const DEFAULT_PROVIDER_HOSTS: Record<string, string> = {
    gemini: 'https://generativelanguage.googleapis.com',
    openai: 'https://api.openai.com/v1',
    anthropic: 'https://api.anthropic.com',
    deepseek: 'https://api.deepseek.com/v1',
    ollama: 'http://127.0.0.1:11434',
    lmstudio: 'http://127.0.0.1:1234/v1',
}

function resolveProvidersPath(): string {
    const dir = app.getPath('userData')
    return path.join(dir, 'providers.json')
}

function readJsonFile<T>(filePath: string, fallback: T): T {
    try {
        if (!fs.existsSync(filePath)) return fallback
        const raw = fs.readFileSync(filePath, 'utf-8')
        return JSON.parse(raw) as T
    } catch {
        return fallback
    }
}

function writeJsonFile(filePath: string, data: unknown): void {
    const dir = path.dirname(filePath)
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true })
    const tmp = `${filePath}.tmp`
    fs.writeFileSync(tmp, JSON.stringify(data, null, 2), 'utf-8')
    fs.renameSync(tmp, filePath)
}

function isModelDefinition(entry: unknown): entry is ModelDefinition {
    if (!entry || typeof entry !== 'object') return false
    const candidate = entry as Record<string, unknown>
    return (
        typeof candidate.id === 'string'
        && typeof candidate.label === 'string'
        && typeof candidate.provider === 'string'
        && typeof candidate.kind === 'string'
        && typeof candidate.capabilities === 'object'
        && candidate.capabilities !== null
    )
}

export function getProviderDefaults(providerId: string): { apiHost?: string } {
    return { apiHost: DEFAULT_PROVIDER_HOSTS[providerId] }
}

export function loadProviderSettings(): ProviderSettings {
    const filePath = resolveProvidersPath()
    const data = readJsonFile<ProviderSettings>(filePath, {})
    const migrated = migrateProviderSettings(data)
    if (migrated.changed) {
        writeJsonFile(filePath, migrated.settings)
    }
    return migrated.settings
}

function migrateProviderSettings(settings: ProviderSettings): { settings: ProviderSettings; changed: boolean } {
    const next: ProviderSettings = { ...settings }
    let changed = false
    const legacy = next.local
    if (legacy) {
        const ollamaSettings = next.ollama ?? {}
        if (legacy.apiHost && !next.ollama?.apiHost) {
            next.ollama = { ...ollamaSettings, apiHost: legacy.apiHost }
            changed = true
        }
        if (!next.ollama) {
            next.ollama = { ...ollamaSettings }
            changed = true
        }
        if (!next.lmstudio) {
            next.lmstudio = {}
            changed = true
        }
        delete next.local
        changed = true
    }
    return { settings: next, changed }
}

export function saveProviderSettings(settings: ProviderSettings): void {
    const filePath = resolveProvidersPath()
    writeJsonFile(filePath, settings)
}

export function updateProviderSettings(providerId: string, patch: {
    enabled?: boolean
    apiKey?: string
    apiHost?: string
}): ProviderSettings {
    const current = loadProviderSettings()
    const prev = current[providerId] ?? {}
    const next: ProviderSettings = {
        ...current,
        [providerId]: {
            ...prev,
            ...patch,
            modelOverrides: prev.modelOverrides ?? {},
        },
    }
    saveProviderSettings(next)
    return next
}

export function setProviderModelOverride(
    providerId: string,
    modelId: string,
    override: ProviderModelOverride,
): ProviderSettings {
    const current = loadProviderSettings()
    const prev = current[providerId] ?? {}
    const nextOverrides = { ...(prev.modelOverrides ?? {}) }
    nextOverrides[modelId] = { ...(nextOverrides[modelId] ?? {}), ...override }
    const next: ProviderSettings = {
        ...current,
        [providerId]: {
            ...prev,
            modelOverrides: nextOverrides,
        },
    }
    saveProviderSettings(next)
    return next
}

export function resetProviderModelOverride(providerId: string, modelId: string): ProviderSettings {
    const current = loadProviderSettings()
    const prev = current[providerId]
    if (!prev?.modelOverrides || !prev.modelOverrides[modelId]) return current
    const nextOverrides = { ...prev.modelOverrides }
    delete nextOverrides[modelId]
    const next: ProviderSettings = {
        ...current,
        [providerId]: {
            ...prev,
            modelOverrides: nextOverrides,
        },
    }
    saveProviderSettings(next)
    return next
}

export function resetProviderApiHost(providerId: string): ProviderSettings {
    const defaults = getProviderDefaults(providerId)
    return updateProviderSettings(providerId, { apiHost: defaults.apiHost })
}

export function refreshProviderModels(providerId: string): ModelDefinition[] {
    const models = loadModelsSync().reduce<ModelDefinition[]>((acc, entry) => {
        if (isModelDefinition(entry)) acc.push(entry)
        return acc
    }, [])
    return models.filter((m) => (m as { provider?: string }).provider === providerId)
}
