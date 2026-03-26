import { defineStrategy } from '../../../contracts'

const strategy = defineStrategy({
    meta: {
        name: 'Cloud',
        description: 'Uses Memory Cloud assets as attachments',
        version: '0.1',
        features: { memoryCloud: true },
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
        {
            key: 'memoryLimit',
            type: 'number',
            default: 10,
            min: 1,
            max: 50,
        },
    ],

    async onContextBuild(ctx) {
        const history = ctx.history.recent(ctx.config.historyDepth)

        const items = await ctx.memory.query({
            orderBy: 'updatedAt',
            limit: ctx.config.memoryLimit,
        })

        const seen = new Set<string>()
        const attachments: { assetId: string }[] = []

        for (const item of items) {
            if (!item.assetId) continue
            if (seen.has(item.assetId)) continue

            seen.add(item.assetId)
            attachments.push({ assetId: item.assetId })
        }

        ctx.slots.add('system', ctx.config.systemPrompt, {
            priority: 3,
            position: 0,
        })

        if (attachments.length > 0) {
            ctx.slots.add(
                'context',
                [
                    {
                        role: 'user',
                        content: '',
                        attachments,
                    },
                ],
                {
                    priority: 2,
                    position: 1,
                }
            )
        }

        ctx.slots.add('history', history, {
            priority: 1,
            position: 2,
            trimBehavior: 'message',
        })

        ctx.slots.add('input', ctx.input, {
            priority: 2,
            position: 3,
        })

        return ctx.slots.render()
    },

    async onCloudAdd(ctx, { assetId }) {
        try {
            await ctx.memory.ingest({ assetId }, {
                mode: 'raw',
                wait: 'load',
            })
        } catch {
            // ignore
        }
    },

    async onCloudRemove(ctx, { assetId }) {
        void ctx
        void assetId
    },
})

export const configSchema = strategy.configSchema

export default strategy
