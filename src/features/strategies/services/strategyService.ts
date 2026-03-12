import type { StrategyActiveInfo, StrategyInfo, StrategyPrefs, StrategyPrefsInput, StrategyUsageCounts, StrategyParams } from '@contracts'
import { withErrorHandling } from '@/shared/services/ipc/utils'

function requireChatAPI() {
    if (!window.chatAPI) {
        throw new Error('chatAPI is not available')
    }
    return window.chatAPI
}

export const strategyService = {
    list: () =>
        withErrorHandling(() => requireChatAPI().strategies.list() as Promise<StrategyInfo[]>),
    getActive: (conversationId: string) =>
        withErrorHandling(() => requireChatAPI().strategies.getActive(conversationId) as Promise<StrategyActiveInfo>),
    switch: (conversationId: string, strategyId: string) =>
        withErrorHandling(() => requireChatAPI().strategies.switch(conversationId, strategyId) as Promise<StrategyActiveInfo>),
    getPrefs: () =>
        withErrorHandling(() => requireChatAPI().strategies.getPrefs() as Promise<StrategyPrefs>),
    setPrefs: (next: StrategyPrefsInput) =>
        withErrorHandling(() => requireChatAPI().strategies.setPrefs(next) as Promise<StrategyPrefs>),
    getUsageCounts: () =>
        withErrorHandling(() => requireChatAPI().strategies.getUsageCounts() as Promise<StrategyUsageCounts>),
    getParams: (strategyId: string) =>
        withErrorHandling(() => requireChatAPI().strategies.getParams(strategyId) as Promise<StrategyParams>),
    setParams: (strategyId: string, params: StrategyParams) =>
        withErrorHandling(() => requireChatAPI().strategies.setParams(strategyId, params) as Promise<StrategyParams>),
    disable: (strategyId: string, input: { reassignTo: string }) =>
        withErrorHandling(() => requireChatAPI().strategies.disable(strategyId, input)),
    uninstall: (strategyId: string, input: { reassignTo: string }) =>
        withErrorHandling(() => requireChatAPI().strategies.uninstall(strategyId, input)),
}
