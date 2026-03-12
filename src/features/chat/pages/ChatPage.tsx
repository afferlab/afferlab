import { useCallback, useRef } from "react"
import ChatArea from "@/features/chat/components/ChatArea"
import ChatInput from "@/features/chat/components/ChatInput"
import DevPanel from "@/features/strategy-dev/components/DevPanel"
import { useChatStore } from "@/features/chat/state/chatStore"
import { useDevUiStore } from "@/features/strategy-dev/state/devUiStore"
import { Navigate } from "react-router-dom"
import { Plus } from "lucide-react"
import { useFileDrop } from "@/features/chat/attachments/hooks/useFileDrop"

const DEV_PANEL_WIDTH = 360

export default function ChatPage() {
    const selectedConversationId = useChatStore((s) => s.selectedConversationId)
    const conversations = useChatStore((s) => s.conversations)
    const selectedConversation = conversations.find((c) => c.id === selectedConversationId) ?? null
    const isDevConversation = Boolean(selectedConversation?.strategy_id?.startsWith("dev:"))
    const devPanelOpen = useDevUiStore((s) => s.devPanelOpen)
    const inputDropHandlerRef = useRef<((files: File[]) => void | Promise<void>) | null>(null)

    const registerInputDropHandler = useCallback((handler: ((files: File[]) => void | Promise<void>) | null) => {
        inputDropHandlerRef.current = handler
    }, [])

    const pageDrop = useFileDrop<HTMLDivElement>({
        onFiles: async (files) => {
            const handler = inputDropHandlerRef.current
            if (!handler) return
            await handler(files)
        },
    })

    if (!selectedConversationId) {
        return <Navigate to="/looma" replace />
    }

    return (
        <div className="flex flex-1 min-h-0 relative">
            <div
                className={`relative flex flex-col flex-1 min-w-0 ${pageDrop.isDraggingOver ? 'cursor-copy' : ''}`}
                {...pageDrop.dropZoneProps}
            >
                {pageDrop.isDraggingOver ? (
                    <div className="pointer-events-none absolute inset-0 z-20 grid place-items-center bg-black/40 cursor-copy">
                        <div className="grid h-14 w-14 place-items-center rounded-full bg-emerald-500 text-white">
                            <Plus className="h-7 w-7" />
                        </div>
                    </div>
                ) : null}
                <ChatArea className="flex-1 min-h-0" />
                <ChatInput onRegisterFileDropHandler={registerInputDropHandler} />
            </div>
            {isDevConversation && devPanelOpen ? (
                <div className="shrink-0 h-full border-l border-border/60" style={{ width: DEV_PANEL_WIDTH }}>
                    <DevPanel />
                </div>
            ) : null}
        </div>
    )
}
