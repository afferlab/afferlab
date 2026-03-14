import type {
    Attachment,
    LLMModelConfig,
    LoomaContext,
    Message,
    ToolChoice,
    ToolDefinition,
    RunResult,
    MemoryIngestInput,
    MemoryIngestOptions,
    MemoryIngestResult,
    MemorySearchOptions,
    MemoryQueryOptions,
    MemoryHit,
    StrategyDevEvent,
} from '../../../../contracts'
import { hostClient } from '../hostClient'

function createUnsupportedInputError(message: string): Error & { errorCode?: string } {
    const err = new Error(message) as Error & { errorCode?: string }
    err.errorCode = 'MEMORY_INPUT_UNSUPPORTED'
    return err
}

function resolveAssetId(asset: string | Attachment): string {
    if (typeof asset === 'string') return asset
    return asset.id
}

function getIngestKind(input: MemoryIngestInput): string {
    if (Array.isArray(input)) return 'array'
    if (typeof input === 'string') return 'text'
    if (input && typeof input === 'object' && 'assetId' in input) return 'asset'
    if (input && typeof input === 'object') return 'object'
    return 'unknown'
}

type ToolsEventData = Extract<StrategyDevEvent, { type: 'tools' }>['data']
type MemoryEventData = Extract<StrategyDevEvent, { type: 'memory' }>['data']
type ToolsDevEvent = Omit<Extract<StrategyDevEvent, { type: 'tools' }>, 'conversationId' | 'strategyId' | 'timestamp'>
type MemoryDevEvent = Omit<Extract<StrategyDevEvent, { type: 'memory' }>, 'conversationId' | 'strategyId' | 'timestamp'>
type DevEventEmitter = (event: ToolsDevEvent | MemoryDevEvent) => void

type IngestItemSummary = {
    kind: string
    assetId?: string
    filename?: string
    mime?: string
    textLength?: number
    dataBytes?: number
}

function summarizeText(value: string, max = 160): { length: number; preview: string } {
    if (typeof value !== 'string') return { length: 0, preview: '' }
    if (value.length <= max) return { length: value.length, preview: value }
    return { length: value.length, preview: `${value.slice(0, max)}...` }
}

function summarizeIngestItem(item: MemoryIngestInput): IngestItemSummary {
    if (typeof item === 'string') {
        return { kind: 'text', textLength: item.length }
    }
    if (item && typeof item === 'object' && 'assetId' in item) {
        const assetId = (item as { assetId?: string }).assetId
        return { kind: 'asset', assetId: assetId ?? '' }
    }
    if (item && typeof item === 'object') {
        const doc = item as { text?: string; data?: Uint8Array; filename?: string; mime?: string }
        return {
            kind: 'object',
            filename: doc.filename,
            mime: doc.mime,
            textLength: doc.text?.length ?? 0,
            dataBytes: doc.data?.byteLength ?? 0,
        }
    }
    return { kind: 'unknown' }
}

function summarizeIngestInput(inputData: MemoryIngestInput, options?: MemoryIngestOptions) {
    const items = Array.isArray(inputData) ? inputData : [inputData]
    return {
        kind: getIngestKind(inputData),
        itemCount: items.length,
        items: items.map(summarizeIngestItem),
        options: {
            wait: options?.wait ?? 'load',
            embeddingProfile: options?.embeddingProfile,
            chunkSize: options?.chunkSize,
            chunkOverlap: options?.chunkOverlap,
            tags: options?.tags,
            type: options?.type,
            sourceMessageId: options?.sourceMessageId,
            indexing: options?.indexing,
        },
    }
}

