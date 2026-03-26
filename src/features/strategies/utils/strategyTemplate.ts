export const STRATEGY_TEMPLATE_ARCHIVE_FILENAME = 'afferlab-strategy-template.zip'
export const STRATEGY_TEMPLATE_FILENAME = 'afferlab-strategy-template.ts'
export const STRATEGY_TEMPLATE_TYPES_FILENAME = 'afferlab-strategy-sdk.d.ts'

export const STRATEGY_TEMPLATE_CODE = `/// <reference path="./afferlab-strategy-sdk.d.ts" />
import { defineStrategy } from '@afferlab/strategy-sdk'

export default defineStrategy({
    meta: {
        name: 'My Strategy',
        description: 'A custom AfferLab strategy.',
        version: '0.1.0',
    },

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
            prompt: { messages: ctx.slots.render() },
            tools: [],
        }
    },
})
`

export const STRATEGY_TEMPLATE_TYPES = `declare module '@afferlab/strategy-sdk' {
    export type StrategyContextBuildResult = {
        prompt: { messages: Message[] }
        tools?: ToolDefinition[]
        meta?: {
            trimmed?: boolean
            inputTokenEstimate?: number
            slotCount?: number
            historyOriginalCount?: number
            historySelectedCount?: number
            historyClipReason?: string
            historyDroppedMessageIds?: string[]
        }
    }

    export type StrategyContextBuildOutput =
        | StrategyContextBuildResult
        | { messages: Message[] }
        | Message[]

    export type ToolCall = {
        id: string
        type: 'function'
        function: {
            name: string
            arguments: string
        }
    }

    export type StrategyConfigOption<TValue extends string = string> = {
        label: string
        value: TValue
    }

    type StrategyConfigEntryBase<TKey extends string> = {
        key: TKey
        label?: string
        description?: string
    }

    export type StrategyConfigTextEntry<TKey extends string = string> = StrategyConfigEntryBase<TKey> & {
        type: 'text'
        default: string
    }

    export type StrategyConfigNumberEntry<TKey extends string = string> = StrategyConfigEntryBase<TKey> & {
        type: 'number'
        default: number
        min?: number
        max?: number
        step?: number
    }

    export type StrategyConfigBooleanEntry<TKey extends string = string> = StrategyConfigEntryBase<TKey> & {
        type: 'boolean'
        default: boolean
    }

    export type StrategyConfigSelectEntry<TKey extends string = string, TValue extends string = string> = StrategyConfigEntryBase<TKey> & {
        type: 'select'
        default: TValue
        options?: ReadonlyArray<StrategyConfigOption<TValue> | TValue>
    }

    export type StrategyConfigEntry<TKey extends string = string> =
        | StrategyConfigTextEntry<TKey>
        | StrategyConfigNumberEntry<TKey>
        | StrategyConfigBooleanEntry<TKey>
        | StrategyConfigSelectEntry<TKey>

    export type StrategyConfigSchema = ReadonlyArray<StrategyConfigEntry>

    type SelectOptionValue<TOptions> =
        TOptions extends ReadonlyArray<infer TOption>
            ? TOption extends string
                ? TOption
                : TOption extends StrategyConfigOption<infer TValue>
                    ? TValue
                    : never
            : never

    type StrategyConfigEntryKey<TEntry> =
        TEntry extends { key: infer TKey extends string }
            ? TKey
            : never

    type StrategyConfigEntryOptions<TEntry> =
        TEntry extends { options?: infer TOptions }
            ? TOptions
            : never

    export type StrategyConfigValue<TEntry> =
        TEntry extends { type: 'number' }
            ? number
            : TEntry extends { type: 'boolean' }
                ? boolean
                : TEntry extends { type: 'text' }
                    ? string
                    : TEntry extends { type: 'select' }
                        ? [SelectOptionValue<StrategyConfigEntryOptions<TEntry>>] extends [never]
                            ? TEntry extends { default: infer TValue extends string }
                                ? TValue
                                : string
                            : SelectOptionValue<StrategyConfigEntryOptions<TEntry>>
                        : TEntry extends { default: infer TValue }
                            ? TValue
                            : never

    export type StrategyConfigValues<TSchema> =
        TSchema extends ReadonlyArray<unknown>
            ? {
                [TEntry in TSchema[number] as StrategyConfigEntryKey<TEntry>]: StrategyConfigValue<TEntry>
            }
            : Record<string, unknown>

    export type StrategyMessageRole = 'user' | 'assistant' | 'system' | 'tool'

    export type Attachment = {
        id: string
        name: string
        size: number
        modality: 'document' | 'image' | 'audio' | 'video'
        mimeType?: string
    }

    export type AttachmentReference = {
        assetId: string
    }

    export type StrategyAttachment = Attachment | AttachmentReference

    export type Message = {
        role: StrategyMessageRole
        content: string | null
        attachments?: StrategyAttachment[]
    }

    export type ToolDefinition = {
        type: 'function'
        function: {
            name: string
            description?: string
            parameters: Record<string, unknown>
        }
    }

    export type Input = {
        text: string
        attachments: StrategyAttachment[]
    }

    export type AfferLabMessage = {
        id: string
        role: 'assistant'
        content: string | null
        toolCalls?: ToolCall[]
        finishReason?: 'stop' | 'length' | 'tool_calls' | 'error'
    }

    export type Budget = {
        maxInputTokens: number
        maxOutputTokens: number
        reservedTokens: number
        remainingInputTokens: number
    }

    export type Capabilities = {
        vision: boolean
        tools: boolean
        memory: boolean
        attachments: boolean
    }

    export type CloudAddPayload = {
        assetId: string
    }

    export type CloudRemovePayload = {
        assetId: string
    }

    export type MemoryRecord = {
        id: string
        assetId?: string | null
        type?: string | null
        text?: string | null
        summary?: string | null
        createdAt?: number | null
        updatedAt?: number | null
        score?: number | null
        tags?: string[]
        meta?: Record<string, unknown> | null
    }

    export type MemoryHit = MemoryRecord

    export type MemoryIngestResult = {
        memoryId: string
        assetId?: string | null
        status: 'ready' | 'processing'
    }

    export type MeasureInput =
        | string
        | Message
        | Message[]
        | StrategyAttachment
        | StrategyAttachment[]

    export type SlotOptions = {
        priority?: number
        position?: number
        minTokens?: number
        maxTokens?: number
        trimBehavior?: 'message' | 'token'
        role?: StrategyMessageRole
    }

    export type AfferLabContext<TConfig extends Record<string, unknown> = Record<string, unknown>> = {
        input: Input
        history: {
            all(): Message[]
            recent(count?: number): Message[]
            byTokens(maxTokens: number): Message[]
            recentText(count?: number): string
        }
        slots: {
            add(
                name: string,
                content:
                    | string
                    | Message
                    | Message[]
                    | Input
                    | StrategyAttachment
                    | StrategyAttachment[]
                    | null,
                options?: SlotOptions,
            ): void
            render(): Message[]
        }
        config: TConfig
        budget: Budget
        capabilities: Capabilities
        message: AfferLabMessage | null
        llm: {
            call(input: {
                messages: Message[]
                model?: string
                maxOutputTokens?: number
                temperature?: number
                stop?: string[]
            }): Promise<{
                content: string
                finishReason: 'stop' | 'length' | 'tool_calls' | 'error' | 'aborted'
                messages: Message[]
                usage?: { inputTokens?: number; outputTokens?: number; totalTokens?: number }
                error?: { code?: string; message?: string }
            }>
            run(input: {
                messages: Message[]
                model?: string
                maxOutputTokens?: number
                temperature?: number
                stop?: string[]
                tools?: ToolDefinition[]
            }): Promise<{
                content: string
                finishReason: 'stop' | 'length' | 'tool_calls' | 'error' | 'aborted'
                messages: Message[]
                toolCalls?: Array<{
                    id: string
                    name: string
                    args: Record<string, unknown>
                    status: 'ok' | 'error' | 'aborted'
                    resultText?: string
                    errorMessage?: string
                }>
                usage?: { inputTokens?: number; outputTokens?: number; totalTokens?: number }
                error?: { code?: string; message?: string }
            }>
        }
        state: {
            get<T = unknown>(key: string): Promise<T | null>
            set<T = unknown>(key: string, value: T): Promise<void>
            remove(key: string): Promise<void>
        }
        memory: {
            query(input?: {
                text?: string
                topK?: number
                orderBy?: 'score' | 'updatedAt' | 'createdAt'
                limit?: number
                tags?: string[]
            }): Promise<MemoryHit[]>
            ingest(input: string | { assetId: string }, options?: {
                wait?: 'none' | 'load'
                mode?: 'rag' | 'raw'
                tags?: string[]
                meta?: Record<string, unknown>
            }): Promise<MemoryIngestResult>
            removeMemory(memoryId: string): Promise<void>
            readAsset(assetId: string, options?: { as?: 'text' | 'base64' | 'bytes' }): Promise<unknown>
        }
        utils: {
            measure(input: MeasureInput): Promise<{ tokens: number }>
        }
        replay?: {
            input: Input
            budget: Budget
            capabilities: Capabilities
            config: TConfig
            message: AfferLabMessage | null
        }
    }

    export type StrategyMeta = {
        name: string
        description?: string
        version?: string
        features?: {
            memoryCloud?: boolean
        }
    }

    export type StrategyHooks<TConfig extends Record<string, unknown> = Record<string, unknown>> = {
        onInit?: (ctx: AfferLabContext<TConfig>) => Promise<void> | void
        onContextBuild: (ctx: AfferLabContext<TConfig>) => Promise<StrategyContextBuildOutput> | StrategyContextBuildOutput
        onTurnEnd?: (ctx: AfferLabContext<TConfig>) => Promise<void> | void
        onCloudAdd?: (ctx: AfferLabContext<TConfig>, payload: CloudAddPayload) => Promise<void> | void
        onCloudRemove?: (ctx: AfferLabContext<TConfig>, payload: CloudRemovePayload) => Promise<void> | void
        onCleanup?: (ctx: AfferLabContext<TConfig>) => Promise<void> | void
        onError?: (ctx: AfferLabContext<TConfig>, error: unknown, phase: string) => Promise<void> | void
        onReplayTurn?: (ctx: AfferLabContext<TConfig>, turn: unknown) => Promise<void> | void
        onToolCall?: (ctx: AfferLabContext<TConfig>, call: unknown) => Promise<string> | string
    }

    export type StrategyModule<TSchema extends ReadonlyArray<unknown> = []> = {
        meta: StrategyMeta
        configSchema?: TSchema
        hooks: StrategyHooks<StrategyConfigValues<TSchema>>
    }

    export type StrategyDefinition<TSchema extends ReadonlyArray<unknown> = []> =
        | StrategyModule<TSchema>
        | ({
            meta: StrategyMeta
            configSchema?: TSchema
        } & StrategyHooks<StrategyConfigValues<TSchema>>)

    type HookName = keyof StrategyHooks<Record<string, unknown>>

    type NestedOnlyInput = {
        [K in HookName]?: never
    }

    type FlatOnlyInput = {
        hooks?: never
    }

    type StrategyFlatInput<TSchema extends ReadonlyArray<unknown>> = {
        meta: StrategyMeta
        configSchema?: TSchema
    } & StrategyHooks<StrategyConfigValues<TSchema>> & FlatOnlyInput

    type StrategyNestedInput<TSchema extends ReadonlyArray<unknown>> = {
        meta: StrategyMeta
        configSchema?: TSchema
        hooks: StrategyHooks<StrategyConfigValues<TSchema>>
    } & NestedOnlyInput

    export function defineStrategy<
        const TSchema extends ReadonlyArray<unknown>,
        T extends StrategyFlatInput<TSchema> = StrategyFlatInput<TSchema>,
    >(strategy: T & { configSchema: TSchema; hooks?: never }): T

    export function defineStrategy<
        T extends StrategyFlatInput<[]> = StrategyFlatInput<[]>,
    >(strategy: T & { hooks?: never }): T

    export function defineStrategy<
        const TSchema extends ReadonlyArray<unknown>,
        T extends StrategyNestedInput<TSchema> = StrategyNestedInput<TSchema>,
    >(strategy: T & { configSchema: TSchema; hooks: StrategyHooks<StrategyConfigValues<TSchema>> }): T

    export function defineStrategy<
        T extends StrategyNestedInput<[]> = StrategyNestedInput<[]>,
    >(strategy: T & { hooks: StrategyHooks<StrategyConfigValues<[]>> }): T
}
`

