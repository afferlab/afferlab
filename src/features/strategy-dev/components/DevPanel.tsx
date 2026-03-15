import { useEffect, useMemo, useRef, useState } from "react"
import clsx from "clsx"
import {
    ChevronDown,
    ChevronUp,
    Copy,
    RotateCcw,
    Settings,
} from "lucide-react"
import { toast } from "sonner"

import { Button } from "@/shared/ui/button"
import {
    Dialog,
    DialogContent,
    DialogDescription,
    DialogFooter,
    DialogHeader,
    DialogTitle,
} from "@/shared/ui/dialog"
import IconButton from "@/shared/ui/IconButton"
import { Tooltip, TooltipContent, TooltipTrigger } from "@/shared/ui/tooltip"
import { useDevInspectorStore } from "@/features/strategy-dev/state/devInspectorStore"
import { useChatStore } from "@/features/chat/state/chatStore"
import { strategyService } from "@/features/strategies/services/strategyService"
import type { LLMModelConfig, StrategyInfo } from "@contracts"
import TokenBreakdownBar from "@/features/strategy-dev/components/TokenBreakdownBar"
import { useNavigate } from "react-router-dom"
import DevConsoleList from "@/features/strategy-dev/components/DevConsoleList"
import { buildConsoleCopyText, buildDevConsoleEntries } from "@/features/strategy-dev/utils/devConsoleMapper"
import type { StrategyDevEvent } from "@contracts"

const INSPECTOR_DEFAULT_HEIGHT = 180
const INSPECTOR_MIN_HEIGHT = 120
const INSPECTOR_COLLAPSED_HEIGHT = 30
const EMPTY_DEV_EVENTS: StrategyDevEvent[] = []

type StrategySchemaField = {
    key: string
    label: string
    type?: string
    description?: string
    defaultValue?: unknown
}

function formatTime(ts: number) {
    const date = new Date(ts)
    return date.toLocaleTimeString("en-GB", { hour12: false })
}

function formatDuration(ms?: number) {
    if (!ms || ms <= 0) return "--"
    if (ms < 1000) return `${Math.round(ms)}ms`
    return `${(ms / 1000).toFixed(1)}s`
}

function KeyValueRow({ label, value }: { label: string; value: string }) {
    return (
        <div className="flex items-center justify-between gap-2 text-[11px] text-tx/70">
            <span className="text-tx/50">{label}</span>
            <span className="text-tx/80">{value}</span>
        </div>
    )
}

function renderValue(value: unknown) {
    if (value === null || value === undefined) return "--"
    if (typeof value === "string" || typeof value === "number" || typeof value === "boolean") {
        return String(value)
    }
    return JSON.stringify(value)
}

function countOverrides(fields: StrategySchemaField[], effective: Record<string, unknown>): number {
    let count = 0
    for (const field of fields) {
        if (!Object.prototype.hasOwnProperty.call(effective, field.key)) continue
        const current = effective[field.key]
        if (field.defaultValue === undefined) {
            count += 1
            continue
        }
        if (!Object.is(current, field.defaultValue)) {
            count += 1
        }
    }
    return count
}

function normalizeSchema(schema: unknown): StrategySchemaField[] {
    if (!schema) return []
    if (Array.isArray(schema)) {
        return schema.map((item, index) => {
            if (typeof item === "string") {
                return { key: item, label: item }
            }
            if (item && typeof item === "object") {
                const entry = item as Record<string, unknown>
                const key =
                    (entry.key as string) ||
                    (entry.name as string) ||
                    (entry.id as string) ||
                    `field_${index + 1}`
                return {
                    key,
                    label: (entry.label as string) || (entry.title as string) || key,
                    type: typeof entry.type === "string" ? entry.type : undefined,
                    description: typeof entry.description === "string" ? entry.description : undefined,
                    defaultValue: entry.default ?? entry.defaultValue ?? entry.initial,
                }
            }
            return { key: `field_${index + 1}`, label: `Field ${index + 1}` }
        })
    }

    if (schema && typeof schema === "object") {
        const obj = schema as Record<string, unknown>
        if (obj.properties && typeof obj.properties === "object") {
            return Object.entries(obj.properties as Record<string, unknown>).map(([key, value]) => {
                const def = (value ?? {}) as Record<string, unknown>
                return {
                    key,
                    label: (def.title as string) || key,
                    type: typeof def.type === "string" ? def.type : undefined,
                    description: typeof def.description === "string" ? def.description : undefined,
                    defaultValue: def.default,
                }
            })
        }
        return Object.entries(obj).map(([key, value]) => ({
            key,
            label: key,
            defaultValue: value,
        }))
    }

    return []
}

