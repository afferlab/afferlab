import { ipcMain } from 'electron'
import { IPC } from '../channels'
import type {
    StrategySwitchRequest,
    ConversationStrategyUpdateRequest,
    StrategyPrefsInput,
    StrategyDisableInput,
    StrategySwitchInput,
} from '../../../contracts/index'
import {
    cancelStrategyReplay,
    disableStrategy,
    getActiveStrategy,
    getStrategyParams,
    getStrategyPrefsSnapshot,
    getStrategyUsageCounts,
    listStrategyInfo,
    setConversationStrategy,
    setStrategyParams,
    switchStrategy,
    uninstallStrategy,
    updateConversationStrategy,
    updateStrategyPrefs,
} from '../../engine/strategy/application/strategyService'

export function registerStrategyIPC(): void {
    ipcMain.handle(IPC.SET_CONVERSATION_STRATEGY, (event, req: StrategySwitchRequest) => (
        setConversationStrategy(req, event.sender?.id)
    ))

    ipcMain.handle(IPC.CANCEL_STRATEGY_REPLAY, (_event, { sessionId }: { sessionId: string }) => (
        cancelStrategyReplay(sessionId)
    ))

    ipcMain.handle(IPC.CONVERSATION_UPDATE_STRATEGY, (event, args: ConversationStrategyUpdateRequest) => (
        updateConversationStrategy(args, event.sender?.id)
    ))

    ipcMain.handle(IPC.STRATEGIES_LIST, () => listStrategyInfo())

    ipcMain.handle(IPC.STRATEGIES_GET_ACTIVE, (_event, { conversationId }: { conversationId: string }) => (
        getActiveStrategy(conversationId)
    ))

    ipcMain.handle(IPC.STRATEGIES_SWITCH, (event, args: StrategySwitchInput) => (
        switchStrategy(args, event.sender?.id)
    ))

    ipcMain.handle(IPC.STRATEGIES_GET_PREFS, () => getStrategyPrefsSnapshot())

    ipcMain.handle(IPC.STRATEGIES_SET_PREFS, (_event, next: StrategyPrefsInput) => updateStrategyPrefs(next))

    ipcMain.handle(IPC.STRATEGIES_GET_USAGE_COUNTS, () => getStrategyUsageCounts())

    ipcMain.handle(IPC.STRATEGIES_GET_PARAMS, (_event, input: { strategyId: string }) => getStrategyParams(input))

    ipcMain.handle(IPC.STRATEGIES_SET_PARAMS, (_event, input: { strategyId: string; params?: Record<string, unknown> }) => (
        setStrategyParams(input)
    ))

    ipcMain.handle(IPC.STRATEGIES_DISABLE, (_event, input: StrategyDisableInput) => disableStrategy(input))

    ipcMain.handle(IPC.STRATEGIES_UNINSTALL, (_event, input: StrategyDisableInput) => uninstallStrategy(input))
}
