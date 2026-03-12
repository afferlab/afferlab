import { IPC } from '../ipc/channels'
import type { StrategyActiveInfo, StrategyInfo, StrategyPrefs, StrategyPrefsInput, StrategyUsageCounts, StrategyParams } from '../../contracts/index'
import { safeInvoke } from './ipcHelpers'

export function createStrategyAPI() {
    return {
        list: () => safeInvoke<StrategyInfo[]>(IPC.STRATEGIES_LIST),
        getActive: (conversationId: string) =>
            safeInvoke<StrategyActiveInfo>(IPC.STRATEGIES_GET_ACTIVE, { conversationId }),
        switch: (conversationId: string, strategyId: string) =>
            safeInvoke<StrategyActiveInfo>(IPC.STRATEGIES_SWITCH, { conversationId, strategyId }),
        getPrefs: () => safeInvoke<StrategyPrefs>(IPC.STRATEGIES_GET_PREFS),
        setPrefs: (next: StrategyPrefsInput) =>
            safeInvoke<StrategyPrefs>(IPC.STRATEGIES_SET_PREFS, next),
        getUsageCounts: () => safeInvoke<StrategyUsageCounts>(IPC.STRATEGIES_GET_USAGE_COUNTS),
        getParams: (strategyId: string) =>
            safeInvoke<StrategyParams>(IPC.STRATEGIES_GET_PARAMS, { strategyId }),
        setParams: (strategyId: string, params: StrategyParams) =>
            safeInvoke<StrategyParams>(IPC.STRATEGIES_SET_PARAMS, { strategyId, params }),
        disable: (strategyId: string, input: { reassignTo: string }) =>
            safeInvoke<{ ok: true }>(IPC.STRATEGIES_DISABLE, { strategyId, ...input }),
        uninstall: (strategyId: string, input: { reassignTo: string }) =>
            safeInvoke<{ ok: true }>(IPC.STRATEGIES_UNINSTALL, { strategyId, ...input }),
    }
}
