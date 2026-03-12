import React from 'react'
import ReactDOM from 'react-dom/client'
import App from './App.tsx'
import "./global.css"
import ThemeProvider from "@/app/providers/ThemeProvider"
import './features/settings/web-search/runtime/webSearchProviders'
import './features/settings/web-search/runtime/webFetchProviders'

ReactDOM.createRoot(document.getElementById("root")!).render(
    <React.StrictMode>
        <ThemeProvider>
            <App />
        </ThemeProvider>
    </React.StrictMode>
)

// Use contextBridge
window.ipcRenderer?.on?.('main-process-message', (_event, message) => {
  console.log(message)
})
