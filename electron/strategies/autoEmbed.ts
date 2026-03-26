// electron/strategies/autoEmbed.ts
import { bus } from '../core/events'
import { getDBSync } from '../db'
import { embedMemory } from '../core/operations/memory/embedMemory'

bus.on('memory:created', (evt) => {
    if (evt.scope.type !== 'conversation') {
        console.warn('[autoEmbed] skip non-conversation memory', evt.scope)
        return
    }
    // Use Gemini; if the key should come from the environment, provide GOOGLE_API_KEY and pass apiKeyEnv
    embedMemory(getDBSync(), evt.memoryId, {
        conversationId: evt.scope.id,
        provider: 'gemini',
        model: 'text-embedding-004',
        apiKeyEnv: 'GEMINI_API_KEY',
    }).catch((e) => console.error('[autoEmbed] failed:', e))
})