const ZIP_CENTRAL_DIRECTORY_SIGNATURE = 0x02014b50
const ZIP_END_OF_CENTRAL_DIRECTORY_SIGNATURE = 0x06054b50
const ZIP_LOCAL_FILE_HEADER_SIGNATURE = 0x04034b50
const ZIP_STORE_METHOD = 0
const ZIP_UTF8_FLAG = 0x0800

type ZipEntry = {
    name: string
    data: Uint8Array
}

const textEncoder = new TextEncoder()

function createCrc32Table(): Uint32Array {
    const table = new Uint32Array(256)
    for (let i = 0; i < 256; i += 1) {
        let value = i
        for (let bit = 0; bit < 8; bit += 1) {
            value = (value & 1) !== 0 ? (0xedb88320 ^ (value >>> 1)) : (value >>> 1)
        }
        table[i] = value >>> 0
    }
    return table
}

const crc32Table = createCrc32Table()

function crc32(data: Uint8Array): number {
    let value = 0xffffffff
    for (let i = 0; i < data.length; i += 1) {
        value = crc32Table[(value ^ data[i]) & 0xff] ^ (value >>> 8)
    }
    return (value ^ 0xffffffff) >>> 0
}

function getDosDateTime(date: Date): { dosDate: number; dosTime: number } {
    const year = Math.max(1980, date.getFullYear())
    const dosDate = ((year - 1980) << 9) | ((date.getMonth() + 1) << 5) | date.getDate()
    const dosTime = (date.getHours() << 11) | (date.getMinutes() << 5) | Math.floor(date.getSeconds() / 2)
    return { dosDate, dosTime }
}

