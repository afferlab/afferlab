import { BrowserWindow, type BrowserWindowConstructorOptions } from 'electron'
import path from 'node:path'

export function createMainWindow(args: {
    publicPath: string
    rendererDist: string
    preloadPath: string
    devServerUrl?: string
}): BrowserWindow {
    const windowOptions: BrowserWindowConstructorOptions = {
        icon: path.join(args.publicPath, 'electron-vite.svg'),
        width: 920,
        height: 590,
        minWidth: 750,
        minHeight: 500,
        frame: true,
        transparent: true,
        backgroundColor: '#00000000',
        titleBarStyle: 'hidden',
        trafficLightPosition: { x: 24, y: 20 },
        webPreferences: {
            preload: args.preloadPath,
        },
    }

    ;(windowOptions as BrowserWindowConstructorOptions & { scrollBounce?: boolean }).scrollBounce = true

    const win = new BrowserWindow(windowOptions)

    win.webContents.on('did-finish-load', () => {
        win.webContents.send('main-process-message', (new Date()).toLocaleString())
    })

    if (args.devServerUrl) {
        void win.loadURL(args.devServerUrl)
    } else {
        void win.loadFile(path.join(args.rendererDist, 'index.html'))
    }

    return win
}
