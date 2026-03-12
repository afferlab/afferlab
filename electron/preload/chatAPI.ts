import type { IpcRendererEvent } from 'electron'
import { IPC } from '../ipc/channels'
import type {
    AppSettings,
    AppSettingsPatch,
    ConversationStrategyUpdateRequest,
    ConversationStrategyUpdateResponse,
    ConversationTitleUpdatedEventData,
    LlmStreamChunkEventData,
    LlmStreamDoneEventData,
    LlmStreamStartedEventData,
    ModelDefaultParams,
    ModelOverrideRecord,
    SendMessagePayload,
    PrepareAttachmentPayload,
    PrepareAttachmentResult,
    SettingsBundle,
    SettingsSnapshot,
    StartGenResponse,
    TurnAttachment,
    StrategyReplayDoneEvent,
    StrategyReplayProgressEvent,
    StrategyReplayStartedEvent,
    StrategySwitchRequest,
    StrategySwitchResponse,
    StrategyOverrideRecord,
    ToolPermissions,
    ToolSetting,
} from '../../contracts/index'
import { safeInvoke, safeOn, safeRemoveAll } from './ipcHelpers'
import { createStrategyAPI } from './strategyAPI'
import { createStrategyDevAPI } from './strategyDevAPI'

export function createChatAPI() {
    return {
        // conversations
        createConversation: () => safeInvoke(IPC.CREATE_CONVERSATION),
        getAllConversations: () => safeInvoke(IPC.GET_ALL_CONVERSATIONS),
        deleteConversation: (id: string) => safeInvoke(IPC.DELETE_CONVERSATION, id),
        resetConversationHistory: (id: string) => safeInvoke(IPC.RESET_CONVERSATION_HISTORY, id),
        renameConversation: (id: string, title: string) =>
            safeInvoke(IPC.RENAME_CONVERSATION, id, title),
        updateConversationModel: (id: string, model: string) =>
            safeInvoke(IPC.UPDATE_CONVERSATION_MODEL, id, model),

        // messages
        getMessages: (conversationId: string) => safeInvoke(IPC.GET_MESSAGES, conversationId),
        sendMessage: (msg: SendMessagePayload) =>
            safeInvoke<StartGenResponse>(IPC.SEND_MESSAGE, msg),
        prepareAttachment: (input: PrepareAttachmentPayload) =>
            safeInvoke<PrepareAttachmentResult>(IPC.ATTACHMENT_PREPARE, input),

        // models
        getModels: () => safeInvoke(IPC.GET_MODELS),
        getModelsWithStatus: () => safeInvoke(IPC.GET_MODELS_WITH_STATUS),
        getModelSettings: (opts?: { includeSecrets?: boolean }) => safeInvoke(IPC.GET_MODEL_SETTINGS, opts),
        updateProviderConfig: (provider: string, patch: { apiKey?: string; baseUrl?: string; extra?: Record<string, unknown> }) =>
            safeInvoke(IPC.UPDATE_PROVIDER_CONFIG, { provider, patch }),
        updateModelOverride: (modelId: string, patch: { enabled?: boolean; defaultsOverride?: Record<string, unknown>; endpointOverride?: string; providerOverride?: string; notes?: string }) =>
            safeInvoke(IPC.UPDATE_MODEL_OVERRIDE, { modelId, patch }),
        setDefaultModels: (defaults: { chatModelId?: string; embeddingModelId?: string }) =>
            safeInvoke(IPC.SET_DEFAULT_MODELS, defaults),
        reloadModels: () => safeInvoke(IPC.RELOAD_MODELS),

        // stream events
        onStreamStarted: (cb: (e: IpcRendererEvent, d: LlmStreamStartedEventData) => void) =>
            safeOn<LlmStreamStartedEventData>(IPC.STREAM_STARTED, cb),
        removeStreamStartedListener: () =>
            safeRemoveAll(IPC.STREAM_STARTED),

        onStreamChunk: (cb: (e: IpcRendererEvent, d: LlmStreamChunkEventData) => void) =>
            safeOn<LlmStreamChunkEventData>(IPC.STREAM_CHUNK, cb),
        removeStreamChunkListener: () =>
            safeRemoveAll(IPC.STREAM_CHUNK),

        onStreamDone: (cb: (e: IpcRendererEvent, d: LlmStreamDoneEventData) => void) =>
            safeOn<LlmStreamDoneEventData>(IPC.STREAM_DONE, cb),
        removeStreamDoneListener: () =>
            safeRemoveAll(IPC.STREAM_DONE),

        clearStreamHandlers: () => {
            safeRemoveAll(IPC.STREAM_STARTED)
            safeRemoveAll(IPC.STREAM_CHUNK)
            safeRemoveAll(IPC.STREAM_DONE)
        },

        onConversationTitleUpdated: (cb: (e: IpcRendererEvent, d: ConversationTitleUpdatedEventData) => void) =>
            safeOn<ConversationTitleUpdatedEventData>(IPC.CONVERSATION_TITLE_UPDATED, cb),
        removeConversationTitleUpdatedListener: () =>
            safeRemoveAll(IPC.CONVERSATION_TITLE_UPDATED),

        onModelsUpdated: (cb: (e: IpcRendererEvent, d: { at: number }) => void) =>
            safeOn<{ at: number }>(IPC.MODELS_UPDATED, cb),
        removeModelsUpdatedListener: () =>
            safeRemoveAll(IPC.MODELS_UPDATED),

        // busy & abort
        isConversationBusy: (conversationId: string) =>
            safeInvoke<{ busy: boolean; replyId?: string }>(IPC.IS_CONV_BUSY, conversationId),
        abortStream: (replyId: string) => safeInvoke<void>(IPC.ABORT_STREAM, replyId),

        // turn ops
        regenerateMessage: (turnId: string) =>
            safeInvoke<StartGenResponse>(IPC.REGENERATE, { turnId }),
        switchModel: (turnId: string, modelId: string) =>
            safeInvoke(IPC.SWITCH_MODEL, { turnId, modelId }),
        rewriteFromTurn: (turnId: string, newUserText: string, attachments?: TurnAttachment[], traceId?: string) =>
            safeInvoke<StartGenResponse>(IPC.REWRITE_FROM_TURN, { turnId, newUserText, attachments, traceId }),
        getTurnAnswers: (turnId: string) =>
            safeInvoke(IPC.GET_TURN_ANSWERS, turnId),

        setConversationStrategy: (payload: StrategySwitchRequest) =>
            safeInvoke<StrategySwitchResponse>(IPC.SET_CONVERSATION_STRATEGY, payload),
        updateConversationStrategy: (payload: ConversationStrategyUpdateRequest) =>
            safeInvoke<ConversationStrategyUpdateResponse>(IPC.CONVERSATION_UPDATE_STRATEGY, payload),
        cancelStrategyReplay: (sessionId: string) =>
            safeInvoke<{ ok: boolean }>(IPC.CANCEL_STRATEGY_REPLAY, { sessionId }),

        strategies: createStrategyAPI(),
        strategyDev: createStrategyDevAPI(),

        onStrategyReplayStarted: (cb: (e: IpcRendererEvent, d: StrategyReplayStartedEvent) => void) =>
            safeOn<StrategyReplayStartedEvent>(IPC.STRATEGY_REPLAY_STARTED, cb),
        onStrategyReplayProgress: (cb: (e: IpcRendererEvent, d: StrategyReplayProgressEvent) => void) =>
            safeOn<StrategyReplayProgressEvent>(IPC.STRATEGY_REPLAY_PROGRESS, cb),
        onStrategyReplayDone: (cb: (e: IpcRendererEvent, d: StrategyReplayDoneEvent) => void) =>
            safeOn<StrategyReplayDoneEvent>(IPC.STRATEGY_REPLAY_DONE, cb),

        // list view
        getChatItems: (conversationId: string) =>
            safeInvoke(IPC.GET_CHAT_ITEMS, conversationId),

        settings: {
            get: () => safeInvoke<SettingsSnapshot>(IPC.SETTINGS_GET),
            updateApp: (patch: AppSettingsPatch) =>
                safeInvoke<AppSettings>(IPC.SETTINGS_UPDATE_APP, patch),
            getModelDefaultParams: () =>
                safeInvoke(IPC.SETTINGS_GET_MODEL_DEFAULT_PARAMS),
            setModelDefaultParams: (patch: Partial<ModelDefaultParams>) =>
                safeInvoke(IPC.SETTINGS_SET_MODEL_DEFAULT_PARAMS, patch),
            upsertModelOverride: (input: { modelId: string; enabled?: boolean; params?: Record<string, unknown>; requirements?: Record<string, unknown> }) =>
                safeInvoke<ModelOverrideRecord>(IPC.SETTINGS_UPSERT_MODEL_OVERRIDE, input),
            upsertStrategyOverride: (input: { strategyId: string; enabled?: boolean; params?: Record<string, unknown>; allowlist?: string[] }) =>
                safeInvoke<StrategyOverrideRecord>(IPC.SETTINGS_UPSERT_STRATEGY_OVERRIDE, input),
            setToolEnabled: (toolKey: string, enabled: boolean) =>
                safeInvoke<ToolSetting>(IPC.SETTINGS_SET_TOOL_ENABLED, { toolKey, enabled }),
            setToolPermission: (toolKey: string, permissions: ToolPermissions) =>
                safeInvoke<ToolSetting>(IPC.SETTINGS_SET_TOOL_PERMISSION, { toolKey, permissions }),
            export: () => safeInvoke<SettingsBundle>(IPC.SETTINGS_EXPORT),
            import: (bundle: SettingsBundle) => safeInvoke<{ ok: true }>(IPC.SETTINGS_IMPORT, bundle),
        },

        getProvidersConfig: () =>
            safeInvoke(IPC.SETTINGS_GET_PROVIDERS_CONFIG),
        setProviderConfig: (providerId: string, patch: { enabled?: boolean; apiKey?: string; apiHost?: string }) =>
            safeInvoke(IPC.SETTINGS_SET_PROVIDER_CONFIG, { providerId, patch }),
        checkProvider: (providerId: string) =>
            safeInvoke(IPC.SETTINGS_CHECK_PROVIDER, { providerId }),
        testProviderModel: (providerId: string, modelId: string) =>
            safeInvoke(IPC.SETTINGS_TEST_PROVIDER_MODEL, { providerId, modelId }),
        listModels: () =>
            safeInvoke(IPC.SETTINGS_LIST_MODELS),
        addProviderModel: (input: { providerId: string; modelId: string; modelName?: string }) =>
            safeInvoke(IPC.SETTINGS_ADD_PROVIDER_MODEL, input),
        updateProviderModel: (input: { providerId: string; modelId: string; nextModelId: string; modelName?: string }) =>
            safeInvoke(IPC.SETTINGS_UPDATE_PROVIDER_MODEL, input),
        deleteProviderModel: (input: { providerId: string; modelId: string }) =>
            safeInvoke(IPC.SETTINGS_DELETE_PROVIDER_MODEL, input),
        setModelOverride: (providerId: string, modelId: string, override: { temperature?: number; maxTokens?: number; top_p?: number; stop?: string[] }) =>
            safeInvoke(IPC.SETTINGS_SET_MODEL_OVERRIDE, { providerId, modelId, override }),
        resetModelOverride: (providerId: string, modelId: string) =>
            safeInvoke(IPC.SETTINGS_RESET_MODEL_OVERRIDE, { providerId, modelId }),
        resetApiHost: (providerId: string) =>
            safeInvoke(IPC.SETTINGS_RESET_API_HOST, { providerId }),
        refreshProviderModels: (providerId: string) =>
            safeInvoke(IPC.SETTINGS_REFRESH_PROVIDER_MODELS, { providerId }),

        openUserDataPath: () =>
            safeInvoke<{ ok: true; path: string }>(IPC.OPEN_USER_DATA_PATH),
        getUserDataPath: () =>
            safeInvoke<string>(IPC.GET_USER_DATA_PATH),
        openStrategiesPath: () =>
            safeInvoke<{ ok: true; path: string }>(IPC.OPEN_STRATEGIES_PATH),
        openExternal: (url: string) =>
            safeInvoke<{ ok: true }>(IPC.OPEN_EXTERNAL_URL, url),
        resetStrategies: () =>
            safeInvoke<{ ok: true }>(IPC.RESET_STRATEGIES),
        clearCache: () =>
            safeInvoke<{ ok: true }>(IPC.CLEAR_CACHE),
        exportLogs: (args?: { conversationId?: string; traceId?: string; limit?: number }) =>
            safeInvoke<string>(IPC.DEBUG_EXPORT_LOGS, args),
    }
}
