import type { IpcRendererEvent } from 'electron'
import type { Conversation } from '../ui/conversation'
import type { UIMessage } from '../ui/UIMessage'
import type { StartGenResponse } from '../ui/chat'
import type { LLMModelConfig } from '../llm'
import type { PrepareAttachmentPayload, PrepareAttachmentResult } from '../attachment'
import type { TurnAttachment } from '../attachment'
import type {
    StrategyReplayDoneEvent,
    StrategyReplayProgressEvent,
    StrategyReplayStartedEvent,
    ConversationStrategyUpdateRequest,
    ConversationStrategyUpdateResponse,
    StrategyActiveInfo,
    StrategyInfo,
    StrategyPrefs,
    StrategyPrefsInput,
    StrategyUsageCounts,
    StrategyParams,
    StrategySwitchRequest,
    StrategySwitchResponse,
    StrategyDevCompileRequest,
    StrategyDevCompileResult,
    StrategyDevSaveRequest,
    StrategyDevSaveResult,
    StrategyDevReloadRequest,
    StrategyDevReloadResult,
    StrategyDevSnapshotRequest,
    StrategyDevSnapshotResult,
    StrategyDevOpenChatRequest,
    StrategyDevOpenChatResult,
    StrategyDevOpenSourceFolderRequest,
    StrategyDevOpenSourceFolderResult,
    StrategyDevEvent,
} from '../strategy/strategies'
import type { ModelWithStatus, ModelSettings, ModelOverride, ProviderConfig, ProviderSettings, ProviderModelOverride, ProviderTestResult } from '../models'
import type {
    AppSettings,
    AppSettingsPatch,
    ModelOverrideRecord,
    ModelDefaultParams,
    SettingsBundle,
    SettingsSnapshot,
    StrategyOverrideRecord,
    ToolSetting,
} from '../settings'
import type { ToolPermissions } from '../tools'
import type {
    LlmStreamChunkEventData,
    LlmStreamDoneEventData,
    LlmStreamStartedEventData,
    SendMessagePayload,
    ConversationTitleUpdatedEventData,
} from './event'
import type { ChatItemRow } from '../ui/chatItemRow'

export interface ChatAPI {
    createConversation(): Promise<Conversation>
    getAllConversations(): Promise<Conversation[]>
    deleteConversation(id: string): Promise<void>
    resetConversationHistory(id: string): Promise<{ ok: true; updatedAt: number }>
    renameConversation(id: string, title: string): Promise<void>
    updateConversationModel(id: string, model: string): Promise<void>

    // turn view
    getChatItems(conversationId: string): Promise<ChatItemRow[]>

    // compatibility: legacy message history API
    getMessages(conversationId: string): Promise<UIMessage[]>
    sendMessage(msg: SendMessagePayload): Promise<StartGenResponse>
    prepareAttachment(input: PrepareAttachmentPayload): Promise<PrepareAttachmentResult>

    getTurnAnswers(turnId: string): Promise<UIMessage[]>

    // models
    getModels(): Promise<LLMModelConfig[]>
    getModelsWithStatus(): Promise<ModelWithStatus[]>
    getModelSettings(opts?: { includeSecrets?: boolean }): Promise<ModelSettings>
    updateProviderConfig(provider: string, patch: ProviderConfig): Promise<{ ok: true }>
    updateModelOverride(modelId: string, patch: ModelOverride): Promise<{ ok: true }>
    setDefaultModels(defaults: { chatModelId?: string; embeddingModelId?: string }): Promise<{ ok: true }>
    reloadModels(): Promise<{ ok: boolean }>

    // streaming
    onStreamStarted(cb: (e: IpcRendererEvent, d: LlmStreamStartedEventData) => void): void
    removeStreamStartedListener(cb: (e: IpcRendererEvent, d: LlmStreamStartedEventData) => void): void
    onStreamChunk(cb: (e: IpcRendererEvent, d: LlmStreamChunkEventData) => void): void
    removeStreamChunkListener(cb: (e: IpcRendererEvent, d: LlmStreamChunkEventData) => void): void
    onStreamDone(cb: (e: IpcRendererEvent, d: LlmStreamDoneEventData) => void): void
    removeStreamDoneListener(cb: (e: IpcRendererEvent, d: LlmStreamDoneEventData) => void): void
    clearStreamHandlers(): void

    onConversationTitleUpdated(cb: (e: IpcRendererEvent, d: ConversationTitleUpdatedEventData) => void): void
    removeConversationTitleUpdatedListener(): void
    onModelsUpdated(cb: (e: IpcRendererEvent, d: { at: number }) => void): void
    removeModelsUpdatedListener(): void

    isConversationBusy(conversationId: string): Promise<{ busy: boolean; replyId?: string }>
    abortStream(replyId: string): Promise<void>

    // signatures kept identical to preload (positional args)
    regenerateMessage(turnId: string): Promise<StartGenResponse>
    rewriteFromTurn(turnId: string, newUserText: string, attachments?: TurnAttachment[], traceId?: string): Promise<StartGenResponse>
    switchModel(turnId: string, modelId: string): Promise<{ reply_id: string }>

