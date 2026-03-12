import type { UIMessage, LLMParams, ToolDef, ModelCapabilities, TurnAttachment } from '../../contracts/index'

export type StreamGen = AsyncGenerator<string, void>

export interface ProviderCtx {
    apiKey?: string
    baseUrl?: string
    nativeSearch?: boolean
    headers?: Record<string, string>
    timeoutMs?: number
    conversationId?: string
    turnId?: string
    replyId?: string
    traceId?: string
    abortSignal?: AbortSignal
}

export interface Provider {
    id: string
    capabilities?: Partial<Pick<ModelCapabilities, 'nativeFiles' | 'supportedMimeTypes' | 'maxFileSizeMB' | 'maxFilesPerTurn' | 'attachmentTransport'>>
    supports: (modelId: string) => boolean
    stream(
        args: {
            modelId: string
            history: UIMessage[]
            params?: LLMParams
            tools?: ToolDef[]
            attachments?: TurnAttachment[]
            inputText?: string
        },
        ctx: ProviderCtx
    ): StreamGen
    complete?(
        args: {
            modelId: string
            history: UIMessage[]
            params?: LLMParams
            tools?: ToolDef[]
            attachments?: TurnAttachment[]
            inputText?: string
        },
        ctx: ProviderCtx
    ): Promise<string>
}
