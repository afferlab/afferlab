import path from 'node:path'
import crypto from 'node:crypto'
import { build } from 'esbuild'

type DevBundle = {
    code: string
    bundleSize: number
    hash: string
}

const STRATEGY_SDK_ENTRY = path.join(
    process.env.APP_ROOT ?? process.cwd(),
    'electron',
    'strategy-sdk',
    'index.ts',
)

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
                name: 'strategy-sdk-resolver',
                setup(buildInstance) {
                    buildInstance.onResolve({ filter: /^@looma\/strategy-sdk$/ }, () => ({
                        path: STRATEGY_SDK_ENTRY,
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
