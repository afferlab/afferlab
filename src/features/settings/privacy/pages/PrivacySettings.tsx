import { useEffect, useState } from "react"
import { HardDrive } from "lucide-react"
import SettingsList from "@/features/settings/shell/components/SettingsList"
import SettingsRow from "@/features/settings/shell/components/SettingsRow"
import { Button } from "@/shared/ui/button"
import { toast } from "sonner"

type DataSection = "local"

export default function PrivacySettings() {
    const [activeSection, setActiveSection] = useState<DataSection>("local")
    const [userDataPath, setUserDataPath] = useState<string | null>(null)
    const [busyKey, setBusyKey] = useState<string | null>(null)

    useEffect(() => {
        let mounted = true
        window.chatAPI?.getUserDataPath?.()
            .then((path) => {
                if (mounted) setUserDataPath(path)
            })
            .catch(() => null)
        return () => {
            mounted = false
        }
    }, [])

    const isMac = navigator.userAgent.includes("Mac")
    const revealLabel = isMac ? "Open in Finder" : "Reveal in Explorer"
    const openFolderLabel = isMac ? "Open in Finder" : "Open"

    const runAction = async (
        key: string,
        action: (() => Promise<unknown> | undefined) | undefined,
        successMessage: string
    ) => {
        if (!action) {
            toast.error("Action unavailable")
            return
        }
        setBusyKey(key)
        try {
            await action()
            toast.success(successMessage)
        } catch (err) {
            toast.error("Action failed", {
                description: err instanceof Error ? err.message : "Please try again.",
            })
        } finally {
            setBusyKey(null)
        }
    }

    return (
        <div className="h-full min-h-0 flex flex-col bg-bg-chatarea">
            <div className="px-5">
                <div className="h-12 [-webkit-app-region:drag] pt-4">
                    <div className="text-xl text-tx font-semibold select-none">Data & Privacy</div>
                </div>
                <div className="mt-1 border-b border-border" />
            </div>

            <div className="min-h-0 flex-1 flex">
                <aside className="w-62 h-full bg-bg-chatarea border-r border-border text-tx flex flex-col overflow-hidden">
                    <SettingsList contentClassName="pt-3">
                        <SettingsRow
                            label="Local Data"
                            active={activeSection === "local"}
                            leading={<HardDrive className="h-5 w-5 opacity-80" />}
                            className={activeSection === "local" ? "border border-border !shadow-none" : "border border-transparent"}
                            onClick={() => setActiveSection("local")}
                        />
                    </SettingsList>
                </aside>

                <section className="min-h-0 flex-1 overflow-y-auto scrollbar-sidebar bg-bg-chatarea">
                    <div className="px-5 mt-3 space-y-3">
                        <div className="rounded-md border border-border bg-bg-setting-card px-3 py-3">
                            <div className="text-sm font-extrabold text-tx py-1 select-none">
                                Local Data
                            </div>
                            <div className="mt-1 border-b border-border" />
                            <div className="mt-3 text-sm text-tx/60 leading-relaxed">
                                AfferLab stores all conversations, strategies, and settings locally on your device.
                                Messages are sent directly to the model provider you choose. AfferLab does not proxy or store them.
                            </div>
                        </div>

                        <div className="rounded-md border border-border bg-bg-setting-card px-3 py-3">
                            <div className="text-sm font-extrabold text-tx py-1 select-none">
                                Storage
                            </div>
                            <div className="mt-1 border-b border-border" />
                            <div className="mt-3 space-y-3">
                                <div className="rounded-md py-2">
                                    <div className="flex items-center justify-between gap-4">
                                        <div className="text-sm font-semibold text-tx">
                                            Data Folder
                                        </div>
                                        <Button
                                            size="sm"
                                            variant="outline"
                                            className="border-border cursor-pointer"
                                            onClick={() => runAction("open-user-data", window.chatAPI?.openUserDataPath, "Opened data folder")}
                                            disabled={busyKey === "open-user-data"}
                                        >
                                            {revealLabel}
                                        </Button>
                                    </div>
                                    {userDataPath ? (
                                        <div className="mt-1 text-xs text-tx/50 break-words">
                                            {userDataPath}
                                        </div>
                                    ) : null}
                                </div>
                            </div>
                        </div>

                        <div className="rounded-md border border-border bg-bg-setting-card px-3 py-3">
                            <div className="text-sm font-extrabold text-tx py-1 select-none">
                                Strategies
                            </div>
                            <div className="mt-1 border-b border-border" />
                            <div className="mt-3 space-y-3">
                                <div className="rounded-md py-2">
                                    <div className="flex items-center justify-between gap-4">
                                        <div className="text-sm font-semibold text-tx">
                                            Open Strategies Folder
                                        </div>
                                        <Button
                                            size="sm"
                                            variant="outline"
                                            className="border-border cursor-pointer"
                                            onClick={() => runAction("open-strategies", window.chatAPI?.openStrategiesPath, "Opened strategies folder")}
                                            disabled={busyKey === "open-strategies"}
                                        >
                                            {openFolderLabel}
                                        </Button>
                                    </div>
                                </div>
                                {/* <div className="rounded-md py-2">
                                    <div className="flex items-center justify-between gap-4">
                                        <div className="text-sm font-semibold text-tx">
                                            Reset All Strategies
                                        </div>
                                        <Button
                                            size="sm"
                                            variant="destructive"
                                            className="border border-border cursor-pointer"
                                            onClick={() => runAction("reset-strategies", window.chatAPI?.resetStrategies, "Strategies reset")}
                                            disabled={busyKey === "reset-strategies"}
                                        >
                                            Reset
                                        </Button>
                                    </div>
                                </div> */}
                            </div>
                        </div>

                        <div className="rounded-md border border-border bg-bg-setting-card px-3 py-3">
                            <div className="text-sm font-extrabold text-tx py-1 select-none">
                                Cleanup
                            </div>
                            <div className="mt-1 border-b border-border" />
                            <div className="mt-3 space-y-3">
                                <div className="rounded-md py-2">
                                    <div className="flex items-center justify-between gap-4">
                                        <div className="text-sm font-semibold text-tx">
                                            Clear Cache
                                        </div>
                                        <Button
                                            size="sm"
                                            variant="outline"
                                            className="border-border cursor-pointer"
                                            onClick={() => runAction("clear-cache", window.chatAPI?.clearCache, "Cache cleared")}
                                            disabled={busyKey === "clear-cache"}
                                        >
                                            Clear Cache
                                        </Button>
                                    </div>
                                    <div className="mt-1 text-xs text-tx/50">
                                        Removes temporary files. Does not delete conversations or settings.
                                    </div>
                                </div>
                            </div>
                        </div>
                    </div>
                </section>
            </div>
        </div>
    )
}
