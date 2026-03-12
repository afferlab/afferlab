import type { StrategyInfo } from "@contracts"

import { Button } from "@/shared/ui/button"
import {
    Dialog,
    DialogContent,
    DialogDescription,
    DialogFooter,
    DialogHeader,
    DialogTitle,
} from "@/shared/ui/dialog"
import SettingsDropdown from "@/features/settings/shell/components/SettingsDropdown"

type ReassignAction = "disable" | "uninstall"

export default function ReassignDialog({
                                           open,
                                           action,
                                           strategy,
                                           usageCount,
                                           reassignTo,
                                           candidates,
                                           onOpenChange,
                                           onReassignToChange,
                                           onCancel,
                                           onConfirm,
                                       }: {
    open: boolean
    action: ReassignAction
    strategy: StrategyInfo | null
    usageCount: number
    reassignTo: string
    candidates: StrategyInfo[]
    onOpenChange: (open: boolean) => void
    onReassignToChange: (id: string) => void
    onCancel: () => void
    onConfirm: () => void
}) {
    return (
        <Dialog open={open} onOpenChange={onOpenChange}>
            <DialogContent>
                <DialogHeader>
                    <DialogTitle>{action === "disable" ? "Disable Strategy" : "Delete Strategy"}</DialogTitle>
                    <DialogDescription>
                        {strategy ? (
                            <>
                                <span className="font-medium text-tx">{strategy.meta.name}</span> is used by{" "}
                                <span className="font-medium text-tx">{usageCount}</span> conversation{usageCount === 1 ? "" : "s"}.
                                Reassign them before continuing.
                            </>
                        ) : (
                            "Reassign affected conversations before continuing."
                        )}
                    </DialogDescription>
                </DialogHeader>

                <div className="space-y-3">
                    <SettingsDropdown
                        value={reassignTo}
                        onChange={onReassignToChange}
                        options={candidates.map((s) => ({ value: s.id, label: s.meta.name }))}
                        placeholder="Select reassignment target"
                        triggerClassName="w-full"
                    />
                    <p className="text-xs text-tx/50">
                        Conversations currently using this strategy will be switched to the selected strategy.
                    </p>
                </div>

                <DialogFooter>
                    <Button variant="outline" onClick={onCancel}>
                        Cancel
                    </Button>
                    <Button
                        variant={action === "uninstall" ? "destructive" : "default"}
                        disabled={!strategy || !reassignTo}
                        onClick={onConfirm}
                    >
                        {action === "disable" ? "Disable" : "Delete"}
                    </Button>
                </DialogFooter>
            </DialogContent>
        </Dialog>
    )
}