function writeUint16(view: DataView, offset: number, value: number): void {
    view.setUint16(offset, value, true)
}

function writeUint32(view: DataView, offset: number, value: number): void {
    view.setUint32(offset, value, true)
}

function createStoredZip(entries: ZipEntry[]): Blob {
    const now = getDosDateTime(new Date())
    const localParts: Uint8Array[] = []
    const centralParts: Uint8Array[] = []
    let offset = 0

    for (const entry of entries) {
        const nameBytes = textEncoder.encode(entry.name)
        const fileData = entry.data
        const fileCrc32 = crc32(fileData)

        const localHeader = new Uint8Array(30 + nameBytes.length)
        const localView = new DataView(localHeader.buffer)
        writeUint32(localView, 0, ZIP_LOCAL_FILE_HEADER_SIGNATURE)
        writeUint16(localView, 4, 20)
        writeUint16(localView, 6, ZIP_UTF8_FLAG)
        writeUint16(localView, 8, ZIP_STORE_METHOD)
        writeUint16(localView, 10, now.dosTime)
        writeUint16(localView, 12, now.dosDate)
        writeUint32(localView, 14, fileCrc32)
        writeUint32(localView, 18, fileData.length)
        writeUint32(localView, 22, fileData.length)
        writeUint16(localView, 26, nameBytes.length)
        writeUint16(localView, 28, 0)
        localHeader.set(nameBytes, 30)

        localParts.push(localHeader, fileData)

        const centralHeader = new Uint8Array(46 + nameBytes.length)
        const centralView = new DataView(centralHeader.buffer)
        writeUint32(centralView, 0, ZIP_CENTRAL_DIRECTORY_SIGNATURE)
        writeUint16(centralView, 4, 20)
        writeUint16(centralView, 6, 20)
        writeUint16(centralView, 8, ZIP_UTF8_FLAG)
        writeUint16(centralView, 10, ZIP_STORE_METHOD)
        writeUint16(centralView, 12, now.dosTime)
        writeUint16(centralView, 14, now.dosDate)
        writeUint32(centralView, 16, fileCrc32)
        writeUint32(centralView, 20, fileData.length)
        writeUint32(centralView, 24, fileData.length)
        writeUint16(centralView, 28, nameBytes.length)
        writeUint16(centralView, 30, 0)
        writeUint16(centralView, 32, 0)
        writeUint16(centralView, 34, 0)
        writeUint16(centralView, 36, 0)
        writeUint32(centralView, 38, 0)
        writeUint32(centralView, 42, offset)
        centralHeader.set(nameBytes, 46)

        centralParts.push(centralHeader)
        offset += localHeader.length + fileData.length
    }

    const centralDirectorySize = centralParts.reduce((total, part) => total + part.length, 0)
    const endRecord = new Uint8Array(22)
    const endView = new DataView(endRecord.buffer)
    writeUint32(endView, 0, ZIP_END_OF_CENTRAL_DIRECTORY_SIGNATURE)
    writeUint16(endView, 4, 0)
    writeUint16(endView, 6, 0)
    writeUint16(endView, 8, entries.length)
    writeUint16(endView, 10, entries.length)
    writeUint32(endView, 12, centralDirectorySize)
    writeUint32(endView, 16, offset)
    writeUint16(endView, 20, 0)

    const blobParts = [...localParts, ...centralParts, endRecord].map((part) => new Uint8Array(part).buffer)

    return new Blob(blobParts, {
        type: 'application/zip',
    })
}

export function downloadStrategyTemplate(): void {
    const archive = createStoredZip([
        {
            name: STRATEGY_TEMPLATE_FILENAME,
            data: textEncoder.encode(STRATEGY_TEMPLATE_CODE),
        },
        {
            name: STRATEGY_TEMPLATE_TYPES_FILENAME,
            data: textEncoder.encode(STRATEGY_TEMPLATE_TYPES),
        },
    ])
    const url = URL.createObjectURL(archive)
    const link = document.createElement('a')
    link.href = url
    link.download = STRATEGY_TEMPLATE_ARCHIVE_FILENAME
    link.click()
    URL.revokeObjectURL(url)
}

export const STRATEGY_TEMPLATE_DOCS = [
    'Download the template zip and keep both files together so your editor can resolve @afferlab/strategy-sdk types.',
    'Wrap your strategy in defineStrategy(...) and keep the strategy itself as a single .ts module.',
    'Use ctx.slots.add(...) to build the final prompt in a predictable order.',
    'Return { prompt: ctx.slots.render(), tools: [] } unless you need tools.',
]
