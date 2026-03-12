import { useCallback, useEffect, useState } from 'react'
import { Sparkles } from 'lucide-react'
import { toast } from 'sonner'

import { Button } from '@/shared/ui/button'
import {
    Dialog,
    DialogContent,
    DialogDescription,
    DialogFooter,
    DialogHeader,
    DialogTitle,
} from '@/shared/ui/dialog'
import { strategyDevService } from '@/features/strategy-dev/services/strategyDevService'
import { useDevStrategySourceStore } from '@/features/strategy-dev/state/devStrategySourceStore'
import { useChatStore } from '@/features/chat/state/chatStore'
import StrategyCard from './StrategyCard'
import type { DevStrategy } from './WriteStrategyPanel'
import type { StrategyInfo } from '@contracts'

function pathLabel(filePath: string): string {
    const parts = filePath.split(/[/\\]/g)
    return parts[parts.length - 1] || filePath
}

export default function PersonalStrategyPanel({
    devStrategies,
    onRefresh,
    focusDevId,
    busyId,
    canDisable,
    onEnable,
    onDisable,
    onConfigure,
}: {
    devStrategies: DevStrategy[]
    onRefresh: () => Promise<void>
    focusDevId?: string | null
    busyId: string | null
    canDisable: boolean
    onEnable: (strategyId: string) => void
    onDisable: (strategy: StrategyInfo) => void
    onConfigure: (strategy: StrategyInfo) => void
}) {
    const conversations = useChatStore((s) => s.conversations)
    const setConversations = useChatStore((s) => s.setConversations)
    const [reloadingId, setReloadingId] = useState<string | null>(null)
    const [devChatBusyId, setDevChatBusyId] = useState<string | null>(null)
    const [selectedDevId, setSelectedDevId] = useState<string | null>(null)
    const [removeTarget, setRemoveTarget] = useState<DevStrategy | null>(null)
    const [removing, setRemoving] = useState(false)
    const [viewTarget, setViewTarget] = useState<DevStrategy | null>(null)
    const [viewOpen, setViewOpen] = useState(false)
    const [viewLoading, setViewLoading] = useState(false)
    const { sources, setSnapshot, setError, clear } = useDevStrategySourceStore()

    useEffect(() => {
        if (!focusDevId) return
        setSelectedDevId(focusDevId)
        const target = document.getElementById(`dev-strategy-${focusDevId}`)
        if (target) {
            target.scrollIntoView({ block: 'nearest' })
        }
    }, [focusDevId])

    useEffect(() => {
        void window.chatAPI.getAllConversations()
            .then(setConversations)
            .catch(() => null)
    }, [setConversations])

    useEffect(() => {
        if (!viewOpen || !viewTarget) return
        const cached = sources[viewTarget.id]
        if (cached?.text || cached?.error) return
        let mounted = true
        setViewLoading(true)
        strategyDevService.getSnapshot({ strategyId: viewTarget.id })
            .then((res) => {
                if (!mounted) return
                if (res.ok) {
                    if (res.sourceSnapshot) {
                        setSnapshot(viewTarget.id, res.sourceSnapshot)
                    } else if (res.sourceError) {
                        setError(viewTarget.id, res.sourceError)
                    } else {
                        setError(viewTarget.id, 'Snapshot not available')
                    }
                } else {
                    setError(viewTarget.id, res.error ?? res.sourceError ?? 'Snapshot not available')
                }
            })
            .catch((err) => {
                if (!mounted) return
                setError(viewTarget.id, err instanceof Error ? err.message : 'Snapshot not available')
            })
            .finally(() => {
                if (mounted) setViewLoading(false)
            })
        return () => {
            mounted = false
        }
    }, [viewOpen, viewTarget, sources, setSnapshot, setError])

    const handleReloadFromFile = useCallback(async (strategyId: string, filePath: string) => {
        if (reloadingId) return
        setReloadingId(strategyId)
        try {
            const result = await strategyDevService.compileAndTest({
                filePath,
                displayName: pathLabel(filePath),
            })
            if (!result.ok || !result.code) {
                await strategyDevService.recordTest({
                    strategyId,
                    status: 'failed',
                    diagnostics: result.diagnostics,
                })
                toast.error('Reload failed', {
                    description: result.errors?.[0]?.message ?? 'Compile or test failed.',
                })
                return
            }

            const reloadRes = await strategyDevService.reload({
                strategyId,
                filePath,
                code: result.code,
                meta: result.meta,
                paramsSchema: result.paramsSchema,
                hash: result.hash,
                diagnostics: result.diagnostics,
            })
            if (!reloadRes.ok) {
                await strategyDevService.recordTest({
                    strategyId,
                    status: 'failed',
                    diagnostics: result.diagnostics,
                })
                toast.error('Reload failed', {
                    description: reloadRes.error ?? 'Reload failed.',
                })
                return
            }
            if (reloadRes.sourceSnapshot) {
                setSnapshot(strategyId, reloadRes.sourceSnapshot)
            } else if (reloadRes.sourceError) {
                setError(strategyId, reloadRes.sourceError)
            }
            await strategyDevService.recordTest({
                strategyId,
                status: 'passed',
                diagnostics: result.diagnostics,
            })
            await onRefresh()
            toast.success('Reloaded', {
                description: 'Personal strategy updated from source file.',
            })
        } finally {
            setReloadingId(null)
        }
    }, [onRefresh, reloadingId, setError, setSnapshot])

    const handleRemoveConfirm = useCallback(async () => {
        if (!removeTarget) return
        setRemoving(true)
        try {
            await strategyDevService.remove({ strategyId: removeTarget.id })
            clear(removeTarget.id)
            setRemoveTarget(null)
            if (selectedDevId === removeTarget.id) setSelectedDevId(null)
            await onRefresh()
        } catch (err) {
            toast.error('Remove failed', {
                description: err instanceof Error ? err.message : 'Failed to remove strategy.',
            })
        } finally {
            setRemoving(false)
        }
    }, [clear, onRefresh, removeTarget, selectedDevId])

    const handleSetDevChatEnabled = useCallback(async (strategyId: string, enabled: boolean) => {
        if (devChatBusyId) return
        const matchingConversations = conversations
            .filter((conversation) => conversation.strategy_id === strategyId)
            .sort((a, b) => (b.updated_at ?? 0) - (a.updated_at ?? 0))

        if (enabled && matchingConversations[0]?.id) {
            return
        }
        if (!enabled && matchingConversations.length === 0) {
            return
        }

        setDevChatBusyId(strategyId)
        try {
            if (enabled) {
                await strategyDevService.openChat({ strategyId })
                const nextConversations = await window.chatAPI.getAllConversations()
                setConversations(nextConversations)
                return
            }

            await Promise.all(
                matchingConversations.map((conversation) => window.chatAPI.deleteConversation(conversation.id))
            )
            const nextConversations = await window.chatAPI.getAllConversations()
            setConversations(nextConversations)
        } catch (err) {
            toast.error(enabled ? 'Open dev chat failed' : 'Close dev chat failed', {
                description: err instanceof Error ? err.message : 'Please try again.',
            })
        } finally {
            setDevChatBusyId(null)
        }
    }, [conversations, devChatBusyId, setConversations])

    return (
        <section className="h-full min-h-0 overflow-y-auto scrollbar-sidebar">
            <div className="px-5 pb-6">
                <div className="pt-3 pb-2">
                    <div className="flex items-center justify-between gap-3">
                        <div className="text-xl text-tx font-semibold select-none">Personal</div>
                        <span className="shrink-0 text-xs text-tx/40">
                            {devStrategies.length} installed
                        </span>
                    </div>
                </div>

                {devStrategies.length === 0 ? (
                    <div className="mt-6 rounded-lg border border-border/60 bg-muted/30 p-6 text-sm text-tx/60">
                        No personal strategies yet.
                    </div>
                ) : (
                    <div className="mt-4 space-y-4">
                        {devStrategies.map((strategy) => {
                            const hasDevChat = conversations.some((conversation) => conversation.strategy_id === strategy.id)

                            return (
                                <div
                                    key={strategy.id}
                                    id={`dev-strategy-${strategy.id}`}
                                    className={selectedDevId === strategy.id ? 'rounded-xl ring-1 ring-border' : undefined}
                                >
                                    <StrategyCard
                                        strategy={strategy.strategy}
                                        enabled={strategy.enabled}
                                        usageCount={strategy.usageCount ?? 0}
                                        busy={busyId === strategy.id}
                                        canDisable={canDisable}
                                        onEnable={() => onEnable(strategy.id)}
                                        onDisable={() => onDisable(strategy.strategy)}
                                        onDelete={() => setRemoveTarget(strategy)}
                                        onConfigure={() => onConfigure(strategy.strategy)}
                                        sourceBadge={{ label: 'Personal', Icon: Sparkles }}
                                        sourcePathLabel={strategy.sourcePath ? pathLabel(strategy.sourcePath) : null}
                                        sourcePathTitle={strategy.sourcePath ?? null}
                                        onOpenSourceFolder={
                                            strategy.sourcePath
                                                ? () => void strategyDevService.openSourceFolder({ strategyId: strategy.id })
                                                : undefined
                                        }
                                        devChatEnabled={hasDevChat}
                                        onDevChatEnabledChange={(enabled) => void handleSetDevChatEnabled(strategy.id, enabled)}
                                        devChatBusy={devChatBusyId === strategy.id}
                                        onReload={() => {
                                            if (!strategy.sourcePath) return
                                            void handleReloadFromFile(strategy.id, strategy.sourcePath)
                                        }}
                                        reloading={reloadingId === strategy.id}
                                        disableReload={!strategy.sourcePath}
                                    />
                                </div>
                            )
                        })}
                    </div>
                )}
            </div>

            <Dialog open={Boolean(removeTarget)} onOpenChange={(open) => {
                if (!open) setRemoveTarget(null)
            }}>
                <DialogContent className="border-border">
                    <DialogHeader>
                        <DialogTitle>Remove personal strategy?</DialogTitle>
                        <DialogDescription>
                            {removeTarget?.usageCount
                                ? `This strategy is used by ${removeTarget.usageCount} conversation${removeTarget.usageCount > 1 ? 's' : ''}. They will fall back to the default strategy.`
                                : 'This will remove the personal strategy from this device.'}
                        </DialogDescription>
                    </DialogHeader>
                    <DialogFooter>
                        <Button
                            variant="outline"
                            onClick={() => setRemoveTarget(null)}
                            disabled={removing}
                            className="cursor-pointer"
                        >
                            Cancel
                        </Button>
                        <Button
                            variant="destructive"
                            onClick={handleRemoveConfirm}
                            disabled={removing}
                            className="cursor-pointer bg-[var(--error-bg)] text-[var(--error-fg)] hover:bg-[var(--error-bg)]/90"
                        >
                            {removing ? 'Removing...' : 'Remove'}
                        </Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>

            <Dialog open={viewOpen} onOpenChange={(open) => {
                setViewOpen(open)
                if (!open) setViewTarget(null)
            }}>
                <DialogContent className="max-w-3xl h-[70vh] flex flex-col">
                    <DialogHeader>
                        <DialogTitle>TypeScript Snapshot</DialogTitle>
                        <DialogDescription>
                            {viewTarget?.name ?? 'Personal strategy'}
                        </DialogDescription>
                    </DialogHeader>
                    <div className="flex items-center justify-between">
                        <div className="text-xs text-tx/50">
                            {viewTarget?.sourcePath ? pathLabel(viewTarget.sourcePath) : 'No source path'}
                        </div>
                        <Button
                            size="sm"
                            variant="outline"
                            disabled={!viewTarget || !sources[viewTarget.id]?.text}
                            onClick={async () => {
                                if (!viewTarget) return
                                const text = sources[viewTarget.id]?.text
                                if (!text) return
                                await navigator.clipboard.writeText(text)
                                toast.success('Copied')
                            }}
                        >
                            Copy
                        </Button>
                    </div>
                    {viewTarget?.sourcePath ? (
                        <div className="text-[10px] text-tx/50 break-words">
                            {viewTarget.sourcePath}
                        </div>
                    ) : null}
                    <div className="flex-1 min-h-0 overflow-hidden">
                        {viewTarget ? (
                            viewLoading ? (
                                <div className="mt-2 rounded-md border border-border/60 bg-muted/30 px-3 py-2 text-xs text-tx/60">
                                    Loading snapshot...
                                </div>
                            ) : sources[viewTarget.id]?.error ? (
                                <div className="mt-2 rounded-md border border-[var(--error-fg)]/30 bg-[var(--error-bg)]/20 px-3 py-2 text-xs text-[var(--error-fg)]">
                                    {sources[viewTarget.id]?.error}
                                </div>
                            ) : sources[viewTarget.id]?.text ? (
                                <pre className="mt-2 h-full overflow-auto rounded-md border border-border/60 bg-bg/60 p-3 text-[11px] text-tx/70 whitespace-pre-wrap break-words">
                                    {sources[viewTarget.id]?.text}
                                </pre>
                            ) : (
                                <div className="mt-2 rounded-md border border-border/60 bg-muted/30 px-3 py-2 text-xs text-tx/60">
                                    Snapshot not available in this session. Reload the strategy to capture the latest TypeScript source.
                                </div>
                            )
                        ) : null}
                    </div>
                </DialogContent>
            </Dialog>
        </section>
    )
}
