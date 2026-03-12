import { useEffect, useMemo, useState } from "react"
import { useSearchParams } from "react-router-dom"
import type { StrategyInfo, StrategyPrefs, StrategyUsageCounts } from "@contracts"

import { toast } from "sonner"
import { strategyService } from "@/features/strategies/services/strategyService"
import { Button } from "@/shared/ui/button"
import {
    Dialog,
    DialogContent,
    DialogDescription,
    DialogFooter,
    DialogHeader,
    DialogTitle,
} from "@/shared/ui/dialog"

import ReassignDialog from "../components/ReassignDialog"
import StrategyPanel from "../components/StrategyPanel"
import StrategySidebar, { type StrategyMode } from "../components/StrategySidebar"
import type { DevStrategy } from "../components/WriteStrategyPanel"
import StrategyConfigDialog from "../components/StrategyConfigDialog"

type ReassignAction = "disable" | "uninstall"

type ReassignState = {
    open: boolean
    action: ReassignAction
    strategy: StrategyInfo | null
    reassignTo: string
    usageCount: number
}

const EMPTY_REASSIGN: ReassignState = {
    open: false,
    action: "disable",
    strategy: null,
    reassignTo: "",
    usageCount: 0,
}

type UninstallConfirmState = {
    open: boolean
    strategy: StrategyInfo | null
    reassignTo: string
}

const EMPTY_UNINSTALL_CONFIRM: UninstallConfirmState = {
    open: false,
    strategy: null,
    reassignTo: "",
}

