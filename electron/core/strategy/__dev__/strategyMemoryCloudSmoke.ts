import type { BrowserWindow } from 'electron'
import type {
    MemoryAssetDetail,
    MemoryAssetRecord,
    MemoryIngestResult,
    StrategyActiveInfo,
} from '../../../../contracts/index'

type RendererResult<T> = { ok: true; result: T } | { ok: false; error: string }

type SmokeContext = {
    conversationId: string
    strategyId?: string
    assetId?: string
    phase?: string
}

function errorToString(err: unknown): string {
    if (err instanceof Error) return err.stack ?? err.message
    return String(err)
}

export async function runStrategyMemoryCloudSmoke(win: BrowserWindow): Promise<void> {
    const startedAt = Date.now()
    const context: SmokeContext = {
        conversationId: '',
        phase: 'init',
    }

    const log = (label: string, details: Record<string, unknown>): void => {
        console.log('[smoke][memory]', label, {
            ...details,
            elapsedMs: Date.now() - startedAt,
        })
    }

    const evalRenderer = async <T>(expression: string): Promise<T> => {
        return win.webContents.executeJavaScript(expression, true) as Promise<T>
    }

    const evalRendererSafe = async <T>(expression: string): Promise<RendererResult<T>> => {
        const wrapped = `(async () => {
            try {
                const result = await (${expression})
                return { ok: true, result }
            } catch (err) {
                return { ok: false, error: err?.message ?? String(err) }
            }
        })()`
        return evalRenderer<RendererResult<T>>(wrapped)
    }

    const expectDisabled = async (label: string, expression: string, ctx: SmokeContext): Promise<void> => {
        const result = await evalRendererSafe(expression)
        if (result.ok) {
            throw new Error(`[smoke] expected disabled error for ${label}`)
        }
        if (!result.error.includes('MEMORY_CLOUD_DISABLED')) {
            throw new Error(`[smoke] ${label} unexpected error: ${result.error}`)
        }
        log('disabled', { ...ctx, op: label, error: result.error })
    }

    try {
        const conversation = await evalRenderer<{ id: string }>('window.chatAPI.createConversation()')
        const conversationId = conversation.id
        context.conversationId = conversationId
        context.phase = 'conversation:create'
        log('conversation:create', { conversationId })

        const minimalStrategyId = 'builtin:minimal'
        const memoryStrategyId = 'builtin:memory-first'

        context.phase = 'strategy:switch:minimal'
        const minimalActive = await evalRenderer<StrategyActiveInfo>(
            `window.chatAPI.strategies.switch(${JSON.stringify(conversationId)}, ${JSON.stringify(minimalStrategyId)})`
        )
        context.strategyId = minimalActive.strategyId
        log('strategy:switch', { conversationId, strategyId: minimalActive.strategyId })

        context.phase = 'memoryCloud:isEnabled:minimal'
        const minimalEnabled = await evalRenderer<{ enabled: boolean }>(
            `window.memoryCloudAPI.isEnabled(${JSON.stringify(conversationId)})`
        )
        if (minimalEnabled.enabled !== false) {
            throw new Error(`[smoke] expected memory cloud disabled for ${minimalStrategyId}`)
        }
        log('memoryCloud:isEnabled', { conversationId, strategyId: minimalActive.strategyId, enabled: minimalEnabled.enabled })

        context.phase = 'disabled:listAssets'
        await expectDisabled(
            'listAssets',
            `window.memoryCloudAPI.listAssets(${JSON.stringify(conversationId)})`,
            { conversationId, strategyId: minimalActive.strategyId, phase: 'disabled:listAssets' }
        )
        context.phase = 'disabled:ingest'
        await expectDisabled(
            'ingestDocument',
            `window.memoryCloudAPI.ingestDocument({
                conversationId: ${JSON.stringify(conversationId)},
                filename: 'disabled.txt',
                text: 'disabled',
                options: { wait: 'load' }
            })`,
            { conversationId, strategyId: minimalActive.strategyId, phase: 'disabled:ingest' }
        )
        context.phase = 'disabled:read'
        await expectDisabled(
            'readAsset',
            `window.memoryCloudAPI.readAsset(${JSON.stringify(conversationId)}, 'asset_disabled')`,
            { conversationId, strategyId: minimalActive.strategyId, assetId: 'asset_disabled', phase: 'disabled:read' }
        )
        context.phase = 'disabled:delete'
        await expectDisabled(
            'deleteAsset',
            `window.memoryCloudAPI.deleteAsset(${JSON.stringify(conversationId)}, 'asset_disabled')`,
            { conversationId, strategyId: minimalActive.strategyId, assetId: 'asset_disabled', phase: 'disabled:delete' }
        )

        context.phase = 'strategy:switch:memory'
        const memoryActive = await evalRenderer<StrategyActiveInfo>(
            `window.chatAPI.strategies.switch(${JSON.stringify(conversationId)}, ${JSON.stringify(memoryStrategyId)})`
        )
        context.strategyId = memoryActive.strategyId
        log('strategy:switch', { conversationId, strategyId: memoryActive.strategyId })

        context.phase = 'memoryCloud:isEnabled:memory'
        const memoryEnabled = await evalRenderer<{ enabled: boolean }>(
            `window.memoryCloudAPI.isEnabled(${JSON.stringify(conversationId)})`
        )
        if (memoryEnabled.enabled !== true) {
            throw new Error(`[smoke] expected memory cloud enabled for ${memoryStrategyId}`)
        }
        log('memoryCloud:isEnabled', { conversationId, strategyId: memoryActive.strategyId, enabled: memoryEnabled.enabled })

        context.phase = 'ingest:load'
        const loadText = `load-smoke-${Date.now()}`
        const ingestLoad = await evalRenderer<MemoryIngestResult>(
            `window.memoryCloudAPI.ingestDocument({
                conversationId: ${JSON.stringify(conversationId)},
                filename: 'smoke-load.txt',
                text: ${JSON.stringify(loadText)},
                options: { wait: 'load' }
            })`
        )
        context.assetId = ingestLoad.assetId
        if (ingestLoad.status !== 'loaded') {
            throw new Error(`[smoke] wait=load expected status loaded, got ${ingestLoad.status}`)
        }
        log('ingest:load', {
            conversationId,
            strategyId: memoryActive.strategyId,
            assetId: ingestLoad.assetId,
            status: ingestLoad.status,
        })

        context.phase = 'assets:afterLoad'
        const assetsAfterLoad = await evalRenderer<MemoryAssetRecord[]>(
            `window.memoryCloudAPI.listAssets(${JSON.stringify(conversationId)})`
        )
        if (!assetsAfterLoad.find((item) => item.id === ingestLoad.assetId)) {
            throw new Error('[smoke] asset missing after wait=load ingest')
        }
        log('assets:afterLoad', {
            conversationId,
            strategyId: memoryActive.strategyId,
            assetId: ingestLoad.assetId,
            count: assetsAfterLoad.length,
        })

        context.phase = 'ingest:full'
        const fullText = `full-smoke-${Date.now()}`
        const ingestFull = await evalRenderer<MemoryIngestResult>(
            `window.memoryCloudAPI.ingestDocument({
                conversationId: ${JSON.stringify(conversationId)},
                filename: 'smoke-full.txt',
                text: ${JSON.stringify(fullText)},
                options: { wait: 'full' }
            })`
        )
        context.assetId = ingestFull.assetId
        if (ingestFull.status !== 'completed') {
            throw new Error(`[smoke] wait=full expected status completed, got ${ingestFull.status}`)
        }
        log('ingest:full', {
            conversationId,
            strategyId: memoryActive.strategyId,
            assetId: ingestFull.assetId,
            status: ingestFull.status,
        })

        context.phase = 'readAsset:full'
        const assetDetail = await evalRenderer<MemoryAssetDetail | null>(
            `window.memoryCloudAPI.readAsset(${JSON.stringify(conversationId)}, ${JSON.stringify(ingestFull.assetId)})`
        )
        if (!assetDetail?.text?.includes(fullText)) {
            throw new Error('[smoke] readAsset missing full-text content')
        }
        log('readAsset:full', {
            conversationId,
            strategyId: memoryActive.strategyId,
            assetId: ingestFull.assetId,
        })

        context.phase = 'ingest:md'
        const mdText = `# Smoke MD\n\n${Date.now()}`
        const ingestMd = await evalRenderer<MemoryIngestResult>(
            `window.memoryCloudAPI.ingestDocument({
                conversationId: ${JSON.stringify(conversationId)},
                filename: 'smoke.md',
                mime: 'text/markdown',
                text: ${JSON.stringify(mdText)},
                options: { wait: 'full' }
            })`
        )
        context.assetId = ingestMd.assetId
        if (ingestMd.status !== 'completed') {
            throw new Error(`[smoke] md ingest expected completed, got ${ingestMd.status}`)
        }
        log('ingest:md', {
            conversationId,
            strategyId: memoryActive.strategyId,
            assetId: ingestMd.assetId,
            status: ingestMd.status,
        })

    const pdfBase64 =
        'JVBERi0xLjQKJeLjz9MKMSAwIG9iago8PC9UeXBlL0NhdGFsb2cvUGFnZXMgMiAwIFI+PgplbmRvYmoKMiAwIG9iago8PC9UeXBlL1BhZ2VzL0tpZHNbMyAwIFJdL0NvdW50IDE+PgplbmRvYmoKMyAwIG9iago8PC9UeXBlL1BhZ2UvUGFyZW50IDIgMCBSL01lZGlhQm94WzAgMCA1OTUgODQyXS9Db250ZW50cyA0IDAgUi9SZXNvdXJjZXM8PC9Gb250PDwvRjEgNSAwIFI+Pj4+PgplbmRvYmoKNCAwIG9iago8PC9MZW5ndGggNDQ+PnN0cmVhbQpCVCAvRjEgMjQgVGYgMTAwIDcwMCBUZCAoSGVsbG8gUERGKSBUaiBFVAplbmRzdHJlYW0KZW5kb2JqCjUgMCBvYmoKPDwvVHlwZS9Gb250L1N1YnR5cGUvVHlwZTEvQmFzZUZvbnQvSGVsdmV0aWNhPj4KZW5kb2JqCnhyZWYKMCA2CjAwMDAwMDAwMDAgNjU1MzUgZgowMDAwMDAwMDEwIDAwMDAwIG4KMDAwMDAwMDA3OSAwMDAwMCBuCjAwMDAwMDAxNDggMDAwMDAgbgowMDAwMDAwMjU1IDAwMDAwIG4KMDAwMDAwMDM0MSAwMDAwMCBuCnRyYWlsZXIKPDwvU2l6ZSA2L1Jvb3QgMSAwIFI+PgpzdGFydHhyZWYKNDM5CiUlRU9G'
    const pdfExpression = `(async () => {
        const base64 = ${JSON.stringify(pdfBase64)}
        const bytes = Uint8Array.from(atob(base64), (c) => c.charCodeAt(0))
        return window.memoryCloudAPI.ingestDocument({
            conversationId: ${JSON.stringify(conversationId)},
            filename: 'smoke.pdf',
            mime: 'application/pdf',
            data: bytes,
            options: { wait: 'full' }
        })
    })()`
        context.phase = 'ingest:pdf'
        const ingestPdf = await evalRenderer<MemoryIngestResult>(pdfExpression)
        context.assetId = ingestPdf.assetId
        if (ingestPdf.status === 'failed') {
            const error = ingestPdf.error ?? ''
            if (!error.includes('[ingest/pdf]') || !error.includes('smoke.pdf') || !error.includes('application/pdf')) {
                throw new Error(`[smoke] pdf ingest failed with unexpected error: ${error}`)
            }
            log('ingest:pdf:failed', {
                conversationId,
                strategyId: memoryActive.strategyId,
                assetId: ingestPdf.assetId,
                error,
            })
        } else {
            log('ingest:pdf', {
                conversationId,
                strategyId: memoryActive.strategyId,
                assetId: ingestPdf.assetId,
                status: ingestPdf.status,
            })
        }

        context.phase = 'delete:asset'
        context.assetId = ingestFull.assetId
        await evalRenderer<{ ok: true }>(
            `window.memoryCloudAPI.deleteAsset(${JSON.stringify(conversationId)}, ${JSON.stringify(ingestFull.assetId)})`
        )
        const assetsAfterDelete = await evalRenderer<MemoryAssetRecord[]>(
            `window.memoryCloudAPI.listAssets(${JSON.stringify(conversationId)})`
        )
        if (assetsAfterDelete.find((item) => item.id === ingestFull.assetId)) {
            throw new Error('[smoke] asset still present after deleteAsset')
        }
        log('delete:asset', {
            conversationId,
            strategyId: memoryActive.strategyId,
            assetId: ingestFull.assetId,
        })
    } catch (err) {
        console.error('[smoke][memory]', 'fail', {
            ...context,
            error: errorToString(err),
            elapsedMs: Date.now() - startedAt,
        })
        throw err
    }
}