function InspectorSection({
    title,
    open,
    onToggle,
    children,
}: {
    title: string
    open: boolean
    onToggle: () => void
    children: React.ReactNode
}) {
    return (
        <section className="border-b border-border/50 last:border-b-0">
            <button
                type="button"
                onClick={onToggle}
                className="w-full grid grid-cols-[1rem_minmax(0,1fr)] items-center gap-0 text-left px-1 py-1 text-[11px] text-tx/80 hover:bg-bg-sidebar-button-hover cursor-pointer"
            >
                <span className="text-tx/60 leading-4">{open ? "▼" : "▶"}</span>
                <span className="leading-4">{title}</span>
            </button>
            {open ? (
                <div className="pl-5 pr-2 pb-2">
                    {children}
                </div>
            ) : null}
        </section>
    )
}

export default function DevPanel() {
    const panelRef = useRef<HTMLElement>(null)
    const selectedConversationId = useChatStore((s) => s.selectedConversationId)
    const conversations = useChatStore((s) => s.conversations)
    const selectedConversation = conversations.find((conv) => conv.id === selectedConversationId) ?? null
    const replaceTurns = useChatStore((s) => s.replaceTurns)
    const clearAllStreamingSegments = useChatStore((s) => s.clearAllStreamingSegments)
    const clearBusy = useChatStore((s) => s.clearBusy)
    const busyByConversation = useChatStore((s) => s.busyByConversation)
    const updateConversation = useChatStore((s) => s.updateConversation)
    const clearDevConversation = useDevInspectorStore((s) => s.clearConversation)
    const latestTurn = useDevInspectorStore(
        (s) => (selectedConversationId ? s.latestTurnByConversation[selectedConversationId] : null)
    )
    const conversationEvents = useDevInspectorStore(
        (s) => {
            if (!selectedConversationId) return EMPTY_DEV_EVENTS
            return s.eventsByConversation[selectedConversationId] ?? EMPTY_DEV_EVENTS
        }
    )
    const navigate = useNavigate()
    const [collapsed, setCollapsed] = useState(false)
    const [inspectorHeight, setInspectorHeight] = useState(INSPECTOR_DEFAULT_HEIGHT)
    const [configOpen, setConfigOpen] = useState(true)
    const [strategyConfigOpen, setStrategyConfigOpen] = useState(true)
    const [resetOpen, setResetOpen] = useState(false)
    const [resetPending, setResetPending] = useState(false)
    const consoleRef = useRef<HTMLDivElement>(null)
    const [isAtBottom, setIsAtBottom] = useState(true)
    const [strategyInfo, setStrategyInfo] = useState<StrategyInfo | null>(null)
    const [webSearchEnabled, setWebSearchEnabled] = useState<boolean | null>(null)
    const [modelDefaults, setModelDefaults] = useState<{
        temperature?: number
        topP?: number
        maxTokensTier?: number | string
    }>({})
    const [modelMap, setModelMap] = useState<Record<string, LLMModelConfig>>({})
    const [activeModelId, setActiveModelId] = useState<string | null>(null)
    const [lastUsedModelId, setLastUsedModelId] = useState<string | null>(null)

    useEffect(() => {
        const el = consoleRef.current
        if (!el) return
        const onScroll = () => {
            const tolerance = 40
            const atBottom = el.scrollHeight - el.scrollTop - el.clientHeight < tolerance
            setIsAtBottom(atBottom)
        }
        el.addEventListener("scroll", onScroll)
        return () => el.removeEventListener("scroll", onScroll)
    }, [])

    const consoleEntries = useMemo(() => {
        if (!latestTurn?.turnId) return []
        return buildDevConsoleEntries(conversationEvents, { turnId: latestTurn.turnId })
    }, [conversationEvents, latestTurn?.turnId])

    useEffect(() => {
        let mounted = true
        const strategyId = selectedConversation?.strategy_id ?? null
        if (!strategyId) {
            setStrategyInfo(null)
            return
        }

        void (async () => {
            try {
                const list = await strategyService.list()
                if (!mounted) return
                const found = list.find((item) => item.id === strategyId) ?? null
                setStrategyInfo(found)
            } catch (err) {
                if (!mounted) return
                console.warn("[DevPanel] failed to load strategies", err)
                setStrategyInfo(null)
            }
        })()

        return () => {
            mounted = false
        }
    }, [selectedConversation?.strategy_id])

    useEffect(() => {
        let mounted = true
        ;(async () => {
            const [snapshot, models] = await Promise.all([
                window.chatAPI.settings.get(),
                window.chatAPI.listModels(),
            ])
            if (!mounted) return

            const app = snapshot.appSettings ?? {}
            setActiveModelId(app.active_model_id ?? null)
            setLastUsedModelId(app.last_used_model_id ?? null)

            const modelLookup: Record<string, LLMModelConfig> = {}
            for (const model of models) {
                modelLookup[model.id] = model
            }
            setModelMap(modelLookup)

            let ws: unknown = app.web_search_settings
            if (typeof ws === "string") {
                try {
                    ws = JSON.parse(ws)
                } catch {
                    ws = null
                }
            }
            const parsed = ws && typeof ws === "object" ? (ws as { enabled?: boolean }) : {}
            setWebSearchEnabled(parsed.enabled ?? true)

            let rawDefaults: unknown = app.model_default_params
            if (typeof rawDefaults === "string") {
                try {
                    rawDefaults = JSON.parse(rawDefaults)
                } catch {
                    rawDefaults = null
                }
            }
            const defaults = rawDefaults && typeof rawDefaults === "object"
                ? rawDefaults as { temperature?: number; top_p?: number; topP?: number; maxTokensTier?: number | string }
                : {}
            setModelDefaults({
                temperature: typeof defaults.temperature === "number" ? defaults.temperature : undefined,
                topP: typeof defaults.top_p === "number"
                    ? defaults.top_p
                    : typeof defaults.topP === "number"
                        ? defaults.topP
                        : undefined,
                maxTokensTier: defaults.maxTokensTier,
            })
        })()
        return () => {
            mounted = false
        }
    }, [])

    useEffect(() => {
        if (!isAtBottom || !consoleRef.current) return
        consoleRef.current.scrollTop = consoleRef.current.scrollHeight
    }, [isAtBottom, consoleEntries.length])

    const tokenBreakdown = latestTurn?.tokenBreakdown
    const totalUsed = tokenBreakdown?.totalUsed ?? 0
    const maxTokens =
        tokenBreakdown?.maxTokens
        ?? latestTurn?.inputEvent?.data?.budget?.maxInputTokens
        ?? 0
    const tokenLabel = totalUsed > 0 && maxTokens > 0
        ? `Tokens ${totalUsed}/${maxTokens}`
        : "Tokens --/--"
    const tokenUsageLabel = maxTokens > 0
        ? `${Math.min(
            100,
            totalUsed === 0 ? 0 : Math.max(0.0001, (totalUsed / maxTokens) * 100)
        ).toFixed(4)}%`
        : "--"

    const fallbackModelId =
        selectedConversation?.model
        ?? activeModelId
        ?? lastUsedModelId
        ?? null
    const fallbackModel = fallbackModelId ? modelMap[fallbackModelId] : undefined
    const effectiveCapabilities =
        latestTurn?.inputEvent?.data?.capabilities
        ?? (fallbackModel ? {
            vision: fallbackModel.capabilities?.vision,
            structuredOutput: fallbackModel.capabilities?.json,
            tools: fallbackModel.capabilities?.tools,
        } : undefined)
    const modelLabel =
        fallbackModelId && fallbackModel?.provider
            ? `${fallbackModel.provider}/${fallbackModelId}`
            : fallbackModelId ?? "--"

    const strategyName =
        strategyInfo?.meta?.name ??
        selectedConversation?.strategy_key ??
        selectedConversation?.strategy_id ??
        "--"

    const schemaFields = useMemo(
        () => normalizeSchema(strategyInfo?.paramsSchema ?? strategyInfo?.configSchema),
        [strategyInfo?.paramsSchema, strategyInfo?.configSchema]
    )
    const strategyConfigValues = useMemo(
        () => ((latestTurn?.inputEvent?.data?.config as Record<string, unknown> | undefined) ?? {}),
        [latestTurn?.inputEvent?.data?.config]
    )
    const strategyOverridesCount = useMemo(
        () => countOverrides(schemaFields, strategyConfigValues),
        [schemaFields, strategyConfigValues]
    )
    const memoryCloudValue = strategyInfo?.features?.memoryCloud
    const memoryCloudLabel =
        memoryCloudValue === undefined ? "--" : memoryCloudValue ? "Enabled" : "Disabled"
    const workerStatus = latestTurn?.status === "error"
        ? "error"
        : latestTurn?.status === "done" || !latestTurn
            ? "ready"
            : "busy"
    const statusLabel = workerStatus === "ready"
        ? "Ready"
        : workerStatus === "busy"
            ? "Busy"
            : "Error"
    const statusClassName = clsx(
        "rounded-full px-2 py-0.5 text-[10px] font-medium",
        workerStatus === "ready" && "bg-[var(--success-bg)] text-[var(--success-fg)]",
        workerStatus === "busy" && "bg-[var(--warning-bg)] text-[var(--warning-fg)]",
        workerStatus === "error" && "bg-[var(--error-bg)] text-[var(--error-fg)]"
    )
    const durationMs =
        latestTurn?.startedAt && latestTurn?.endedAt
            ? latestTurn.endedAt - latestTurn.startedAt
            : undefined
    const canReset = Boolean(selectedConversationId)

    const handleCopyLogs = async () => {
        const content = buildConsoleCopyText(consoleEntries)
        try {
            await navigator.clipboard.writeText(content)
            toast.success("Copied")
        } catch (err) {
            toast.error("Copy failed", {
                description: err instanceof Error ? err.message : "Clipboard unavailable",
            })
        }
    }

    const handleOpenStrategySettings = () => {
        if (!selectedConversation?.strategy_id) {
            navigate("/settings/strategy?mode=personal")
            return
        }
        navigate(`/settings/strategy?mode=personal&dev=${selectedConversation.strategy_id}`)
    }

    const handleResetHistory = async () => {
        if (!selectedConversationId) return
        setResetPending(true)
        try {
            const busy = busyByConversation[selectedConversationId]
            if (busy?.replyId) {
                await window.chatAPI.abortStream(busy.replyId)
            }
            const result = await window.chatAPI.resetConversationHistory(selectedConversationId)
            replaceTurns([])
            clearAllStreamingSegments()
            clearBusy(selectedConversationId)
            clearDevConversation(selectedConversationId)
            updateConversation(selectedConversationId, {
                updated_at: result?.updatedAt ?? Date.now(),
            })
            toast.success("History cleared")
        } catch (err) {
            toast.error("Reset failed", {
                description: err instanceof Error ? err.message : "Unknown error",
            })
        } finally {
            setResetPending(false)
            setResetOpen(false)
        }
    }

    const handleInspectorResizeStart = (event: React.MouseEvent<HTMLDivElement>) => {
        event.preventDefault()
        setCollapsed(false)
        const startY = event.clientY
        const startHeight = inspectorHeight
        const hostHeight = panelRef.current?.clientHeight ?? window.innerHeight
        const maxHeight = Math.max(INSPECTOR_MIN_HEIGHT, Math.floor(hostHeight * 0.7))
        const previousUserSelect = document.body.style.userSelect
        const previousCursor = document.body.style.cursor
        document.body.style.userSelect = "none"
        document.body.style.cursor = "row-resize"

        const onMove = (moveEvent: MouseEvent) => {
            const delta = startY - moveEvent.clientY
            const next = Math.min(maxHeight, Math.max(INSPECTOR_MIN_HEIGHT, startHeight + delta))
            setInspectorHeight(next)
        }
        const onUp = () => {
            document.removeEventListener("mousemove", onMove)
            document.removeEventListener("mouseup", onUp)
            document.body.style.userSelect = previousUserSelect
            document.body.style.cursor = previousCursor
        }

        document.addEventListener("mousemove", onMove)
        document.addEventListener("mouseup", onUp)
    }

    return (
        <aside ref={panelRef} className="w-full h-full bg-bg-chatarea text-tx flex flex-col min-h-0 overflow-hidden">
            <div
                className="shrink-0 border-b border-border/60 px-4 pt-3 pb-1 space-y-1"
            >
                <div className="min-w-0 space-y-1">
                    <div className="flex items-center gap-3 min-w-0">
                        <div className="flex items-center justify-between gap-2 min-w-0 flex-1">
                            <div className="text-sm font-medium truncate">
                                Turn State
                            </div>
                            <span className={statusClassName}>{statusLabel}</span>
                        </div>
                        <span className="text-tx/30">|</span>
                        <div className="flex items-center justify-between gap-2 min-w-0 flex-1">
                            <div className="text-sm font-medium truncate">
                                Worker
                            </div>
                            <span className={statusClassName}>{statusLabel}</span>
                        </div>
                    </div>
                    <div className="text-[11px] text-tx/50">
                        {latestTurn?.startedAt ? `Started ${formatTime(latestTurn.startedAt)}` : "No turns yet"}
                    </div>
                    <div className="grid grid-cols-2 gap-3 text-[11px] text-tx/60">
                        <div>Duration: {formatDuration(durationMs)}</div>
                        <div>Stop: {latestTurn?.stopReason ?? "--"}</div>
                    </div>
                </div>

                <div className="space-y-2 min-w-0">
                    <div className="flex items-center justify-between text-[10px] text-tx/50">
                        <span>{tokenLabel}</span>
                        <span>{tokenUsageLabel}</span>
                    </div>
                    <TokenBreakdownBar
                        items={tokenBreakdown?.items ?? []}
                        total={totalUsed}
                    />
                </div>

                <div className="flex items-center justify-between gap-1 mb-1">
                    <div className="flex items-center gap-5 text-tx/70">
                        <Button
                            type="button"
                            size="sm"
                            variant="ghost"
                            disabled={!canReset}
                            onClick={() => setResetOpen(true)}
                            className="!px-0 has-[>svg]:!px-0 text-tx/70 hover:text-tx cursor-pointer"
                        >
                            <RotateCcw className="h-3.5 w-3.5" />
                            Reset history
                        </Button>
                        <Button
                            type="button"
                            size="sm"
                            variant="ghost"
                            onClick={handleCopyLogs}
                            className="!px-0 has-[>svg]:!px-0 text-tx/70 hover:text-tx cursor-pointer"
                        >
                            <Copy className="h-3.5 w-3.5" />
                            Copy logs
                        </Button>
                    </div>
                    <Tooltip>
                        <TooltipTrigger asChild>
                            <IconButton
                                type="button"
                                aria-label="Open Write Strategy"
                                className="h-7 w-7 cursor-pointer"
                                onClick={handleOpenStrategySettings}
                            >
                                <Settings className="h-4 w-4 text-tx/70" />
                            </IconButton>
                        </TooltipTrigger>
                        <TooltipContent side="top" sideOffset={6}>
                            Write Strategy
                        </TooltipContent>
                    </Tooltip>
                </div>

            </div>

            <div className="flex-1 min-h-0 overflow-hidden">
                <div className="h-full overflow-y-auto overflow-x-hidden px-3 py-2" ref={consoleRef}>
                    <DevConsoleList entries={consoleEntries} />
                </div>
            </div>

            <div
                className="shrink-0 border-t border-border/60 flex flex-col overflow-hidden"
                style={{ height: collapsed ? INSPECTOR_COLLAPSED_HEIGHT : inspectorHeight }}
            >
                <div
                    className="h-1 cursor-row-resize hover:bg-border/70"
                    onMouseDown={handleInspectorResizeStart}
                    aria-hidden
                />
                <div className="flex items-center justify-between px-3 py-1">
                    <span className="text-[10px] uppercase tracking-wide text-tx/50">Inspector</span>
                    <Tooltip>
                        <TooltipTrigger asChild>
                            <IconButton
                                type="button"
                                aria-label={collapsed ? "Expand inspector" : "Collapse inspector"}
                                onClick={() => setCollapsed((prev) => !prev)}
                                className="h-6 w-6 cursor-pointer"
                            >
                                {collapsed ? (
                                    <ChevronUp className="h-3.5 w-3.5 text-tx/70" />
                                ) : (
                                    <ChevronDown className="h-3.5 w-3.5 text-tx/70" />
                                )}
                            </IconButton>
                        </TooltipTrigger>
                        <TooltipContent side="top" sideOffset={6}>
                            {collapsed ? "Expand inspector" : "Collapse inspector"}
                        </TooltipContent>
                    </Tooltip>
                </div>
                {!collapsed ? (
                    <div className="flex-1 overflow-y-auto px-3 py-1 text-[11px] text-tx/70">
                        <InspectorSection
                            title="General Config"
                            open={configOpen}
                            onToggle={() => setConfigOpen((prev) => !prev)}
                        >
                            <div className="space-y-1">
                                <KeyValueRow label="Model" value={modelLabel} />
                                <KeyValueRow label="Provider" value={fallbackModel?.provider ?? '--'} />
                                <KeyValueRow label="Strategy" value={strategyName} />
                                <KeyValueRow label="Tools" value={effectiveCapabilities?.tools ? 'Enabled' : 'Disabled'} />
                                <KeyValueRow label="Vision" value={effectiveCapabilities?.vision ? 'Enabled' : 'Disabled'} />
                                <KeyValueRow label="Structured Output" value={effectiveCapabilities?.structuredOutput ? 'Enabled' : 'Disabled'} />
                                <KeyValueRow
                                    label="Max Tokens"
                                    value={
                                        maxTokens
                                            ? String(maxTokens)
                                            : modelDefaults.maxTokensTier != null
                                                ? String(modelDefaults.maxTokensTier)
                                                : "--"
                                    }
                                />
                                <KeyValueRow
                                    label="Temperature"
                                    value={
                                        typeof modelDefaults.temperature === "number"
                                            ? String(modelDefaults.temperature)
                                            : "--"
                                    }
                                />
                                <KeyValueRow
                                    label="Top P"
                                    value={
                                        typeof modelDefaults.topP === "number"
                                            ? String(modelDefaults.topP)
                                            : "--"
                                    }
                                />
                                <KeyValueRow
                                    label="Web Search"
                                    value={webSearchEnabled === null ? "--" : webSearchEnabled ? "Enabled" : "Disabled"}
                                />
                            </div>
                        </InspectorSection>
                        <InspectorSection
                            title="Strategy Config"
                            open={strategyConfigOpen}
                            onToggle={() => setStrategyConfigOpen((prev) => !prev)}
                        >
                            <div className="space-y-3">
                                <KeyValueRow
                                    label="Memory Cloud"
                                    value={memoryCloudLabel}
                                />
                                <KeyValueRow
                                    label="Overrides"
                                    value={String(strategyOverridesCount)}
                                />
                                <div className="space-y-2">
                                    <div className="text-[10px] uppercase tracking-wide text-tx/40">
                                        Schema Fields
                                    </div>
                                    {schemaFields.length === 0 ? (
                                        <div className="text-tx/50 text-[10px]">No strategy config schema</div>
                                    ) : (
                                        schemaFields.map((field) => {
                                            const currentValue =
                                                (strategyConfigValues as Record<string, unknown>)[field.key]
                                            const value =
                                                currentValue !== undefined
                                                    ? renderValue(currentValue)
                                                    : field.defaultValue !== undefined
                                                    ? renderValue(field.defaultValue)
                                                    : "--"
                                            return (
                                                <div
                                                    key={field.key}
                                                    className="rounded-md border border-border/60 px-2 py-2 space-y-1"
                                                >
                                                    <div className="flex items-center justify-between gap-2">
                                                        <span className="text-[11px] text-tx/80">
                                                            {field.label}
                                                        </span>
                                                        <span className="text-[11px] text-tx/60">
                                                            {value}
                                                        </span>
                                                    </div>
                                                    {field.type ? (
                                                        <div className="text-[10px] text-tx/40">
                                                            Type: {field.type}
                                                        </div>
                                                    ) : null}
                                                    {field.description ? (
                                                        <div className="text-[10px] text-tx/50 whitespace-pre-wrap break-words">
                                                            {field.description}
                                                        </div>
                                                    ) : null}
                                                </div>
                                            )
                                        })
                                    )}
                                </div>
                            </div>
                        </InspectorSection>
                    </div>
                ) : null}
            </div>

            <Dialog open={resetOpen} onOpenChange={setResetOpen}>
                <DialogContent className="border-border">
                    <DialogHeader>
                        <DialogTitle>Reset dev conversation?</DialogTitle>
                        <DialogDescription>
                            This clears all messages, turns, logs, and strategy-generated assets for this dev
                            conversation. Strategy config stays unchanged.
                        </DialogDescription>
                    </DialogHeader>
                    <DialogFooter>
                        <Button
                            type="button"
                            variant="outline"
                            onClick={() => setResetOpen(false)}
                            disabled={resetPending}
                            className="cursor-pointer"
                        >
                            Cancel
                        </Button>
                        <Button
                            type="button"
                            variant="destructive"
                            onClick={handleResetHistory}
                            disabled={resetPending}
                            className="cursor-pointer bg-[var(--error-bg)] text-[var(--error-fg)] hover:bg-[var(--error-bg)]/90"
                        >
                            Reset history
                        </Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>
        </aside>
    )
}
