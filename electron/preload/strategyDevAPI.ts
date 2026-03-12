import type { IpcRendererEvent } from 'electron'
import type {
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
} from '../../contracts/index'
import { IPC } from '../ipc/channels'
import { safeInvoke, safeOn, safeRemoveAll } from './ipcHelpers'

export function createStrategyDevAPI() {
    return {
        compileAndTest: (input: StrategyDevCompileRequest) =>
            safeInvoke<StrategyDevCompileResult>(IPC.STRATEGY_DEV_COMPILE_AND_TEST, input),
        save: (input: StrategyDevSaveRequest) =>
            safeInvoke<StrategyDevSaveResult>(IPC.STRATEGY_DEV_SAVE, input),
        reload: (input: StrategyDevReloadRequest) =>
            safeInvoke<StrategyDevReloadResult>(IPC.STRATEGY_DEV_RELOAD, input),
        getSnapshot: (input: StrategyDevSnapshotRequest) =>
            safeInvoke<StrategyDevSnapshotResult>(IPC.STRATEGY_DEV_GET_SNAPSHOT, input),
        openChat: (input: StrategyDevOpenChatRequest) =>
            safeInvoke<StrategyDevOpenChatResult>(IPC.STRATEGY_DEV_OPEN_CHAT, input),
        openSourceFolder: (input: StrategyDevOpenSourceFolderRequest) =>
            safeInvoke<StrategyDevOpenSourceFolderResult>(IPC.STRATEGY_DEV_OPEN_SOURCE_FOLDER, input),
        recordTest: (input: { strategyId: string; status: 'passed' | 'failed'; diagnostics?: StrategyDevCompileResult['diagnostics'] }) =>
            safeInvoke<{ ok: true }>(IPC.STRATEGY_DEV_RECORD_TEST, input),
        remove: (input: { strategyId: string }) =>
            safeInvoke<{ ok: true }>(IPC.STRATEGY_DEV_REMOVE, input),
        onEvent: (cb: (e: IpcRendererEvent, d: StrategyDevEvent) => void) => {
            safeOn<StrategyDevEvent>(IPC.STRATEGY_DEV_EVENT, cb)
        },
        removeEventListener: () => safeRemoveAll(IPC.STRATEGY_DEV_EVENT),
    }
}
