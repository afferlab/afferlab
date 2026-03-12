import { Outlet } from "react-router-dom"
import { useEffect } from "react"
import { Squircle } from "corner-smoothing"
import Sidebar from "@/features/chat/components/Sidebar"
import { useUIStore } from "@/features/chat/state/uiStore"
import { chatStore, useChatStore } from "@/features/chat/state/chatStore"

export default function ChatShell() {
    const sidebarCollapsed = useUIStore((s) => s.sidebarCollapsed)
    const clearDraftConversation = useChatStore((s) => s.clearDraftConversation)

    useEffect(() => {
        return () => {
            const state = chatStore.getState()
            if (state.draftConversation && state.selectedConversationId === state.draftConversation.id) {
                clearDraftConversation()
            }
        }
    }, [clearDraftConversation])

    return (
        <div className="h-screen w-screen" style={{ backgroundColor: "transparent" }}>
            <Squircle
                cornerRadius={20}
                cornerSmoothing={0.8}
                className="flex h-full w-full"
            >
                <div
                    className={`ui-panel shrink-0 overflow-hidden transition-[width] ${
                        sidebarCollapsed ? "w-0" : "w-[256px]"
                    }`}
                >
                    <Sidebar />
                </div>

                <div className="flex flex-col flex-1 min-h-0 min-w-0 bg-bg-chatarea">
                    <Outlet />
                </div>
            </Squircle>
        </div>
    )
}
