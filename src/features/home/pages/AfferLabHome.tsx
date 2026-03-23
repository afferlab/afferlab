import { useNavigate } from "react-router-dom"
import { BookOpen, Globe } from "lucide-react"
import Topbar from "@/features/chat/components/Topbar"
import { Button } from "@/shared/ui/button"
import { useChatStore } from "@/features/chat/state/chatStore"
import RecentConversations from "@/features/home/components/RecentConversations"

const WEBSITE_URL = "https://afferlab.com"
const DOCS_URL = "https://docs.afferlab.com"

export default function AfferLabHome() {
    const createDraftConversation = useChatStore((s) => s.createDraftConversation)
    const navigate = useNavigate()

    const handleNewChat = async () => {
        const settings = await window.chatAPI?.settings?.get?.().catch(() => null)
        const modelId = settings?.appSettings?.last_used_model_id
            ?? settings?.appSettings?.active_model_id
            ?? ""
        const strategyId = settings?.appSettings?.active_strategy_id ?? null
        createDraftConversation({
            model: modelId,
            strategy_id: strategyId,
        })
        navigate("/")
    }

    return (
        <div className="relative flex flex-1 min-h-0 flex-col">
            <Topbar showMemoryCloud={false} showDevToggle={false} />
            <main className="flex-1 min-h-0 overflow-y-auto pt-6">
                <div className="flex min-h-full items-center justify-center px-6 py-1">
                    <div className="flex w-full max-w-2xl select-none flex-col items-center gap-6 text-center text-tx">
                        <div className="flex items-center gap-4">
                            <img src="/images/logo_black.svg" alt="AfferLab" className="h-10 w-10 dark:hidden" />
                            <img src="/images/logo_white.svg" alt="AfferLab" className="hidden h-10 w-10 dark:block" />
                            <h1 className="text-[44px] select-none font-semibold">AfferLab</h1>
                        </div>

                        <p className="text-sm select-none text-tx/50">
                            Your workspace for strategy-driven conversations.
                        </p>

                        <div className="flex flex-wrap items-center justify-center gap-3">
                            <Button
                                size="lg"
                                onClick={handleNewChat}
                                className="w-[152px] cursor-pointer border-0 text-sm font-semibold shadow-none"
                            >
                                New Chat
                            </Button>
                            <Button
                                size="lg"
                                variant="outline"
                                className="w-[152px] cursor-pointer border-0 bg-bg-sidebar-button-hover/60 text-sm font-semibold shadow-none hover:bg-bg-sidebar-button-hover"
                                onClick={() => {
                                    void window.chatAPI.openExternal(WEBSITE_URL)
                                }}
                            >
                                <Globe />
                                website
                            </Button>
                            <Button
                                size="lg"
                                variant="outline"
                                className="w-[152px] cursor-pointer border-0 bg-bg-sidebar-button-hover/60 text-sm font-semibold shadow-none hover:bg-bg-sidebar-button-hover"
                                onClick={() => {
                                    void window.chatAPI.openExternal(DOCS_URL)
                                }}
                            >
                                <BookOpen />
                                Docs
                            </Button>
                        </div>

                        <RecentConversations />
                    </div>
                </div>
            </main>
        </div>
    )
}
