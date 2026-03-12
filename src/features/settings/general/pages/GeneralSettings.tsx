import { useEffect, useState } from "react"
import { Settings } from "lucide-react"
import SettingsList from "@/features/settings/shell/components/SettingsList"
import SettingsRow from "@/features/settings/shell/components/SettingsRow"
import { Switch } from "@/shared/ui/switch"
import { useThemeStore } from "@/features/settings/general/state/themeStore"
import SettingsDropdown from "@/features/settings/shell/components/SettingsDropdown"
import type { AppSettings } from "@contracts"

type ThemeMode = "system" | "dark" | "light"
type LaunchBehavior = "open_last" | "show_home"

type GeneralSettingsState = {
    theme: ThemeMode
    launchBehavior: LaunchBehavior
    autoScroll: boolean
}

const DEFAULTS: GeneralSettingsState = {
    theme: "system",
    launchBehavior: "open_last",
    autoScroll: true,
}

const LAUNCH_OPTIONS: Array<{ value: LaunchBehavior; label: string }> = [
    { value: "open_last", label: "Open last conversation" },
    { value: "show_home", label: "Show Home" },
]

const THEME_OPTIONS: Array<{ value: ThemeMode; label: string }> = [
    { value: "system", label: "System" },
    { value: "dark", label: "Dark" },
    { value: "light", label: "Light" },
]

export default function GeneralSettings() {
    const theme = useThemeStore((s) => s.theme)
    const setTheme = useThemeStore((s) => s.setTheme)
    const [loading, setLoading] = useState(true)
    const [state, setState] = useState<GeneralSettingsState>(DEFAULTS)

    useEffect(() => {
        let mounted = true
        ;(async () => {
            const snapshot = await window.chatAPI.settings.get().catch(() => null)
            if (!mounted) return
            const app: Partial<AppSettings> = snapshot?.appSettings ?? {}
            const currentTheme = useThemeStore.getState().theme
            const themeMode =
                app.theme_mode === "system" || app.theme_mode === "dark" || app.theme_mode === "light"
                    ? app.theme_mode
                    : currentTheme
            const launchBehavior =
                app.launch_behavior === "show_home" || app.launch_behavior === "open_last"
                    ? app.launch_behavior
                    : "open_last"
            const autoScroll =
                typeof app.auto_scroll === "number"
                    ? app.auto_scroll !== 0
                    : typeof app.auto_scroll === "boolean"
                        ? app.auto_scroll
                        : true
            setState({
                theme: themeMode,
                launchBehavior,
                autoScroll,
            })
            if (themeMode !== currentTheme) {
                setTheme(themeMode)
            }
            setLoading(false)
        })()
        return () => {
            mounted = false
        }
    }, [setTheme])

    useEffect(() => {
        setState((prev) => (prev.theme === theme ? prev : { ...prev, theme }))
    }, [theme])

    const commit = (patch: Partial<GeneralSettingsState>) => {
        const next = { ...state, ...patch }
        setState(next)
        if (patch.theme) {
            setTheme(patch.theme)
        }
        window.chatAPI.settings.updateApp({
            theme_mode: next.theme,
            launch_behavior: next.launchBehavior,
            auto_scroll: next.autoScroll ? 1 : 0,
        })
    }

    if (loading) {
        return (
            <div className="h-full flex items-center justify-center text-sm text-tx/60">
                Loading…
            </div>
        )
    }

    return (
        <div className="h-full min-h-0 flex flex-col bg-bg-chatarea">
            <div className="px-5">
                <div className="h-12 [-webkit-app-region:drag] pt-4">
                    <div className="text-xl text-tx font-semibold select-none">General</div>
                </div>
                <div className="mt-1 border-b border-border" />
            </div>

            <div className="min-h-0 flex-1 flex">
                <aside className="w-62 h-full bg-bg-chatarea border-r border-border text-tx flex flex-col overflow-hidden">
                    <SettingsList contentClassName="pt-3">
                        <SettingsRow
                            to="/settings/general"
                            className="border border-border !shadow-none"
                            leading={<Settings className="h-5 w-5 opacity-80" />}
                            label="General"
                        />
                    </SettingsList>
                </aside>

                <section className="min-h-0 h-full flex-1 bg-bg-chatarea overflow-y-auto scrollbar-sidebar">
                    <div className="px-5">
                        <div className="mt-3 space-y-3">
                            {/* Appearance */}
                            <div className="rounded-md border border-border bg-bg-setting-card px-3 py-3">
                                <div className="flex items-center gap-2">
                                    <div className="text-sm font-extrabold text-tx py-1 select-none">Appearance</div>
                                </div>
                                <div className="mt-1 border-b border-border" />

                                <div className="mt-3 grid grid-cols-1 gap-5">
                                    <div className="rounded-md py-3">
                                        <div className="flex items-center gap-4">
                                            <div className="min-w-[120px] text-sm font-semibold text-tx">Theme</div>
                                            <div className="flex-1">
                                                <SettingsDropdown
                                                    value={state.theme}
                                                    onChange={(value) =>
                                                        commit({ theme: value as ThemeMode })
                                                    }
                                                    options={THEME_OPTIONS}
                                                    placeholder="Theme"
                                                    triggerClassName="max-w-[160px] w-full"
                                                />
                                            </div>
                                        </div>
                                    </div>
                                </div>
                            </div>

                            {/* Startup */}
                            <div className="rounded-md border border-border bg-bg-setting-card px-3 py-3">
                                <div className="flex items-center gap-2">
                                    <div className="text-sm font-extrabold text-tx py-1 select-none">Startup</div>
                                </div>
                                <div className="mt-1 border-b border-border" />

                                <div className="mt-3 grid grid-cols-1 gap-5">
                                    <div className="rounded-md py-3">
                                        <div className="flex items-center gap-4">
                                            <div className="min-w-[120px] text-sm font-semibold text-tx">
                                                Launch behavior
                                            </div>
                                            <div className="flex-1">
                                                <SettingsDropdown
                                                    value={state.launchBehavior}
                                                    onChange={(value) =>
                                                        commit({ launchBehavior: value as LaunchBehavior })
                                                    }
                                                    options={LAUNCH_OPTIONS}
                                                    placeholder="Launch behavior"
                                                    triggerClassName="max-w-[220px] w-full"
                                                />
                                            </div>
                                        </div>
                                    </div>

                                    <div className="rounded-md py-3">
                                        <div className="flex items-center gap-4">
                                            <div className="min-w-[120px] text-sm font-semibold text-tx">
                                                New chat default
                                            </div>
                                            <div className="flex-1">
                                                <SettingsDropdown
                                                    value="last"
                                                    options={[{ value: "last", label: "Use last model & strategy" }]}
                                                    triggerClassName="max-w-[220px] w-full"
                                                />
                                            </div>
                                        </div>
                                    </div>
                                </div>
                            </div>

                            {/* Chat Behavior */}
                            <div className="rounded-md border border-border bg-bg-setting-card px-3 py-3">
                                <div className="flex items-center gap-2">
                                    <div className="text-sm font-extrabold text-tx py-1 select-none">Chat Behavior</div>
                                </div>
                                <div className="mt-1 border-b border-border" />

                                <div className="mt-3 grid grid-cols-1 gap-5">
                                    <div className="rounded-md py-3">
                                        <div className="flex items-center gap-4">
                                            <div className="min-w-[120px] text-sm font-semibold text-tx">
                                                Auto scroll
                                            </div>
                                            <div className="flex-1" />
                                            <Switch
                                                checked={state.autoScroll}
                                                onCheckedChange={(value) => commit({ autoScroll: value })}
                                            />
                                        </div>

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
