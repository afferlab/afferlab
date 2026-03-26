// electron/llm/index.ts
import type { UIMessage, LLMParams, ToolDef, ResolvedModelConfig, ModelCapabilities, TurnAttachment } from '../../contracts/index'
import type { Provider, ProviderCtx, StreamGen } from './common'
import { GeminiProvider } from './providers/gemini'
import { OpenAIProvider } from './providers/openai'
import { AnthropicProvider } from './providers/anthropic'
import { DeepSeekProvider } from './providers/deepseek'
import { OllamaProvider } from './providers/ollama'
import { LMStudioProvider } from './providers/lmstudio'
import { loadProviderSettings } from '../config/providerSettings'
import { DEFAULT_ATTACHMENT_LIMITS, GLOBAL_SUPPORTED_MIME_TYPES } from '../core/attachments/attachmentPolicy'

const registry: Provider[] = [
    OllamaProvider,
    LMStudioProvider,
    OpenAIProvider,
    GeminiProvider,
    AnthropicProvider,
    DeepSeekProvider,
]

export function getProviderById(id: string): Provider | undefined {
    return registry.find(p => p.id === id)
}

export function hasProvider(id?: string): boolean {
    if (!id) return false
    return Boolean(getProviderById(id))
}

export function providerSupportsComplete(id: string): boolean {
    const p = getProviderById(id)
    return Boolean(p?.complete)
}

export function getProviderNativeFileCapabilities(
    providerId: string,
): Pick<ModelCapabilities, 'nativeFiles' | 'supportedMimeTypes' | 'maxFileSizeMB' | 'maxFilesPerTurn' | 'attachmentTransport'> {
    const provider = getProviderById(providerId)
    const nativeFiles = provider?.capabilities?.nativeFiles ?? false
    const attachmentTransport = nativeFiles
        ? (provider?.capabilities?.attachmentTransport ?? 'remote_file_id')
        : 'none'
    const supportedMimeTypes = nativeFiles
        ? (provider?.capabilities?.supportedMimeTypes?.length
            ? provider.capabilities.supportedMimeTypes
            : GLOBAL_SUPPORTED_MIME_TYPES)
        : []
    return {
        nativeFiles,
        attachmentTransport,
        supportedMimeTypes,
        maxFileSizeMB: nativeFiles
            ? provider?.capabilities?.maxFileSizeMB ?? DEFAULT_ATTACHMENT_LIMITS.maxFileSizeMB
            : undefined,
        maxFilesPerTurn: nativeFiles
            ? provider?.capabilities?.maxFilesPerTurn ?? DEFAULT_ATTACHMENT_LIMITS.maxFilesPerTurn
            : undefined,
    }
}

export function getProviderCtxSource(providerId: string): 'providers.json' | 'env' {
    const settings = loadProviderSettings()
    const entry = settings[providerId] ?? {}
    return entry.apiKey || entry.apiHost ? 'providers.json' : 'env'
}

function logModelParams(providerId: string, modelId: string, params?: LLMParams): void {
    if (process.env.DEBUG_MODEL_PARAMS !== '1') return
    const safe = {
        temperature: params?.temperature,
        top_p: params?.top_p ?? params?.topP,
        maxTokens: params?.maxTokens,
        maxOutputTokens: params?.maxOutputTokens,
    }
    console.log('[llm][params]', {
        provider: providerId,
        model: modelId,
        params: safe,
    })
}

export function callLLMUniversal(
    resolved: ResolvedModelConfig,
    history: UIMessage[],
    tools?: ToolDef[],
    ctxOverrides?: Partial<ProviderCtx>,
    attachments?: TurnAttachment[],
    inputText?: string,
): StreamGen {
    const providerId = resolved.providerId
    if (!providerId) throw new Error(`provider missing for model: ${resolved.modelId}`)
    const provider = getProviderById(providerId)
    if (!provider) throw new Error(`provider not registered: ${providerId}`)
    const providerModelId = resolved.providerModelId ?? resolved.modelId
    const mergedCtx: ProviderCtx = {
        ...resolved.ctx,
        ...(resolved.headers ? { headers: resolved.headers } : {}),
        ...(ctxOverrides ?? {}),
    }
    const mergedParams = resolved.params as LLMParams | undefined
    logModelParams(providerId, providerModelId, mergedParams)
    return provider.stream(
        { modelId: providerModelId, history, params: mergedParams, tools, attachments, inputText },
        mergedCtx,
    )
}

export async function callLLMUniversalNonStream(
    resolved: ResolvedModelConfig,
    history: UIMessage[],
    tools?: ToolDef[],
    ctxOverrides?: Partial<ProviderCtx>,
    attachments?: TurnAttachment[],
    inputText?: string,
): Promise<string> {
    const providerId = resolved.providerId
    if (!providerId) throw new Error(`provider missing for model: ${resolved.modelId}`)
    const provider = getProviderById(providerId)
    if (!provider) throw new Error(`provider not registered: ${providerId}`)
    if (!provider.complete) throw new Error(`${provider.id} does not implement complete()`)
    const providerModelId = resolved.providerModelId ?? resolved.modelId
    const mergedCtx: ProviderCtx = {
        ...resolved.ctx,
        ...(resolved.headers ? { headers: resolved.headers } : {}),
        ...(ctxOverrides ?? {}),
    }
    const mergedParams = resolved.params as LLMParams | undefined
    logModelParams(providerId, providerModelId, mergedParams)
    return provider.complete(
        { modelId: providerModelId, history, params: mergedParams, tools, attachments, inputText },
        mergedCtx,
    )
}
