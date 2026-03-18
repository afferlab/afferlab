import { defineStrategy } from '../../../contracts'

const strategy = defineStrategy({
    meta: {
        name: 'Base',
        description: 'Minimal',
        version: '0.1.0',
        features: { memoryCloud: false },
    },

    configSchema: [
        {
            key: 'historyDepth',
            type: 'number',
            default: 10,
            min: 1,
            max: 20,
        },
        {
            key: 'systemPrompt',
            type: 'text',
            default: 'You are a helpful assistant.',
        },
    ],

    onContextBuild(ctx) {
        const history = ctx.history.recent(ctx.config.historyDepth)

        ctx.slots.add('system', ctx.config.systemPrompt, {
            priority: 3,
            position: 0,
        })

        ctx.slots.add('history', history, {
            priority: 1,
            position: 1,
            trimBehavior: 'message',
        })

        ctx.slots.add('input', ctx.input, {
            priority: 2,
            position: 2,
        })

        return ctx.slots.render()
    },
})

export const configSchema = strategy.configSchema

export default strategy
