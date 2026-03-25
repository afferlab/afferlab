export type UpdateReadyPayload = {
    version: string
}

export type UpdaterStatusSnapshot =
    | { kind: 'idle' }
    | { kind: 'unavailable'; message: string }
    | { kind: 'checking' }
    | { kind: 'current' }
    | { kind: 'available'; version: string }
    | { kind: 'ready'; version: string }
    | { kind: 'error'; message: string }

export interface UpdaterAPI {
    onUpdateReady(cb: (data: UpdateReadyPayload) => void): () => void
    onStatusChange(cb: (data: UpdaterStatusSnapshot) => void): () => void
    getStatus(): Promise<UpdaterStatusSnapshot>
    check(): Promise<UpdaterStatusSnapshot>
    restart(): void
}

declare global {
    interface Window {
        updater: UpdaterAPI
    }
}

export {}