export function createToolsApi(args: {
    conversationId: string
    turnId?: string
    model?: LLMModelConfig
    strategyId?: string
    devEmit?: DevEventEmitter
}): LoomaContext['tools'] {
    const conversationId = args.conversationId
    const turnId = args.turnId
    const model = args.model
    const strategyId = args.strategyId
    const devEmit = args.devEmit

    const emitTools = (data: ToolsEventData) => {
        if (!devEmit) return
        devEmit({ type: 'tools', data })
    }
    const emitMemory = (data: MemoryEventData) => {
        if (!devEmit) return
        devEmit({ type: 'memory', data })
    }

    return {
        llm: {
            call: async (
                messages: Message[],
                options?: { tools?: ToolDefinition[]; toolChoice?: ToolChoice; temperature?: number },
            ): Promise<Message> => {
                if (!model) {
                    throw new Error('model missing for llm.call')
                }
                const input = {
                    messages,
                    tools: options?.tools,
                    toolChoice: options?.toolChoice,
                    temperature: options?.temperature,
                }
                try {
                    const result = await hostClient.llmCall({
                        conversationId,
                        turnId,
                        model,
                        messages,
                        tools: options?.tools,
                        toolChoice: options?.toolChoice,
                        temperature: options?.temperature,
                    })
                    emitTools({ action: 'llm.call', input, output: result })
                    return result
                } catch (err) {
                    const msg = err instanceof Error ? err.message : String(err)
                    emitTools({ action: 'llm.call', input, error: msg })
                    throw err
                }
            },
            run: async (options: {
                messages: Message[]
                tools?: ToolDefinition[]
                toolChoice?: ToolChoice
                maxRounds?: number
                onToolCall?: (call: { id: string; name: string; args: Record<string, unknown> }) => Promise<string>
                temperature?: number
            }): Promise<RunResult> => {
                if (options.onToolCall) {
                    throw new Error('onToolCall is not supported in host-run mode')
                }
                if (!model) {
                    throw new Error('model missing for llm.run')
                }
                const input = {
                    messages: options.messages,
                    tools: options.tools,
                    toolChoice: options.toolChoice,
                    maxRounds: options.maxRounds,
                    temperature: options.temperature,
                }
                try {
                    const result = await hostClient.runLLMLoop({
                        conversationId,
                        turnId,
                        model,
                        messages: options.messages,
                        tools: options.tools,
                        toolChoice: options.toolChoice,
                        maxRounds: options.maxRounds,
                        temperature: options.temperature,
                    })
                    emitTools({ action: 'llm.run', input, output: result })
                    return result
                } catch (err) {
                    const msg = err instanceof Error ? err.message : String(err)
                    emitTools({ action: 'llm.run', input, error: msg })
                    throw err
                }
            },
        },
        state: {
            get: async <T = unknown>(key: string): Promise<T | null> => {
                if (!strategyId) return null
                const result = await hostClient.stateGet({
                    conversationId,
                    strategyId,
                    key,
                })
                return (result as T) ?? null
            },
            set: async (key: string, value: unknown): Promise<void> => {
                if (!strategyId) return
                await hostClient.stateSet({
                    conversationId,
                    strategyId,
                    key,
                    value,
                })
            },
            delete: async (key: string): Promise<void> => {
                if (!strategyId) return
                await hostClient.stateDelete({
                    conversationId,
                    strategyId,
                    key,
                })
            },
        },
        memory: {
            query: async (options?: MemoryQueryOptions) => {
                const input = { options }
                try {
                    const result = await hostClient.memoryQuery({ conversationId, options })
                    emitMemory({ action: 'query', input, output: result })
                    return result
                } catch (err) {
                    const msg = err instanceof Error ? err.message : String(err)
                    emitMemory({ action: 'query', input, error: msg })
                    throw err
                }
            },
            search: async (query: string, options?: MemorySearchOptions): Promise<MemoryHit[]> => {
                console.debug('[MEMORY][strategy_tool]', 'search', {
                    conversationId,
                    strategyId: strategyId ?? null,
                    queryLength: typeof query === 'string' ? query.length : 0,
                    topK: options?.topK ?? null,
                })
                const input = { query, options }
                try {
                    const result = await hostClient.executeMemorySearch({
                        conversationId,
                        query,
                        topK: options?.topK,
                        embeddingProfile: options?.embeddingProfile,
                        scope: { type: 'conversation', id: conversationId },
                    })
                    emitMemory({ action: 'search', input, output: result })
                    return result
                } catch (err) {
                    const msg = err instanceof Error ? err.message : String(err)
                    emitMemory({ action: 'search', input, error: msg })
                    throw err
                }
            },
            ingest: async (inputData: MemoryIngestInput, options?: MemoryIngestOptions): Promise<MemoryIngestResult | MemoryIngestResult[]> => {
                const wait = options?.wait ?? 'load'
                const inputKind = getIngestKind(inputData)
                const itemCount = Array.isArray(inputData) ? inputData.length : 1
                console.debug('[MEMORY][strategy_tool]', 'ingest', {
                    conversationId,
                    strategyId: strategyId ?? null,
                    inputKind,
                    itemCount,
                    wait,
                })
                const debugInput = summarizeIngestInput(inputData, options)

                const items = Array.isArray(inputData) ? inputData : [inputData]
                const results: MemoryIngestResult[] = []

                for (const item of items) {
                    if (typeof item === 'string') {
                        const req = {
                            conversationId,
                            filename: 'ingest.txt',
                            mime: 'text/plain',
                            text: item,
                            options: {
                                wait,
                                embeddingProfile: options?.embeddingProfile,
                                chunkSize: options?.chunkSize,
                                chunkOverlap: options?.chunkOverlap,
                                tags: options?.tags,
                                type: options?.type,
                                sourceMessageId: options?.sourceMessageId,
                                indexing: options?.indexing,
                            },
                        }
                        try {
                            results.push(await hostClient.ingestDocument(req))
                        } catch (err) {
                            const msg = err instanceof Error ? err.message : String(err)
                            emitMemory({ action: 'ingest', input: debugInput, error: msg })
                            throw err
                        }
                        continue
                    }
                    if (item && typeof item === 'object' && 'assetId' in item && typeof item.assetId === 'string') {
                        const req = {
                            conversationId,
                            assetId: item.assetId,
                            filename: item.assetId,
                            options: {
                                wait,
                                embeddingProfile: options?.embeddingProfile,
                                chunkSize: options?.chunkSize,
                                chunkOverlap: options?.chunkOverlap,
                                tags: options?.tags,
                                type: options?.type,
                                sourceMessageId: options?.sourceMessageId,
                                indexing: options?.indexing,
                            },
                        }
                        try {
                            results.push(await hostClient.ingestDocument(req))
                        } catch (err) {
                            const msg = err instanceof Error ? err.message : String(err)
                            emitMemory({ action: 'ingest', input: debugInput, error: msg })
                            throw err
                        }
                        continue
                    }
                    if (item && typeof item === 'object') {
                        const doc = item as { text?: string; data?: Uint8Array; filename?: string; mime?: string }
                        const filename = doc.filename ?? 'ingest.txt'
                        const mime = doc.mime ?? (doc.text ? 'text/plain' : 'application/octet-stream')
                        if (doc.text || doc.data) {
                            const req = {
                                conversationId,
                                filename,
                                mime,
                                text: doc.text,
                                data: doc.data,
                                options: {
                                    wait,
                                    embeddingProfile: options?.embeddingProfile,
                                    chunkSize: options?.chunkSize,
                                    chunkOverlap: options?.chunkOverlap,
                                    tags: options?.tags,
                                    type: options?.type,
                                    sourceMessageId: options?.sourceMessageId,
                                    indexing: options?.indexing,
                                },
                            }
                            try {
                                results.push(await hostClient.ingestDocument(req))
                            } catch (err) {
                                const msg = err instanceof Error ? err.message : String(err)
                                emitMemory({ action: 'ingest', input: debugInput, error: msg })
                                throw err
                            }
                            continue
                        }
                    }
                    throw createUnsupportedInputError('MEMORY_INPUT_UNSUPPORTED')
                }

                const output = Array.isArray(inputData) ? results : results[0]
                emitMemory({ action: 'ingest', input: debugInput, output })
                return output
            },
            readAsset: async (asset: string | Attachment, maxChars?: number) => {
                const assetId = resolveAssetId(asset)
                console.debug('[MEMORY][strategy_tool]', 'readAsset', {
                    conversationId,
                    strategyId: strategyId ?? null,
                    assetId,
                    maxChars: maxChars ?? null,
                })
                const input = { assetId, maxChars }
                try {
                    const result = await hostClient.executeMemoryReadAsset({ conversationId, assetId, maxChars })
                    emitMemory({ action: 'readAsset', input, output: summarizeText(result) })
                    return result
                } catch (err) {
                    const msg = err instanceof Error ? err.message : String(err)
                    emitMemory({ action: 'readAsset', input, error: msg })
                    throw err
                }
            },
            retireBySourceMessage: async (messageId: string) => {
                const input = { messageId }
                try {
                    const result = await hostClient.memoryRetireBySourceMessage({ conversationId, messageId })
                    emitMemory({ action: 'retireBySourceMessage', input, output: result })
                    return result
                } catch (err) {
                    const msg = err instanceof Error ? err.message : String(err)
                    emitMemory({ action: 'retireBySourceMessage', input, error: msg })
                    throw err
                }
            },
            retireMemory: async (memoryId: string) => {
                const input = { memoryId }
                try {
                    const result = await hostClient.memoryRetireMemory({ conversationId, memoryId })
                    emitMemory({ action: 'retireMemory', input, output: result })
                    return result
                } catch (err) {
                    const msg = err instanceof Error ? err.message : String(err)
                    emitMemory({ action: 'retireMemory', input, error: msg })
                    throw err
                }
            },
        },
    }
}
