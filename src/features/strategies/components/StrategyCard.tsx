import { useMemo } from "react"
import { CircleHelp, Cloud, FolderOpen, Globe, Package, RefreshCw, Settings, Trash2, Wrench, type LucideIcon } from "lucide-react"
import type { StrategyInfo } from "@contracts"

import { Badge } from "@/shared/ui/badge"
import { Button } from "@/shared/ui/button"
import {
    Card,
    CardContent,
    CardFooter,
    CardHeader,
    CardTitle,
} from "@/shared/ui/card"
import { Skeleton } from "@/shared/ui/skeleton"
import { Switch } from "@/shared/ui/switch"
import { Tooltip, TooltipContent, TooltipTrigger } from "@/shared/ui/tooltip"

function plural(n: number, one: string, many: string) {
    return n === 1 ? one : many
}

function resolveSource(source: string) {
    if (source === "builtin") {
        return { label: "Built-in", Icon: Package }
    }
    if (source === "dev") {
        return { label: "Dev", Icon: Wrench }
    }
    return { label: "Online", Icon: Globe }
}

export default function StrategyCard({
    strategy,
    enabled,
    usageCount,
    busy,
    canDisable,
    onEnable,
    onDisable,
    onDelete,
    onConfigure,
    onOpenSourceFolder,
    sourceBadge,
    sourcePathLabel,
    sourcePathTitle,
    devChatEnabled,
    onDevChatEnabledChange,
    devChatBusy,
    onReload,
    reloading,
    disableReload,
}: {
    strategy: StrategyInfo
    enabled: boolean
    usageCount: number
    busy: boolean
    canDisable: boolean
    onEnable: () => void
    onDisable: () => void
    onDelete: () => void
    onConfigure: () => void
    onOpenSourceFolder?: () => void
    sourceBadge?: {
        label: string
        Icon: LucideIcon
    }
    sourcePathLabel?: string | null
    sourcePathTitle?: string | null
    devChatEnabled?: boolean
    onDevChatEnabledChange?: (enabled: boolean) => void
    devChatBusy?: boolean
    onReload?: () => void
    reloading?: boolean
    disableReload?: boolean
}) {
    const isBuiltin = strategy.source === "builtin"
    const isDev = strategy.source === "dev"
    const sourceMeta = sourceBadge ?? resolveSource(strategy.source)
    const SourceIcon = sourceMeta.Icon

    const versionLabel = strategy.meta.version ? `v ${strategy.meta.version}` : "v -"
    const showMemoryCloud = Boolean(strategy.features?.memoryCloud)

    const statusTag = useMemo(() => {
        if (enabled) {
            return (
                <span className="rounded-full bg-[var(--success-bg)] px-2 py-0.5 text-[11px] font-medium text-[var(--success-fg)]">
                    Enabled
                </span>
            )
        }
        return (
            <span className="rounded-full bg-[var(--error-bg)] px-2 py-0.5 text-[11px] font-medium text-[var(--error-fg)]">
                Disabled
            </span>
        )
    }, [enabled])

    return (
        <Card className="flex flex-col gap-0 py-2 border-border/60 bg-card shadow-sm">
            <CardHeader className="gap-2 px-3 pb-0">
                <div className="flex flex-wrap items-center justify-between gap-1">
                    <div className="min-w-0 flex-1">
                        <CardTitle className="text-base leading-5 text-tx break-words [overflow-wrap:anywhere] select-none">
                            {strategy.meta.name}
                        </CardTitle>
                    </div>
                    <div className="flex items-center gap-2 shrink-0">
                        <Badge variant="outline" className="border-border/60 text-tx/70 gap-1">
                            <SourceIcon className="h-3 w-3" />
                            {sourceMeta.label}
                        </Badge>
                        {statusTag}
                    </div>
                </div>

                <div className="text-sm text-tx/60 whitespace-pre-wrap break-words [overflow-wrap:anywhere]">
                    {strategy.meta.description || "No description available."}
                </div>

                <div className="flex flex-wrap items-center justify-between gap-2">
                    <div className="flex flex-wrap items-center gap-2 min-w-0">
                        <span className="inline-flex h-6 items-center rounded-full bg-bg-sidebar-button-hover/70 px-2.5 text-xs font-semibold text-tx/60">
                            {versionLabel}
                        </span>
                        {showMemoryCloud ? (
                            <span className="inline-flex h-6 items-center gap-1.5 rounded-full bg-bg-sidebar-button-hover/70 px-2.5 text-xs font-semibold text-tx/60">
                                <Cloud className="h-3.5 w-3.5" />
                                Memory Cloud
                            </span>
                        ) : null}
                    </div>

                    {isDev && sourcePathLabel && onOpenSourceFolder ? (
                        <button
                            type="button"
                            onClick={onOpenSourceFolder}
                            title={sourcePathTitle ?? sourcePathLabel}
                            className="ui-fast inline-flex h-6 items-center gap-1.5 rounded-full px-2.5 text-xs font-medium text-tx/55 transition-colors hover:bg-bg-sidebar-button-hover hover:text-tx cursor-pointer"
                        >
                            <FolderOpen className="h-3.5 w-3.5" />
                            {sourcePathLabel}
                        </button>
                    ) : null}
                </div>
            </CardHeader>

            {isDev ? (
                <CardContent className="px-3 py-2">
                    <div className="h-px bg-border/60" />
                    <div className="flex items-center justify-between gap-3 py-2">
                        <div className="flex items-center gap-2 min-w-0">
                            <span className="text-sm font-semibold text-tx/65">Open Dev Chat</span>
                            <Tooltip>
                                <TooltipTrigger asChild>
                                    <button
                                        type="button"
                                        className="ui-fast inline-flex h-5 w-5 items-center justify-center text-tx/55 transition-colors hover:text-tx cursor-pointer"
                                        aria-label="About dev chat"
                                    >
                                        <CircleHelp className="h-3.5 w-3.5" />
                                    </button>
                                </TooltipTrigger>
                                <TooltipContent side="top" sideOffset={6}>
                                    Create or remove the dedicated dev chat for this personal strategy.
                                </TooltipContent>
                            </Tooltip>
                        </div>
                        <Switch
                            checked={devChatEnabled === true}
                            disabled={busy || devChatBusy}
                            onCheckedChange={(checked) => onDevChatEnabledChange?.(checked === true)}
                            className="cursor-pointer"
                        />
                    </div>
                    <div className="h-px bg-border/60" />
                </CardContent>
            ) : (
                <CardContent className="px-3 py-2">
                    <div className="h-px bg-border/60" />
                </CardContent>
            )}

            <CardFooter className={isDev
                ? "mt-auto flex flex-wrap items-center justify-between gap-2 px-3 pt-2"
                : "mt-auto flex flex-wrap items-center justify-between gap-2 px-3 pt-0"}
            >
                <p className="text-xs text-tx/65">
                    Usage {usageCount} {plural(usageCount, "conversation", "conversations")}
                </p>

                <div className="flex flex-wrap items-center justify-end gap-2">
                    {isDev && onReload ? (
                        <Button
                            size="sm"
                            variant="outline"
                            className="gap-1 border-border/60 cursor-pointer"
                            disabled={busy || reloading || disableReload}
                            onClick={onReload}
                        >
                            <RefreshCw className="h-3.5 w-3.5" />
                            {reloading ? "Reloading..." : "Reload"}
                        </Button>
                    ) : null}

                    <Button
                        size="sm"
                        variant="outline"
                        className="gap-1 border-border/60 cursor-pointer"
                        onClick={onConfigure}
                        disabled={busy}
                    >
                        <Settings className="h-3.5 w-3.5" />
                        Settings
                    </Button>

                    <Button
                        size="sm"
                        variant="outline"
                        className="border-border/60 cursor-pointer"
                        onClick={enabled ? onDisable : onEnable}
                        disabled={busy || (enabled ? !canDisable : false)}
                    >
                        {busy ? "Working..." : enabled ? "Disable" : "Enable"}
                    </Button>

                    <button
                        type="button"
                        aria-label="Delete strategy"
                        disabled={busy || isBuiltin}
                        onClick={onDelete}
                        className="inline-flex h-7 w-7 items-center justify-center rounded-md text-[var(--error-fg)] hover:bg-[var(--error-bg)]/25 disabled:cursor-not-allowed disabled:opacity-40 cursor-pointer"
                    >
                        <Trash2 className="h-4 w-4" />
                    </button>
                </div>
            </CardFooter>
        </Card>
    )
}

function StrategyCardSkeleton() {
    return (
        <Card className="flex flex-col gap-0 py-4 border-border/60 bg-card shadow-sm">
            <CardHeader className="space-y-2 pb-3">
                <div className="flex items-start justify-between gap-2">
                    <Skeleton className="h-5 w-44" />
                    <div className="flex gap-2">
                        <Skeleton className="h-5 w-20 rounded-full" />
                        <Skeleton className="h-5 w-20 rounded-full" />
                    </div>
                </div>
                <Skeleton className="h-4 w-full" />
                <div className="flex gap-2">
                    <Skeleton className="h-5 w-16 rounded-full" />
                    <Skeleton className="h-5 w-24 rounded-full" />
                </div>
            </CardHeader>

            <CardContent className="py-1">
                <div className="h-px bg-border/60" />
            </CardContent>

            <CardFooter className="mt-auto flex items-center justify-between gap-2 pt-0">
                <Skeleton className="h-4 w-36" />
                <div className="flex gap-2">
                    <Skeleton className="h-8 w-20" />
                    <Skeleton className="h-8 w-20" />
                    <Skeleton className="h-8 w-8" />
                </div>
            </CardFooter>
        </Card>
    )
}

StrategyCard.Skeleton = StrategyCardSkeleton
