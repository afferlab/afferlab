import crypto from 'node:crypto'
import { build } from 'esbuild'

type DevBundle = {
    code: string
    bundleSize: number
    hash: string
}

const STRATEGY_SDK_STUB = `
export function defineStrategy(input) { return input }
export const version = 'dev-stub'
`

export async function compileStrategyFile(filePath: string): Promise<DevBundle> {
    const result = await build({
        entryPoints: [filePath],
        bundle: true,
        write: false,
        format: 'esm',
        platform: 'browser',
        target: 'es2020',
        sourcemap: 'inline',
        logLevel: 'silent',
        plugins: [
            {
                name: 'strategy-sdk-stub',
                setup(buildInstance) {
                    buildInstance.onResolve({ filter: /^@looma\/strategy-sdk$/ }, () => ({
                        path: '__looma_strategy_sdk__',
                        namespace: 'strategy-sdk-stub',
                    }))
                    buildInstance.onLoad({ filter: /.*/, namespace: 'strategy-sdk-stub' }, () => ({
                        contents: STRATEGY_SDK_STUB,
                        loader: 'js',
                    }))
                },
            },
        ],
    })

    const output = result.outputFiles?.[0]
    if (!output) {
        throw new Error('bundle output missing')
    }

    return {
        code: output.text,
        bundleSize: output.text.length,
        hash: crypto.createHash('sha256').update(output.text).digest('hex'),
    }
}
