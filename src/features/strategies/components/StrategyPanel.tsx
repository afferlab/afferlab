import { useMemo } from 'react'
import type { StrategyInfo, StrategyUsageCounts } from '@contracts'

import PersonalStrategyPanel from './PersonalStrategyPanel'
import StrategyCard from './StrategyCard'
import WriteStrategyPanel, { type DevStrategy } from './WriteStrategyPanel'
import type { StrategyMode } from './StrategySidebar'

const GRID_CLASS = 'mt-4 grid grid-cols-1 gap-4 pb-6'

function getHeaderTitle(mode: StrategyMode) {
    if (mode === 'download') return 'Download Strategy'
    if (mode === 'builtin') return 'Built-in'
    if (mode === 'community') return 'Community'
    if (mode === 'personal') return 'Personal'
    return 'Write Strategy'
}

export default function StrategyPanel({
    mode,
    strategies,
    enabledIds,
    usageCounts,
    loading,
    error,
    busyId,
    canDisable,
    onEnable,
    onDisable,
    onDelete,
    onConfigure,
    devStrategies,
    onRefresh,
    onOpenPersonal,
    focusDevId,
    onDevEnable,
    onDevDisable,
    onDevConfigure,
}: {
    mode: StrategyMode
    strategies: StrategyInfo[]
    enabledIds: string[]
    usageCounts: StrategyUsageCounts
    loading: boolean
    error: string | null
    busyId: string | null
    canDisable: boolean
    onEnable: (strategyId: string) => void
    onDisable: (strategy: StrategyInfo) => void
    onDelete: (strategy: StrategyInfo) => void
    onConfigure: (strategy: StrategyInfo) => void
    devStrategies: DevStrategy[]
    onRefresh: () => Promise<void>
    onOpenPersonal: () => void
    focusDevId?: string | null
    onDevEnable: (strategyId: string) => void
    onDevDisable: (strategy: StrategyInfo) => void
    onDevConfigure: (strategy: StrategyInfo) => void
}) {
    const filteredStrategies = useMemo(() => {
        if (mode === 'builtin') return strategies.filter((s) => s.source === 'builtin')
        if (mode === 'community') return strategies.filter((s) => s.source !== 'builtin' && s.source !== 'dev')
        return []
    }, [mode, strategies])

    if (mode === 'write') {
        return (
            <WriteStrategyPanel
                devStrategies={devStrategies}
                onRefresh={onRefresh}
                onOpenPersonal={onOpenPersonal}
            />
        )
    }

    if (mode === 'personal') {
        return (
            <PersonalStrategyPanel
                devStrategies={devStrategies}
                onRefresh={onRefresh}
                focusDevId={focusDevId ?? undefined}
                busyId={busyId}
                canDisable={canDisable}
                onEnable={onDevEnable}
                onDisable={onDevDisable}
                onConfigure={onDevConfigure}
            />
        )
    }

    const headerTitle = getHeaderTitle(mode)

    const renderGrid = (items: StrategyInfo[]) => (
        <div className={GRID_CLASS}>
            {loading
                ? Array.from({ length: 6 }).map((_, idx) => (
                    <StrategyCard.Skeleton key={`strategy-skel-${idx}`} />
                ))
                : items.map((strategy) => {
                    const isEnabled = enabledIds.includes(strategy.id) && strategy.enabled !== false
                    const usageCount = usageCounts[strategy.id] ?? 0

                    return (
                        <StrategyCard
                            key={strategy.id}
                            strategy={strategy}
                            enabled={isEnabled}
                            usageCount={usageCount}
                            busy={busyId === strategy.id}
                            canDisable={canDisable}
                            onEnable={() => onEnable(strategy.id)}
                            onDisable={() => onDisable(strategy)}
                            onDelete={() => onDelete(strategy)}
                            onConfigure={() => onConfigure(strategy)}
                        />
                    )
                })}
        </div>
    )

    const showCounts = mode === 'builtin' || mode === 'community'

    return (
        <section className="h-full min-h-0 overflow-y-auto scrollbar-sidebar">
            <div className="px-5">
                <div className="flex items-center justify-between gap-3 pt-3 pb-2">
                    <div className="text-xl text-tx font-semibold select-none">{headerTitle}</div>
                    {showCounts ? (
                        <span className="text-xs text-tx/40">
                            {filteredStrategies.length} installed
                        </span>
                    ) : null}
                </div>

                {mode === 'download' ? (
                    <div className="mt-6 text-sm text-tx/60">
                        Coming soon.
                    </div>
                ) : null}

                {error ? <p className="mt-4 text-sm text-destructive">{error}</p> : null}

                {mode === 'download' ? null : loading ? (
                    renderGrid(filteredStrategies)
                ) : filteredStrategies.length > 0 ? (
                    renderGrid(filteredStrategies)
                ) : (
                    <div className="mt-6 text-sm text-tx/60">
                        No strategies found.
                    </div>
                )}
            </div>
        </section>
    )
}
