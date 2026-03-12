import { registerConversationIPC } from './handlers/conversations'
import { registerMessageIPC } from './handlers/messages'
import { registerTurnIPC } from './handlers/turns'
import { registerModelsIPC } from './handlers/models'
import { registerMemoryCloudIPC } from './handlers/memoryCloud'
import { registerStrategyIPC } from './handlers/strategy'
import { registerStrategyDevIPC } from './handlers/strategyDev'
import { registerToolsIPC } from './handlers/tools'
import { registerSettingsIPC } from './handlers/settings'
import { registerWebSearchIPC } from './handlers/webSearch'
import { registerPrivacyIPC } from './handlers/privacy'
import { registerDebugIPC } from './handlers/debug'

export function registerAllIPC() {
    registerModelsIPC()
    registerConversationIPC()
    registerMessageIPC()
    registerTurnIPC()
    registerStrategyIPC()
    registerStrategyDevIPC()
    registerMemoryCloudIPC()
    registerToolsIPC()
    registerSettingsIPC()
    registerWebSearchIPC()
    registerPrivacyIPC()
    registerDebugIPC()
}
