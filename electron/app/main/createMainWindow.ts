import { BrowserWindow, screen, type BrowserWindowConstructorOptions } from 'electron'
import path from 'node:path'

export function createMainWindow(args: {
    publicPath: string
    rendererDist: string
    preloadPath: string
    devServerUrl?: string
}): BrowserWindow {
    const windowOptions: BrowserWindowConstructorOptions = {
        icon: path.join(args.publicPath, 'electron-vite.svg'),
        width: 1100,
        height: 720,
        minWidth: 750,
        minHeight: 500,
        show: false,
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

export function createSplashWindow(args: {
    publicPath: string
}): BrowserWindow {
    const width = 260
    const height = 140
    const splash = new BrowserWindow({
        width,
        height,
        frame: false,
        transparent: true,
        resizable: false,
        movable: true,
        minimizable: false,
        maximizable: false,
        fullscreenable: false,
        alwaysOnTop: true,
        center: false,
        skipTaskbar: true,
        backgroundColor: '#00000000',
        hasShadow: false,
        webPreferences: {
            devTools: false,
        },
    })

    const { bounds } = screen.getPrimaryDisplay()
    const x = Math.round(bounds.x + (bounds.width - width) / 2)
    const y = Math.round(bounds.y + (bounds.height - height) / 2)
    splash.setPosition(x, y)

    void splash.loadFile(path.join(args.publicPath, 'splash.html'))

    return splash
}
