import { useEffect, useMemo, useState } from "react"
import clsx from "clsx"
import { Link, useLocation, useNavigate } from "react-router-dom"
import ConversationItem from "./ConversationItem"
import { useChatStore } from "@/features/chat/state/chatStore"
import { useUIStore } from "@/features/chat/state/uiStore"
import { motion } from "framer-motion"
import { Search, SquarePen, Settings, PanelLeftClose, Upload } from "lucide-react"
import { openUpdateModal } from "@/components/updateModalEvents"
import type { UpdaterStatusSnapshot } from "@contracts/ipc/updaterAPI"

const sidebarLayoutTransition = {
    layout: {
        type: "spring" as const,
        stiffness: 500,
        damping: 35,
    },
}

export default function Sidebar() {
    const conversations = useChatStore((s) => s.conversations)
    const setConversations = useChatStore((s) => s.setConversations)
    const updateConversation = useChatStore((s) => s.updateConversation)
    const draftConversation = useChatStore((s) => s.draftConversation)
    const createDraftConversation = useChatStore((s) => s.createDraftConversation)
    const [hoveredId, setHoveredId] = useState<string | null>(null)

    const selectedId = useChatStore((s) => s.selectedConversationId)
    const setSelectedId = useChatStore((s) => s.setSelectedConversationId)

    const sidebarCollapsed = useUIStore((s) => s.sidebarCollapsed)
    const toggleSidebar = useUIStore((s) => s.toggleSidebar)

    const [q, setQ] = useState("")
    const location = useLocation()
    const navigate = useNavigate()
    const isChatRoute = location.pathname === "/"
    const isAfferLabActive = location.pathname.startsWith("/afferlab")
    const isDraftSelected = Boolean(draftConversation?.id && selectedId === draftConversation.id)
    const [updateStatus, setUpdateStatus] = useState<UpdaterStatusSnapshot>({ kind: "idle" })

    useEffect(() => {
        window.chatAPI.getAllConversations().then(setConversations)
    }, [setConversations])

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

    useEffect(() => {
        window.chatAPI.onConversationTitleUpdated((_e, data) => {
            updateConversation(data.conversation_id, {
                title: data.new_title,
                title_source: data.title_source,
                updated_at: data.updated_at,
            })
        })
        return () => {
            window.chatAPI.removeConversationTitleUpdatedListener()
        }
    }, [updateConversation])

    const handleNewConversation = async () => {
        const settings = await window.chatAPI.settings.get().catch(() => null)
        const modelId = settings?.appSettings?.last_used_model_id
            ?? settings?.appSettings?.active_model_id
            ?? ''
        const strategyId = settings?.appSettings?.active_strategy_id ?? null
        createDraftConversation({
            model: modelId,
            strategy_id: strategyId,
        })
        navigate("/")
    }

    const handleDelete = async (id: string) => {
        await window.chatAPI.deleteConversation(id)
        const newConvs = await window.chatAPI.getAllConversations()
        setConversations(newConvs)
        setSelectedId(newConvs[0]?.id ?? null)
    }

    const handleRename = async (id: string, newTitle: string) => {
        await window.chatAPI.renameConversation(id, newTitle)
        const newConvs = await window.chatAPI.getAllConversations()
        setConversations(newConvs)
    }

    const filtered = useMemo(() => {
        const s = q.trim().toLowerCase()
        if (!s) return conversations
        return conversations.filter((c) => (c.title ?? "").toLowerCase().includes(s))
    }, [conversations, q])

    const isDevConversation = (conv: { strategy_id?: string | null }) =>
        typeof conv.strategy_id === "string" && conv.strategy_id.startsWith("dev:")

    const devConversations = useMemo(
        () => filtered.filter((conv) => isDevConversation(conv)),
        [filtered]
    )
    const normalConversations = useMemo(
        () => filtered.filter((conv) => !isDevConversation(conv)),
        [filtered]
    )
    const isUpdateReady = updateStatus.kind === "ready"

    return (
        <div className="bg-bg-chatarea h-screen pt-2 pb-2 pl-2">
            <div className="h-full w-[248px] rounded-[18px] bg-[rgba(255,255,255,0.10)] p-[1px] dark:bg-white/[0.10]">
                <div className="h-full w-full overflow-hidden rounded-[17px] bg-bg-sidebar text-tx">
                    {/* Do not use border here, otherwise the standard curved-border issue returns */}
                    <aside className="h-full flex flex-col">
                        {/* Top drag region */}
                        <div className="relative h-12 [-webkit-app-region:drag]">
                            {!sidebarCollapsed && (
                                <button
                                    type="button"
                                    onClick={toggleSidebar}
                                    className={clsx(
                                        "absolute top-[40%] -translate-y-1/2",
                                        "h-9 w-9",
                                        "text-tx hover:text-tx/80",
                                        "ui-fast ui-press grid place-items-center cursor-pointer transition-colors",
                                        "[-webkit-app-region:no-drag]"
                                    )}
                                    style={{ left: 190 }}
                                    aria-label="Hide sidebar"
                                    >
                                        <PanelLeftClose size={16} strokeWidth={2.6} />
                                    </button>
                                )}
                        </div>

                        {/* Top section: Search + New chat */}
                        <div className="px-2 pb-2 [-webkit-app-region:no-drag]">
                            <div
                                className={clsx(
                                    "flex items-center gap-2",
                                    "h-8 rounded-xl",
                                    "bg-bg-sidebar-button-hover/60",
                                    // Using shadow here instead of border helps keep rounded-edge outlines consistent
                                    "shadow-[0_0_0_1px_rgba(255,255,255,0.06)]",
                                    "px-3"
                                )}
                            >
                                <Search className="w-4 h-4 shrink-0 opacity-50" strokeWidth={2.6} />
                                <input
                                    value={q}
                                    onChange={(e) => setQ(e.target.value)}
                                    placeholder="Search"
                                    className="w-full bg-transparent outline-none text-sm placeholder:opacity-50"
                                />
                            </div>


                            <div
                                className={clsx(
                                    "mt-3 select-none w-full",
                                    "flex items-center gap-2",
                                    "h-9 rounded-xl px-3",
                                    "text-sm text-tx",
                                    isAfferLabActive
                                        ? "bg-bg-sidebar-button-active"
                                        : "hover:bg-bg-sidebar-button-hover",
                                    "ui-fast transition-colors"
                                )}
                            >
                                <Link to="/afferlab" className="flex min-w-0 flex-1 cursor-pointer items-center gap-2 self-stretch">
                                    <img src="/images/logo_black.svg" alt="AfferLab" className="h-4 w-4 dark:hidden" />
                                    <img src="/images/logo_white.svg" alt="AfferLab" className="hidden h-4 w-4 dark:block" />
                                    <span>AfferLab</span>
                                </Link>
                                {isUpdateReady ? (
                                    <button
                                        type="button"
                                        className="ui-fast ui-press grid h-5 w-5 shrink-0 cursor-pointer place-items-center rounded-full bg-[var(--success-bg)] text-[var(--success-fg)] active:scale-[0.99]"
                                        onClick={(event) => {
                                            event.preventDefault()
                                            event.stopPropagation()
                                            openUpdateModal({ version: updateStatus.version })
                                        }}
                                        aria-label="Open update dialog"
                                    >
                                        <Upload className="h-3 w-3" strokeWidth={2.8} />
                                    </button>
                                ) : null}
                            </div>

                            <button
                                onClick={handleNewConversation}
                                className={clsx(
                                    "mt-2 w-full",
                                    "flex items-center select-none gap-2",
                                    "h-9 rounded-xl px-3",
                                    "text-sm cursor-pointer text-tx",
                                    isChatRoute && isDraftSelected
                                        ? "bg-bg-sidebar-button-active"
                                        : "hover:bg-bg-sidebar-button-hover",
                                    "ui-fast ui-press transition-colors"
                                )}
                            >
                                <SquarePen className="w-4 h-4" strokeWidth={2.6} />
                                <span>New chat</span>
                            </button>
                        </div>

                        {/* List */}
                        <motion.div
                            layout
                            layoutScroll
                            transition={sidebarLayoutTransition}
                            className="flex-1 overflow-y-auto scrollbar-sidebar pb-2 [-webkit-app-region:no-drag]"
                        >
                            <motion.div
                                layout
                                transition={sidebarLayoutTransition}
                                className="px-2 space-y-1"
                            >
                                <motion.div layout transition={sidebarLayoutTransition} className="space-y-1">
                                    {devConversations.map((conv) => (
                                        <ConversationItem
                                            key={conv.id}
                                            conversation={conv}
                                            isHovered={hoveredId === conv.id}
                                            isSelected={isChatRoute && selectedId === conv.id}
                                            isDev
                                            onHover={setHoveredId}
                                            onSelect={() => {
                                                setSelectedId(conv.id)
                                                navigate("/")
                                            }}
                                            onRename={(newTitle) => handleRename(conv.id, newTitle)}
                                            onDelete={() => handleDelete(conv.id)}
                                            onManage={() => {
                                                if (!conv.strategy_id) return
                                                navigate(`/settings/strategy?mode=personal&dev=${conv.strategy_id}`)
                                            }}
                                        />
                                    ))}
                                </motion.div>

                                {devConversations.length > 0 ? (
                                    <motion.div
                                        layout
                                        transition={sidebarLayoutTransition}
                                        className="my-2 h-px bg-border/70"
                                    />
                                ) : null}

                                <motion.div layout transition={sidebarLayoutTransition} className="space-y-1">
                                    {normalConversations.map((conv) => (
                                        <ConversationItem
                                            key={conv.id}
                                            conversation={conv}
                                            isHovered={hoveredId === conv.id}
                                            isSelected={isChatRoute && selectedId === conv.id}
                                            onHover={setHoveredId}
                                            onSelect={() => {
                                                setSelectedId(conv.id)
                                                navigate("/")
                                            }}
                                            onRename={(newTitle) => handleRename(conv.id, newTitle)}
                                            onDelete={() => handleDelete(conv.id)}
                                        />
                                    ))}
                                </motion.div>

                                {filtered.length === 0 && (
                                    <motion.div
                                        layout
                                        transition={sidebarLayoutTransition}
                                        className="h-9 select-none rounded-[10px] px-3 text-sm text-tx/50 flex items-center"
                                    >
                                        No results
                                    </motion.div>
                                )}
                            </motion.div>
                        </motion.div>

                        {/* Bottom section: Settings */}
                        <div className="px-2 py-3 border-t border-border [-webkit-app-region:no-drag]">
                            <Link
                                to="/settings"
                                className={clsx(
                                    "w-full select-none flex items-center gap-2",
                                    "h-9 rounded-xl px-3",
                                    "text-sm text-tx",
                                    "hover:bg-bg-sidebar-button-hover",
                                    "ui-fast ui-press transition-colors"
                                )}
                            >
                                <Settings className="w-4 h-4" strokeWidth={2.6} />
                                <span>Settings</span>
                            </Link>
                        </div>
                    </aside>
                </div>
            </div>
        </div>
    )
}
