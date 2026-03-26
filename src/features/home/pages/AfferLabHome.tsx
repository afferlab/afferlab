import { useEffect, useState } from "react"
import { useNavigate } from "react-router-dom"
import { BookOpen, Globe, Upload } from "lucide-react"
import Topbar from "@/features/chat/components/Topbar"
import { Button } from "@/shared/ui/button"
import { useChatStore } from "@/features/chat/state/chatStore"
import RecentConversations from "@/features/home/components/RecentConversations"
import { openUpdateModal } from "@/components/updateModalEvents"
import type { UpdaterStatusSnapshot } from "@contracts/ipc/updaterAPI"

const WEBSITE_URL = "https://afferlab.com"
const DOCS_URL = "https://docs.afferlab.com"
const logoBlackSrc = `${import.meta.env.BASE_URL}images/logo_black.svg`
const logoWhiteSrc = `${import.meta.env.BASE_URL}images/logo_white.svg`

export default function AfferLabHome() {
    const createDraftConversation = useChatStore((s) => s.createDraftConversation)
    const navigate = useNavigate()
    const [updateStatus, setUpdateStatus] = useState<UpdaterStatusSnapshot>({ kind: "idle" })

    useEffect(() => {
        let mounted = true

        void window.updater.getStatus().then((status) => {
            if (!mounted) return
            setUpdateStatus(status)
        })

        const removeStatusListener = window.updater.onStatusChange((status) => {
            if (!mounted) return
            setUpdateStatus(status)
        })

        return () => {
            mounted = false
            removeStatusListener()
        }
    }, [])

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

    const isUpdateReady = updateStatus.kind === "ready"

    return (
        <div className="relative flex flex-1 min-h-0 flex-col">
            <Topbar
                showMemoryCloud={false}
                showDevToggle={false}
                rightAddon={isUpdateReady ? (
                    <button
                        type="button"
                        className="ui-fast ui-press inline-flex h-9 cursor-pointer items-center gap-2 rounded-3xl bg-[var(--success-bg)] px-4 text-sm font-semibold text-[var(--success-fg)] transition-colors hover:brightness-[0.98] active:scale-[0.99]"
                        onClick={() => {
                            openUpdateModal({ version: updateStatus.version })
                        }}
                    >
                        <Upload className="h-4 w-4" strokeWidth={2.6} />
                        <span>Update available</span>
                    </button>
                ) : null}
            />
            <main className="flex-1 min-h-0 overflow-y-auto pt-3">
                <div className="flex min-h-full items-center justify-center px-6 py-1">
                    <div className="flex w-full max-w-2xl select-none flex-col items-center gap-5 text-center text-tx">
                        <div className="flex items-center gap-4">
                            <img src={logoBlackSrc} alt="AfferLab" className="h-10 w-10 dark:hidden" />
                            <img src={logoWhiteSrc} alt="AfferLab" className="hidden h-10 w-10 dark:block" />
                            <h1 className="text-[44px] leading-none select-none font-semibold">AfferLab</h1>
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
