import { ipcMain } from 'electron'
import { IPC } from '../channels'
import type {
    StrategyDevCompileRequest,
    StrategyDevDiagnostic,
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
} from '../../../contracts/index'
import {
    compileAndTestStrategy,
    getStrategyDevSnapshot,
    openStrategyDevChat,
    openStrategyDevSourceFolder,
    recordStrategyDevTest,
    reloadStrategyDev,
    removeStrategyDev,
    saveStrategyDev,
} from '../../engine/strategy/dev/strategyDevService'


export function registerStrategyDevIPC(): void {
    ipcMain.handle(IPC.STRATEGY_DEV_COMPILE_AND_TEST, (_event, input: StrategyDevCompileRequest) => (
        compileAndTestStrategy(input)
    ))

    ipcMain.handle(IPC.STRATEGY_DEV_SAVE, (_event, input: StrategyDevSaveRequest): Promise<StrategyDevSaveResult> => (
        saveStrategyDev(input)
    ))

    ipcMain.handle(IPC.STRATEGY_DEV_RELOAD, (_event, input: StrategyDevReloadRequest): Promise<StrategyDevReloadResult> => (
        reloadStrategyDev(input)
    ))

    ipcMain.handle(IPC.STRATEGY_DEV_GET_SNAPSHOT, (_event, input: StrategyDevSnapshotRequest): Promise<StrategyDevSnapshotResult> => (
        getStrategyDevSnapshot(input)
    ))

    ipcMain.handle(IPC.STRATEGY_DEV_OPEN_CHAT, (event, input: StrategyDevOpenChatRequest): Promise<StrategyDevOpenChatResult> => (
        openStrategyDevChat(input, event.sender?.id)
    ))

    ipcMain.handle(
        IPC.STRATEGY_DEV_OPEN_SOURCE_FOLDER,
        (_event, input: StrategyDevOpenSourceFolderRequest): Promise<StrategyDevOpenSourceFolderResult> => (
            openStrategyDevSourceFolder(input)
        ),
    )

    ipcMain.handle(
        IPC.STRATEGY_DEV_RECORD_TEST,
        (_event, input: { strategyId: string; status: 'passed' | 'failed'; diagnostics?: StrategyDevDiagnostic[] }) => (
            recordStrategyDevTest(input)
        ),
    )

    ipcMain.handle(IPC.STRATEGY_DEV_REMOVE, (_event, input: { strategyId: string }) => removeStrategyDev(input))
}
