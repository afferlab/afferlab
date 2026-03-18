export const STRATEGY_TEMPLATE_FILENAME = 'looma-strategy-template.ts'

export const STRATEGY_TEMPLATE_CODE = `import { defineStrategy } from '@looma/strategy-sdk'

export default defineStrategy({
    meta: {
        name: 'My Strategy',
        description: 'A custom Looma strategy.',
        version: '0.1.0',
    },

    configSchema: [],

    async onContextBuild(ctx) {
        const input = (ctx.input.text || '').trim()
        const history = ctx.history.recent(8)

        ctx.slots.add(
            'system',
            { role: 'system', content: 'You are a helpful assistant.' },
            { priority: 10, position: 0 }
        )

        if (history.length) {
            ctx.slots.add('history', history, {
                priority: 4,
                position: 10,
                trimBehavior: 'message',
            })
        }

        ctx.slots.add(
            'input',
            { role: 'user', content: input || '(Empty input)' },
            { priority: 6, position: 20 }
        )

        return {
            prompt: ctx.slots.render(),
            tools: [],
        }
    },
})
`

export function downloadStrategyTemplate(): void {
    const blob = new Blob([STRATEGY_TEMPLATE_CODE], {
        type: 'text/typescript;charset=utf-8',
    })
    const url = URL.createObjectURL(blob)
    const link = document.createElement('a')
    link.href = url
    link.download = STRATEGY_TEMPLATE_FILENAME
    link.click()
    URL.revokeObjectURL(url)
}

export const STRATEGY_TEMPLATE_DOCS = [
    'Wrap your strategy in defineStrategy(...) and keep it as a single .ts module.',
    'Keep the file as a single .ts module so it can be compiled directly.',
    'Use ctx.slots.add(...) to build the final prompt in a predictable order.',
    'Return { prompt: ctx.slots.render(), tools: [] } unless you need tools.',
]
