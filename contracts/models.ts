export type ModelKind = 'chat' | 'embedding' | 'vision'
export type AttachmentTransport = 'remote_file_id' | 'inline_base64' | 'inline_parts' | 'none'

export type ModelCapabilities = {
    stream: boolean
    tools: boolean
    json: boolean
    vision: boolean
    reasoning?: boolean
    nativeSearch?: boolean
    embeddings?: boolean
    nativeFiles?: boolean
    supportedMimeTypes?: string[]
    maxFileSizeMB?: number
    maxFilesPerTurn?: number
    attachmentTransport?: AttachmentTransport
}

export type ModelLimits = {
    maxOutputTokens?: number
    maxContextTokens?: number
}

export type ModelDefaults = {
    temperature?: number
    topP?: number
    maxOutputTokens?: number
    maxContextTokens?: number
}

export type ModelRequirements = {
    env?: string[]
    endpoint?: boolean
}

export interface ModelDefinition {
    id: string
    label: string
    provider: string
    kind: ModelKind
    capabilities: ModelCapabilities
    limits?: ModelLimits
    defaults?: ModelDefaults
    paramSchema?: unknown
    requirements?: ModelRequirements
    deprecated?: boolean
    hidden?: boolean
}

export type ModelOverride = {
    enabled?: boolean
    defaultsOverride?: Partial<ModelDefaults>
    endpointOverride?: string
    providerOverride?: string
    notes?: string
}

export type ProviderConfig = {
    apiKey?: string
    baseUrl?: string
    extra?: Record<string, unknown>
}

export type ProviderModelOverride = {
    temperature?: number
    maxTokens?: number
    top_p?: number
    stop?: string[]
}

export type ProviderSettings = Record<string, {
    enabled?: boolean
    apiKey?: string
    apiHost?: string
    modelOverrides?: Record<string, ProviderModelOverride>
}>

export type ProviderTestResult = {
    ok: boolean
    error?: string
    latencyMs?: number
}

export type ModelSettings = {
    providers: Record<string, ProviderConfig>
    modelOverrides: Record<string, ModelOverride>
    defaults: {
        chatModelId?: string
        embeddingModelId?: string
    }
    fallbackOrder?: string[]
}

export type ModelStatusReason =
    | 'missing_key'
    | 'missing_endpoint'
    | 'provider_not_installed'
    | 'provider_not_supported'
    | 'model_deprecated'
    | 'disabled'

export type ModelStatus = {
    available: boolean
    reasons: ModelStatusReason[]
    details?: string
}

export type ModelSelectionReasonCode =
    | 'MODEL_NOT_FOUND'
    | 'MODEL_DISABLED'
    | 'PROVIDER_MISSING'
    | 'PROVIDER_UNREGISTERED'
    | 'MISSING_REQUIREMENT'
    | 'STREAM_UNSUPPORTED'

export type ModelWithStatus = {
    model: ModelDefinition
    status: ModelStatus
}

export type ResolvedModelConfig = {
    model: ModelDefinition
    // entryId: catalog entry (models.json id)
    entryId: string
    // providerModelId: model string sent to provider API
    providerModelId: string
    // modelId: legacy alias of providerModelId (kept for compatibility)
    modelId: string
    providerId: string
    apiBase?: string
    apiPath?: string
    headers?: Record<string, string>
    params: Record<string, unknown>
    capabilities: ModelCapabilities
    limits?: ModelLimits
    defaults?: ModelDefaults
    ctx: { apiKey?: string; baseUrl?: string }
    availability: ModelStatus
}
