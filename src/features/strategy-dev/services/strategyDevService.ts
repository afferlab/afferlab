import type {
    ChatAPI,
    StrategyDevCompileRequest,
    StrategyDevCompileResult,
    StrategyDevSaveRequest,
    StrategyDevSaveResult,
    StrategyDevReloadRequest,
    StrategyDevReloadResult,
    StrategyDevOpenChatRequest,
    StrategyDevOpenChatResult,
    StrategyDevOpenSourceFolderRequest,
    StrategyDevOpenSourceFolderResult,
    StrategyDevCompileResult as StrategyDevCompileResultType,
    StrategyDevSnapshotRequest,
    StrategyDevSnapshotResult,
} from '@contracts'
import { withErrorHandling } from '@/shared/services/ipc/utils'

function requireChatAPI(): ChatAPI {
    if (!window.chatAPI) {
        throw new Error('chatAPI is not available')
    }
    return window.chatAPI
}

export const strategyDevService = {
    compileAndTest: (input: StrategyDevCompileRequest): Promise<StrategyDevCompileResult> =>
        withErrorHandling(() => requireChatAPI().strategyDev.compileAndTest(input)),
    save: (input: StrategyDevSaveRequest): Promise<StrategyDevSaveResult> =>
        withErrorHandling(() => requireChatAPI().strategyDev.save(input)),
    reload: (input: StrategyDevReloadRequest): Promise<StrategyDevReloadResult> =>
        withErrorHandling(() => requireChatAPI().strategyDev.reload(input)),
    getSnapshot: (input: StrategyDevSnapshotRequest): Promise<StrategyDevSnapshotResult> =>
        withErrorHandling(() => requireChatAPI().strategyDev.getSnapshot(input)),
    openChat: (input: StrategyDevOpenChatRequest): Promise<StrategyDevOpenChatResult> =>
        withErrorHandling(() => requireChatAPI().strategyDev.openChat(input)),
    openSourceFolder: (input: StrategyDevOpenSourceFolderRequest): Promise<StrategyDevOpenSourceFolderResult> =>
        withErrorHandling(() => requireChatAPI().strategyDev.openSourceFolder(input)),
    recordTest: (input: { strategyId: string; status: 'passed' | 'failed'; diagnostics?: StrategyDevCompileResultType['diagnostics'] }): Promise<{ ok: true }> =>
        withErrorHandling(() => requireChatAPI().strategyDev.recordTest(input)),
    remove: (input: { strategyId: string }): Promise<{ ok: true }> =>
        withErrorHandling(() => requireChatAPI().strategyDev.remove(input)),
}
