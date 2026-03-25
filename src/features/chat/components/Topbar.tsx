import ThemeToggle from "@/shared/ui/ThemeToggle"
import MemoryCloudBar from "@/features/chat/memory/components/MemoryCloudBar"
import { useChatStore } from "@/features/chat/state/chatStore"
import { useUIStore } from "@/features/chat/state/uiStore"
import { PanelLeftOpen, PanelRightClose, PanelRightOpen } from "lucide-react"
import clsx from "clsx"
import { useDevUiStore } from "@/features/strategy-dev/state/devUiStore"
import { type ReactNode, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react"

type TopbarProps = {
    showMemoryCloud?: boolean
    showDevToggle?: boolean
    rightAddon?: ReactNode
}

export default function Topbar({
    showMemoryCloud = true,
    showDevToggle = true,
    rightAddon,
}: TopbarProps) {
    const selectedConversationId = useChatStore((s) => s.selectedConversationId)
    const conversations = useChatStore((s) => s.conversations)
    const draftConversation = useChatStore((s) => s.draftConversation)
    const isDraftSelected = Boolean(
        draftConversation?.id && draftConversation.id === selectedConversationId
    )
    const selectedConversation = conversations.find((conv) => conv.id === selectedConversationId) ?? null
    const activeStrategyId = isDraftSelected
        ? (draftConversation?.strategy_id ?? null)
        : (selectedConversation?.strategy_id ?? null)
    const isDevConversation = Boolean(activeStrategyId?.startsWith("dev:"))
    const [memoryCloudByStrategyId, setMemoryCloudByStrategyId] = useState<Record<string, boolean>>({})

    const sidebarCollapsed = useUIStore((s) => s.sidebarCollapsed)
    const toggleSidebar = useUIStore((s) => s.toggleSidebar)
    const devPanelOpen = useDevUiStore((s) => s.devPanelOpen)
    const toggleDevPanel = useDevUiStore((s) => s.toggleDevPanel)
    const isDevPanelOpen = devPanelOpen

    useEffect(() => {
        if (!showMemoryCloud) return
        let cancelled = false
        window.chatAPI.strategies.list()
            .then((list) => {
                if (cancelled) return
                const next: Record<string, boolean> = {}
                for (const strategy of list) {
                    if (!strategy?.id) continue
                    next[strategy.id] = strategy.features?.memoryCloud === true
                }
                setMemoryCloudByStrategyId(next)
            })
            .catch(() => {
                if (cancelled) return
                setMemoryCloudByStrategyId({})
            })
        return () => { cancelled = true }
    }, [showMemoryCloud])

    const showMemoryCloudBar = useMemo(() => {
        if (!showMemoryCloud) return false
        const strategyId = activeStrategyId
        if (!strategyId) return false
        const supported = memoryCloudByStrategyId[strategyId]
        if (typeof supported !== "boolean") return false
        return supported
    }, [activeStrategyId, memoryCloudByStrategyId, showMemoryCloud])

    const edgeAlignPx = 8
    const [collisionInsets, setCollisionInsets] = useState({ left: 0, right: 0 })
    const topbarRef = useRef<HTMLDivElement>(null)
    const leftControlsRef = useRef<HTMLDivElement>(null)
    const centerTrackRef = useRef<HTMLDivElement>(null)
    const rightControlsRef = useRef<HTMLDivElement>(null)

    useLayoutEffect(() => {
        const updateCollisionInsets = () => {
            const centerEl = centerTrackRef.current
            if (!centerEl) return
            const centerRect = centerEl.getBoundingClientRect()
            const gap = 8
            const leftEl = leftControlsRef.current
            const leftRect = (sidebarCollapsed && leftEl && leftEl.getBoundingClientRect().width > 1)
                ? leftEl.getBoundingClientRect()
                : null
            const rightRect = rightControlsRef.current?.getBoundingClientRect()
            const left = leftRect ? Math.max(0, Math.ceil(leftRect.right + gap - centerRect.left)) : 0
            const right = rightRect ? Math.max(0, Math.ceil(centerRect.right + gap - rightRect.left)) : 0
            setCollisionInsets((prev) => (
                prev.left === left && prev.right === right
                    ? prev
                    : { left, right }
            ))
        }

        const rafA = window.requestAnimationFrame(updateCollisionInsets)
        const rafB = window.requestAnimationFrame(updateCollisionInsets)
        window.addEventListener("resize", updateCollisionInsets)
        const ro = typeof ResizeObserver !== "undefined"
            ? new ResizeObserver(() => updateCollisionInsets())
            : null
        if (ro) {
            const nodes = [
                topbarRef.current,
                leftControlsRef.current,
                centerTrackRef.current,
                rightControlsRef.current,
            ]
            for (const node of nodes) {
                if (node) ro.observe(node)
            }
        }
        return () => {
            window.cancelAnimationFrame(rafA)
            window.cancelAnimationFrame(rafB)
            window.removeEventListener("resize", updateCollisionInsets)
            ro?.disconnect()
        }
    }, [sidebarCollapsed, isDevConversation, showDevToggle, showMemoryCloudBar, rightAddon])

    return (
        <div ref={topbarRef} className="absolute inset-x-0 top-0 z-40 h-14 bg-transparent text-tx [-webkit-app-region:drag]">
            {/* Left */}
            <div ref={leftControlsRef} className="absolute inset-y-0 left-4 z-20 flex items-center [-webkit-app-region:no-drag]">
                <div
                    className={clsx(
                        "flex items-center gap-3 shrink-0",
                        sidebarCollapsed ? "pl-20" : "pl-0"
                    )}
                >
                    {sidebarCollapsed && (
                        <button
                            type="button"
                            onClick={toggleSidebar}
                            className="ui-fast ui-press h-9 px-3 cursor-pointer text-tx hover:text-tx/80 transition-colors flex items-center gap-2"
                            aria-label="Show sidebar"
                        >
                            <PanelLeftOpen size={16} strokeWidth={2.6} />
                        </button>
                    )}
                </div>
            </div>

            {/* Center – Memory Cloud */}
            <div
                className="h-full"
                style={{
                    paddingLeft: edgeAlignPx,
                    paddingRight: edgeAlignPx,
                }}
            >
                <div
                    ref={centerTrackRef}
                    className="relative z-10 mx-auto h-full w-full max-w-4xl overflow-visible pt-2"
                    style={{
                        paddingLeft: collisionInsets.left,
                        paddingRight: collisionInsets.right,
                    }}
                >
                    {showMemoryCloudBar ? (
                        <MemoryCloudBar
                            key={selectedConversationId ?? "no-conv"}
                            conversationId={isDraftSelected ? null : selectedConversationId ?? null}
                        />
                    ) : null}
                </div>
            </div>

            {/* Right */}
            <div ref={rightControlsRef} className="absolute top-0 right-4 z-30 flex items-start gap-2 pt-2 [-webkit-app-region:no-drag]">
                {showDevToggle && isDevConversation ? (
                    <button
                        type="button"
                        onClick={toggleDevPanel}
                        className="ui-fast ui-press grid h-9 w-9 cursor-pointer place-items-center rounded-3xl border border-border/60 bg-bg-inputarea text-tx transition-colors hover:bg-bg-sidebar-button-hover"
                        aria-label="Toggle dev inspector"
                    >
                        {isDevPanelOpen ? <PanelRightClose size={16} /> : <PanelRightOpen size={16} />}
                    </button>
                ) : null}
                {rightAddon}
                <ThemeToggle />
            </div>
        </div>
    )
}
