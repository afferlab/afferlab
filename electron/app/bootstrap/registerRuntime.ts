import { app, BrowserWindow } from 'electron'

export function registerRuntime(args: {
    createWindow: () => void
    clearWindow: () => void
    closeDatabase: () => void
}): void {
    app.on('window-all-closed', () => {
        if (process.platform !== 'darwin') {
            app.quit()
            args.clearWindow()
        }
    })

    app.on('before-quit', () => {
        try {
            args.closeDatabase()
        } catch (err) {
            console.error('Failed to close DB:', err)
        }
    })

    app.on('will-quit', () => {
        try {
            args.closeDatabase()
        } catch (err) {
            console.error('Failed to close DB:', err)
        }
    })

    process.on('uncaughtException', (err) => {
        console.error('Uncaught in main:', err)
        try {
            args.closeDatabase()
        } catch (closeErr) {
            console.error('Failed to close DB:', closeErr)
        }
    })

    process.on('SIGTERM', () => {
        try {
            args.closeDatabase()
        } catch (err) {
            console.error('Failed to close DB:', err)
        }
        app.quit()
    })

    app.on('activate', () => {
        if (BrowserWindow.getAllWindows().length === 0) {
            args.createWindow()
        }
    })
}
