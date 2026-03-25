import { IPC } from '../ipc/channels'
import { safeInvoke, safeOn, safeSend } from './ipcHelpers'
import type {
    UpdateReadyPayload,
    UpdaterAPI,
    UpdaterStatusSnapshot,
} from '../../contracts/ipc/updaterAPI'

const updateReadyListeners = new Set<(data: UpdateReadyPayload) => void>()
const updateStatusListeners = new Set<(data: UpdaterStatusSnapshot) => void>()
let latestUpdateReadyPayload: UpdateReadyPayload | null = null
let latestUpdateStatus: UpdaterStatusSnapshot = { kind: 'idle' }
let isBound = false

function bindUpdateReadyListener(): void {
    if (isBound) return
    isBound = true
    safeOn<UpdateReadyPayload>(IPC.UPDATE_READY, (_event, data) => {
        latestUpdateReadyPayload = data
        for (const listener of updateReadyListeners) {
            listener(data)
        }
    })
    safeOn<UpdaterStatusSnapshot>(IPC.UPDATE_STATUS, (_event, data) => {
        latestUpdateStatus = data
        for (const listener of updateStatusListeners) {
            listener(data)
        }
    })
}

export function createUpdaterAPI(): UpdaterAPI {
    bindUpdateReadyListener()

    return {
        onUpdateReady: (callback) => {
            updateReadyListeners.add(callback)
            if (latestUpdateReadyPayload) {
                callback(latestUpdateReadyPayload)
            }
            return () => {
                updateReadyListeners.delete(callback)
            }
        },
        onStatusChange: (callback) => {
            updateStatusListeners.add(callback)
            callback(latestUpdateStatus)
            return () => {
                updateStatusListeners.delete(callback)
            }
        },
        getStatus: async () => {
            const status = await safeInvoke<UpdaterStatusSnapshot>(IPC.UPDATE_GET_STATUS)
            latestUpdateStatus = status
            return status
        },
        check: async () => {
            const status = await safeInvoke<UpdaterStatusSnapshot>(IPC.UPDATE_CHECK)
            latestUpdateStatus = status
            return status
        },
        restart: () => {
            safeSend(IPC.UPDATE_RESTART)
        },
    }
}
