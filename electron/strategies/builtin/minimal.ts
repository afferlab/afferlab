import { defineStrategy } from '../../../contracts'

export default defineStrategy({
    meta: {
        name: 'Base',
        description: 'Minimal',
        version: '0.2.2',
        features: { memoryCloud: false },
    },

    configSchema: [],

    onContextBuild(ctx) {
        const text = ctx.input.text.trim()
        const history = ctx.history.recent(10)

        ctx.slots.add(
            'system',
            { role: 'system', content: 'You are a helpful assistant.' },
            { priority: 3, position: 0 }
        )

        if (history.length) {
            ctx.slots.add(
                'history',
                history,
                { priority: 1, position: 1, trimBehavior: 'message' }
            )
        }

        ctx.slots.add(
            'input',
            { role: 'user', content: text || '(Empty input)' },
            { priority: 2, position: 2 }
        )

        return ctx.slots.render()
    },
})