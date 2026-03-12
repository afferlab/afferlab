import { BrowserWindow } from 'electron'
import type { StrategyDevEvent } from '../../../../contracts/index'

const STRATEGY_DEV_EVENT_CHANNEL = 'strategy-dev:event'

export function emitStrategyDevEvent(event: StrategyDevEvent): void {
    for (const win of BrowserWindow.getAllWindows()) {
        if (win.isDestroyed()) continue
        win.webContents.send(STRATEGY_DEV_EVENT_CHANNEL, event)
    }
}