    setConversationStrategy(payload: StrategySwitchRequest): Promise<StrategySwitchResponse>
    updateConversationStrategy(payload: ConversationStrategyUpdateRequest): Promise<ConversationStrategyUpdateResponse>
    cancelStrategyReplay(sessionId: string): Promise<{ ok: boolean }>

    onStrategyReplayStarted(cb: (e: IpcRendererEvent, d: StrategyReplayStartedEvent) => void): void
    onStrategyReplayProgress(cb: (e: IpcRendererEvent, d: StrategyReplayProgressEvent) => void): void
    onStrategyReplayDone(cb: (e: IpcRendererEvent, d: StrategyReplayDoneEvent) => void): void

    settings: {
        get(): Promise<SettingsSnapshot>
        updateApp(patch: AppSettingsPatch): Promise<AppSettings>
        getModelDefaultParams(): Promise<ModelDefaultParams>
        setModelDefaultParams(patch: Partial<ModelDefaultParams>): Promise<ModelDefaultParams>
        upsertModelOverride(input: {
            modelId: string
            enabled?: boolean
            params?: Record<string, unknown>
            requirements?: Record<string, unknown>
        }): Promise<ModelOverrideRecord>
        upsertStrategyOverride(input: {
            strategyId: string
            enabled?: boolean
            params?: Record<string, unknown>
            allowlist?: string[]
        }): Promise<StrategyOverrideRecord>
        setToolEnabled(toolKey: string, enabled: boolean): Promise<ToolSetting>
        setToolPermission(toolKey: string, permissions: ToolPermissions): Promise<ToolSetting>
        export(): Promise<SettingsBundle>
        import(bundle: SettingsBundle): Promise<{ ok: true }>
    }

    strategies: {
        list(): Promise<StrategyInfo[]>
        getActive(conversationId: string): Promise<StrategyActiveInfo>
        switch(conversationId: string, strategyId: string): Promise<StrategyActiveInfo>
        getPrefs(): Promise<StrategyPrefs>
        setPrefs(next: StrategyPrefsInput): Promise<StrategyPrefs>
        getUsageCounts(): Promise<StrategyUsageCounts>
        getParams(strategyId: string): Promise<StrategyParams>
        setParams(strategyId: string, params: StrategyParams): Promise<StrategyParams>
        disable(strategyId: string, input: { reassignTo: string }): Promise<{ ok: true }>
        uninstall(strategyId: string, input: { reassignTo: string }): Promise<{ ok: true }>
    }

    strategyDev: {
        compileAndTest(input: StrategyDevCompileRequest): Promise<StrategyDevCompileResult>
        save(input: StrategyDevSaveRequest): Promise<StrategyDevSaveResult>
        reload(input: StrategyDevReloadRequest): Promise<StrategyDevReloadResult>
        getSnapshot(input: StrategyDevSnapshotRequest): Promise<StrategyDevSnapshotResult>
        openChat(input: StrategyDevOpenChatRequest): Promise<StrategyDevOpenChatResult>
        openSourceFolder(input: StrategyDevOpenSourceFolderRequest): Promise<StrategyDevOpenSourceFolderResult>
        recordTest(input: { strategyId: string; status: 'passed' | 'failed'; diagnostics?: StrategyDevCompileResult['diagnostics'] }): Promise<{ ok: true }>
        remove(input: { strategyId: string }): Promise<{ ok: true }>
        onEvent(cb: (e: IpcRendererEvent, d: StrategyDevEvent) => void): void
        removeEventListener(): void
    }

    getProvidersConfig(): Promise<ProviderSettings>
    setProviderConfig(providerId: string, patch: { enabled?: boolean; apiKey?: string; apiHost?: string }): Promise<ProviderSettings>
    checkProvider(providerId: string): Promise<{ ok: boolean; error?: string }>
    testProviderModel(providerId: string, modelId: string): Promise<ProviderTestResult>
    listModels(): Promise<LLMModelConfig[]>
    addProviderModel(input: { providerId: string; modelId: string; modelName?: string }): Promise<LLMModelConfig[]>
    updateProviderModel(input: { providerId: string; modelId: string; nextModelId: string; modelName?: string }): Promise<LLMModelConfig[]>
    deleteProviderModel(input: { providerId: string; modelId: string }): Promise<LLMModelConfig[]>
    setModelOverride(providerId: string, modelId: string, override: ProviderModelOverride): Promise<ProviderSettings>
    resetModelOverride(providerId: string, modelId: string): Promise<ProviderSettings>
    resetApiHost(providerId: string): Promise<ProviderSettings>
    refreshProviderModels(providerId: string): Promise<LLMModelConfig[]>

    openUserDataPath(): Promise<{ ok: true; path: string }>
    getUserDataPath(): Promise<string>
    openStrategiesPath(): Promise<{ ok: true; path: string }>
    openExternal(url: string): Promise<{ ok: true }>
    resetStrategies(): Promise<{ ok: true }>
    clearCache(): Promise<{ ok: true }>
    exportLogs(args?: { conversationId?: string; traceId?: string; limit?: number }): Promise<string>

    on(channel: string, listener: (...args: unknown[]) => void): void
    removeListener(channel: string, listener: (...args: unknown[]) => void): void
}

declare global { interface Window { chatAPI: ChatAPI } }
