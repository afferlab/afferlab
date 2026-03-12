import { ipcMain } from 'electron'
import { IPC } from '../channels'
import { exportRuntimeLogs } from '../../core/logging/runtimeLogger'

export function registerDebugIPC(): void {
    ipcMain.handle(IPC.DEBUG_EXPORT_LOGS, (_event, args?: {
        conversationId?: string
        traceId?: string
        limit?: number
    }) => {
        return exportRuntimeLogs(args)
    })
}
