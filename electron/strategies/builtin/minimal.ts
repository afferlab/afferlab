import { defineStrategy } from '../../../contracts'

export const configSchema = []

export default defineStrategy({
    meta: {
        name: 'Base',
        description: 'Minimal',
        version: '0.1.0',
        features: { memoryCloud: false },
    },

    configSchema,

    onContextBuild(ctx) {
        const history = ctx.history.recent(10)

        ctx.slots.add('system', 'You are a helpful assistant.', {
            priority: 3,
            position: 0
        })

        ctx.slots.add('history', history, {
            priority: 1,
            position: 1,
            trimBehavior: 'message'
        })

        ctx.slots.add('input', ctx.input, {
            priority: 2,
            position: 2
        })

        return ctx.slots.render()
    },
})
