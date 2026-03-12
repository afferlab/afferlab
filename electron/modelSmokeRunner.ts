import { app } from 'electron'
import {
    getModelOrFallback,
    listModelsWithStatus,
    loadLocalSettings,
} from './core/models/modelRegistry'

async function main(): Promise<void> {
    await app.whenReady()

    const settings = loadLocalSettings()
    const models = listModelsWithStatus('chat')
    const fallback = getModelOrFallback(settings.defaults?.chatModelId)

    console.log('default_chat_model', fallback.model.id)
    for (const entry of models) {
        const reasons = entry.status.reasons.length ? entry.status.reasons.join(',') : 'ok'
        console.log(`model ${entry.model.id} available=${entry.status.available} reasons=${reasons}`)
    }

    const missingKey = models.find(m => m.status.reasons.includes('missing_key'))
    if (missingKey) {
        const res = getModelOrFallback(missingKey.model.id)
        if (!res.fallbackUsed) {
            throw new Error(`fallback failed for missing_key model: ${missingKey.model.id}`)
        }
        console.log('fallback_check', {
            from: missingKey.model.id,
            to: res.model.id,
            reasonCode: res.reasonCode,
            reasonDetail: res.reasonDetail,
        })
    } else {
        console.log('fallback_check_skip', 'no missing_key model detected')
    }

    app.quit()
    process.exit(0)
}

void main()