export default function StrategySettings() {
    const [strategies, setStrategies] = useState<StrategyInfo[]>([])
    const [prefs, setPrefs] = useState<StrategyPrefs | null>(null)
    const [usageCounts, setUsageCounts] = useState<StrategyUsageCounts>({})

    const [loading, setLoading] = useState(true)
    const [error, setError] = useState<string | null>(null)

    const [busyId, setBusyId] = useState<string | null>(null)
    const [reassignState, setReassignState] = useState<ReassignState>(EMPTY_REASSIGN)
    const [configOpen, setConfigOpen] = useState(false)
    const [configStrategy, setConfigStrategy] = useState<StrategyInfo | null>(null)
    const [configOverrides, setConfigOverrides] = useState<Record<string, unknown>>({})
    const [configLoading, setConfigLoading] = useState(false)
    const [configSaving, setConfigSaving] = useState(false)
    const [configError, setConfigError] = useState<string | null>(null)
    const [uninstallConfirm, setUninstallConfirm] = useState<UninstallConfirmState>(EMPTY_UNINSTALL_CONFIRM)
    const [mode, setMode] = useState<StrategyMode>("write")
    const [searchParams] = useSearchParams()

    const enabledIds = useMemo(() => prefs?.enabledIds ?? [], [prefs?.enabledIds])

    const enabledStrategies = useMemo(() => {
        if (!prefs) return []
        return strategies.filter((s) => enabledIds.includes(s.id) && s.enabled !== false)
    }, [strategies, prefs, enabledIds])

    const canDisable = enabledStrategies.length > 1

    const counts = useMemo(
        () => ({
            builtin: strategies.filter((s) => s.source === "builtin").length,
            community: strategies.filter((s) => s.source !== "builtin" && s.source !== "dev").length,
            personal: strategies.filter((s) => s.source === "dev").length,
        }),
        [strategies]
    )

    const devStrategies = useMemo<DevStrategy[]>(
        () =>
            strategies
                .filter((strategy) => strategy.source === "dev")
                .map((strategy) => ({
                    strategy,
                    id: strategy.id,
                    name: strategy.meta?.name ?? strategy.id,
                    description: strategy.meta?.description,
                    version: strategy.meta?.version ?? "0.1.0",
                    sourcePath: strategy.manifest?.dev?.sourcePath,
                    status: strategy.manifest?.dev?.lastTest?.status ?? "unknown",
                    diagnostics: strategy.manifest?.dev?.lastTest?.diagnostics,
                    usageCount: usageCounts[strategy.id] ?? 0,
                    enabled: enabledIds.includes(strategy.id) && strategy.enabled !== false,
                })),
        [strategies, usageCounts, enabledIds]
    )

    const focusDevId = searchParams.get("dev")
    const modeParam = searchParams.get("mode")

    useEffect(() => {
        if (modeParam === "write") {
            setMode("write")
            return
        }
        if (focusDevId) {
            setMode("personal")
        }
    }, [modeParam, focusDevId])

    async function loadAll() {
        setLoading(true)
        setError(null)
        try {
            const [list, nextPrefs, usage] = await Promise.all([
                strategyService.list(),
                strategyService.getPrefs(),
                strategyService.getUsageCounts(),
            ])
            setStrategies(list)
            setPrefs(nextPrefs)
            setUsageCounts(usage)
        } catch (err) {
            setError(err instanceof Error ? err.message : "Failed to load strategies")
        } finally {
            setLoading(false)
        }
    }

    useEffect(() => {
        void loadAll()
    }, [])

    async function enableStrategy(strategyId: string) {
        if (!prefs) return
        setBusyId(strategyId)
        try {
            const nextEnabled = Array.from(new Set([...(prefs.enabledIds ?? []), strategyId]))
            const nextPrefs = await strategyService.setPrefs({ enabledIds: nextEnabled })
            setPrefs(nextPrefs)
            const nextStrategies = await strategyService.list()
            setStrategies(nextStrategies)
            toast.success("Enabled", { description: "Strategy is now available." })
        } catch (err) {
            toast.error("Enable failed", {
                description: err instanceof Error ? err.message : "Please try again.",
            })
        } finally {
            setBusyId(null)
        }
    }

    function openReassignDialog(action: ReassignAction, strategy: StrategyInfo, usageCount: number) {
        const candidates = enabledStrategies.filter((s) => s.id !== strategy.id)
        const fallback = candidates[0]?.id ?? ""
        setReassignState({
            open: true,
            action,
            strategy,
            reassignTo: fallback,
            usageCount,
        })
    }

    async function disableOrUninstall(strategy: StrategyInfo, action: ReassignAction) {
        if (!prefs) return

        const usageCount = usageCounts[strategy.id] ?? 0
        const candidates = enabledStrategies.filter((s) => s.id !== strategy.id)
        const fallback = candidates[0]?.id

        // Guard: keep at least one enabled strategy
        if (!fallback) {
            toast.error("Action blocked", { description: "Keep at least one enabled strategy." })
            return
        }

        // uninstall keeps reassignment flow when used by conversations
        if (action === "uninstall" && usageCount > 0) {
            openReassignDialog(action, strategy, usageCount)
            return
        }

        if (action === "uninstall") {
            setUninstallConfirm({
                open: true,
                strategy,
                reassignTo: fallback,
            })
            return
        }

        // disable and not used -> can act immediately
        await handleReassignConfirm(action, strategy.id, fallback)
    }

    async function handleReassignConfirm(action: ReassignAction, strategyId: string, reassignTo: string) {
        setBusyId(strategyId)
        try {
            if (action === "disable") {
                await strategyService.disable(strategyId, { reassignTo })
                toast.success("Disabled", { description: "Existing conversations keep their strategy until you switch manually." })
            } else {
                await strategyService.uninstall(strategyId, { reassignTo })
                toast.success("Deleted", { description: "Strategy removed and conversations reassigned." })
            }

            setReassignState(EMPTY_REASSIGN)
            await loadAll()
        } catch (err) {
            toast.error("Action failed", {
                description: err instanceof Error ? err.message : "Please try again.",
            })
        } finally {
            setBusyId(null)
        }
    }

    async function handleOpenConfigure(strategy: StrategyInfo) {
        setConfigStrategy(strategy)
        setConfigOpen(true)
        setConfigLoading(true)
        setConfigError(null)
        try {
            const params = await strategyService.getParams(strategy.id)
            setConfigOverrides(params ?? {})
        } catch (err) {
            setConfigOverrides({})
            setConfigError(err instanceof Error ? err.message : "Failed to load strategy params")
        } finally {
            setConfigLoading(false)
        }
    }

    async function handleSaveConfig(params: Record<string, unknown>) {
        if (!configStrategy) return
        setConfigSaving(true)
        setConfigError(null)
        try {
            const saved = await strategyService.setParams(configStrategy.id, params)
            setConfigOverrides(saved ?? {})
            toast.success("Saved", { description: "Strategy config updated." })
            await loadAll()
        } catch (err) {
            setConfigError(err instanceof Error ? err.message : "Failed to save strategy params")
        } finally {
            setConfigSaving(false)
        }
    }

    return (
        <div className="h-full min-h-0 flex flex-col bg-bg-chatarea">
            <div className="px-5">
                <div className="h-12 [-webkit-app-region:drag] pt-4">
                    <div className="text-xl font-semibold text-tx select-none">Strategy</div>
                </div>
                <div className="mt-1 border-b border-border" />
            </div>

            <div className="min-h-0 flex-1 flex">
                <StrategySidebar mode={mode} onSelect={setMode} counts={counts} />
                <div className="min-h-0 flex-1 overflow-hidden">
                    <StrategyPanel
                        mode={mode}
                        strategies={strategies}
                        enabledIds={enabledIds}
                        usageCounts={usageCounts}
                        loading={loading}
                        error={error}
                        busyId={busyId}
                        canDisable={canDisable}
                        onEnable={enableStrategy}
                        onDisable={(strategy) => disableOrUninstall(strategy, "disable")}
                        onDelete={(strategy) => disableOrUninstall(strategy, "uninstall")}
                        onConfigure={handleOpenConfigure}
                        devStrategies={devStrategies}
                        onRefresh={loadAll}
                        onOpenPersonal={() => setMode("personal")}
                        focusDevId={focusDevId}
                        onDevEnable={enableStrategy}
                        onDevDisable={(strategy) => disableOrUninstall(strategy, "disable")}
                        onDevConfigure={handleOpenConfigure}
                    />
                </div>
            </div>

            <ReassignDialog
                open={reassignState.open}
                action={reassignState.action}
                strategy={reassignState.strategy}
                usageCount={reassignState.usageCount}
                reassignTo={reassignState.reassignTo}
                candidates={enabledStrategies.filter((s) => s.id !== reassignState.strategy?.id)}
                onOpenChange={(open) => setReassignState((prev) => ({ ...prev, open }))}
                onReassignToChange={(id) => setReassignState((prev) => ({ ...prev, reassignTo: id }))}
                onCancel={() => setReassignState(EMPTY_REASSIGN)}
                onConfirm={() => {
                    if (!reassignState.strategy) return
                    void handleReassignConfirm(reassignState.action, reassignState.strategy.id, reassignState.reassignTo)
                }}
            />

            <StrategyConfigDialog
                open={configOpen}
                strategy={configStrategy}
                loading={configLoading}
                saving={configSaving}
                error={configError}
                overrides={configOverrides}
                onOpenChange={(open) => {
                    setConfigOpen(open)
                    if (!open) {
                        setConfigError(null)
                    }
                }}
                onSave={handleSaveConfig}
            />

            <Dialog
                open={uninstallConfirm.open}
                onOpenChange={(open) => setUninstallConfirm((prev) => ({ ...prev, open }))}
            >
                <DialogContent className="border-border">
                    <DialogHeader>
                        <DialogTitle>Uninstall strategy?</DialogTitle>
                        <DialogDescription>
                            {uninstallConfirm.strategy
                                ? `This will uninstall "${uninstallConfirm.strategy.meta.name}".`
                                : "This will uninstall the selected strategy."}
                        </DialogDescription>
                    </DialogHeader>
                    <DialogFooter>
                        <Button
                            type="button"
                            variant="outline"
                            className="cursor-pointer"
                            onClick={() => setUninstallConfirm(EMPTY_UNINSTALL_CONFIRM)}
                            disabled={busyId != null}
                        >
                            Cancel
                        </Button>
                        <Button
                            type="button"
                            className="cursor-pointer bg-[var(--error-bg)] text-[var(--error-fg)] hover:bg-[var(--error-bg)]/90"
                            onClick={() => {
                                if (!uninstallConfirm.strategy || !uninstallConfirm.reassignTo) return
                                void handleReassignConfirm("uninstall", uninstallConfirm.strategy.id, uninstallConfirm.reassignTo)
                                setUninstallConfirm(EMPTY_UNINSTALL_CONFIRM)
                            }}
                            disabled={busyId != null}
                        >
                            Uninstall
                        </Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>
        </div>
    )
}
