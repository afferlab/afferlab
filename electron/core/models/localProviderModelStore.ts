import type { Database } from 'better-sqlite3'
import type { LLMModelConfig } from '../../../contracts/index'

export type PersistedProviderModelSource = 'remote' | 'custom'

type LocalProviderModelRow = {
    provider_id: string
    model_id: string
    model_json: string
    source: PersistedProviderModelSource
    updated_at: number
}

export function listPersistedLocalProviderModels(db: Database): LLMModelConfig[] {
    const rows = db.prepare(`
        SELECT provider_id, model_id, model_json, source, updated_at
        FROM local_provider_models
        ORDER BY
            CASE source WHEN 'custom' THEN 0 ELSE 1 END,
            updated_at DESC,
            model_id ASC
    `).all() as LocalProviderModelRow[]

    const out: LLMModelConfig[] = []
    for (const row of rows) {
        try {
            const parsed = JSON.parse(row.model_json) as LLMModelConfig
            if (!parsed || typeof parsed !== 'object') continue
            if (parsed.provider !== row.provider_id) continue
            if (parsed.id !== row.model_id) continue
            out.push(parsed)
        } catch {
            continue
        }
    }
    return out
}

export function listPersistedCustomProviderModelIds(db: Database): string[] {
    const rows = db.prepare(`
        SELECT model_id
        FROM local_provider_models
        WHERE source = 'custom'
        ORDER BY updated_at DESC, model_id ASC
    `).all() as Array<{ model_id: string }>
    return rows.map((row) => row.model_id)
}

export function replacePersistedRemoteProviderModels(
    db: Database,
    providerId: string,
    models: LLMModelConfig[],
): void {
    const now = Date.now()
    const clear = db.prepare(`
        DELETE FROM local_provider_models
        WHERE provider_id = ?
          AND source = 'remote'
    `)
    const insert = db.prepare(`
        INSERT INTO local_provider_models (
            provider_id,
            model_id,
            model_json,
            source,
            created_at,
            updated_at
        ) VALUES (?, ?, ?, ?, ?, ?)
    `)

    const tx = db.transaction((items: LLMModelConfig[]) => {
        clear.run(providerId)
        for (const model of items) {
            insert.run(
                providerId,
                model.id,
                JSON.stringify(model),
                'remote',
                now,
                now,
            )
        }
    })

    tx(models)
}

export function upsertPersistedCustomProviderModel(
    db: Database,
    providerId: string,
    model: LLMModelConfig,
): void {
    const now = Date.now()
    db.prepare(`
        INSERT INTO local_provider_models (
            provider_id,
            model_id,
            model_json,
            source,
            created_at,
            updated_at
        ) VALUES (?, ?, ?, 'custom', ?, ?)
        ON CONFLICT(provider_id, model_id) DO UPDATE SET
            model_json = excluded.model_json,
            source = 'custom',
            updated_at = excluded.updated_at
    `).run(
        providerId,
        model.id,
        JSON.stringify(model),
        now,
        now,
    )
}
