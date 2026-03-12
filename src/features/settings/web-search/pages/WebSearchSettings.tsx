import { useEffect, useState } from 'react'
import { Switch } from '@/shared/ui/switch'
import { Slider } from '@/shared/ui/slider'
import SettingsDropdown from '@/features/settings/shell/components/SettingsDropdown'

type WebSearchSettingsState = {
    enabled: boolean
    // keep DB compatibility
    provider: 'bing_browser' | 'auto' | 'ddg_html'
    limit: number
}

const DEFAULTS: WebSearchSettingsState = {
    enabled: true,
    provider: 'bing_browser',
    limit: 5,
}

export default function WebSearchSettings() {
    const [loading, setLoading] = useState(true)
    const [state, setState] = useState<WebSearchSettingsState>(DEFAULTS)

    const disabled = !state.enabled

    useEffect(() => {
        let mounted = true
        ;(async () => {
            const snapshot = await window.chatAPI.settings.get()
            if (!mounted) return

            let ws: unknown = snapshot.appSettings?.web_search_settings
            if (typeof ws === 'string') {
                try { ws = JSON.parse(ws) } catch { ws = null }
            }
            const parsed = ws && typeof ws === 'object'
                ? ws as { enabled?: boolean; provider?: string; limit?: number }
                : {}
            const provider = parsed.provider === 'ddg_html' ? 'ddg_html' : 'bing_browser'
            setState({
                enabled: parsed.enabled ?? true,
                provider,
                limit: typeof parsed.limit === 'number' ? Math.min(20, Math.max(1, Math.round(parsed.limit))) : 5,
            })
            setLoading(false)
        })()

        return () => {
            mounted = false
        }
    }, [])

    const commit = (patch: Partial<WebSearchSettingsState>) => {
        const next = { ...state, ...patch }
        setState(next)
        window.chatAPI.settings.updateApp({
            web_search_settings: next,
        })
    }

    // v1: only Bing (Local)
    const engineValue = 'bing'
    const engineLabel = 'Bing (Local)'

    if (loading) {
        return (
            <div className="h-full flex items-center justify-center text-sm text-tx/60">
                Loading…
            </div>
        )
    }

    return (
        <section className="min-h-0 h-full flex-1 overflow-y-auto scrollbar-sidebar bg-bg-chatarea">
            <div className="px-5">
                {/* Header (Matching ModelSettingsPage style) */}
                <div className="h-12 [-webkit-app-region:drag] pt-4">
                    <div className="flex items-center justify-between">
                        <div className="text-xl font-semibold text-tx select-none">Web Search</div>

                        <div className="pt-1 [-webkit-app-region:no-drag]">
                            <Switch
                                checked={state.enabled}
                                onCheckedChange={(v) => commit({ enabled: v })}
                            />
                        </div>
                    </div>
                </div>

                <div className="mt-1 border-b border-border" />

                <div className="mt-3 space-y-3">
                    {/* Main Settings Card (Replacing shadcn Card) */}
                    <div className="rounded-md border border-border bg-bg-setting-card px-3 py-3">
                        {/* Card Title */}
                        <div className="flex items-center gap-2">
                            <div className="text-sm font-extrabold text-tx py-1 select-none">
                                Search Configuration
                            </div>
                        </div>

                        <div className="mt-1 border-b border-border" />

                        {/* Card Content Grid */}
                        <div className="mt-3 grid grid-cols-1 gap-5">

                            {/* Row 1: Search Engine */}
                            <div className={`rounded-md py-3 ${disabled ? 'opacity-60 pointer-events-none' : ''}`}>
                                <div className="flex items-center gap-4">
                                    <div className="min-w-[100px] text-sm font-semibold text-tx">
                                        Engine
                                    </div>

                                    <div className="flex-1">
                                        <SettingsDropdown
                                            value={engineValue}
                                            options={[{ value: "bing", label: engineLabel }]}
                                            triggerClassName="max-w-[160px] w-full"
                                        />
                                    </div>

                                    {/* Empty placeholder to balance the grid if needed, or just leave empty */}
                                    <div className="min-w-[60px]" />
                                </div>
                            </div>

                            {/* Row 2: Search Results (Slider) */}
                            <div className={`rounded-md py-3 ${disabled ? 'opacity-60 pointer-events-none' : ''}`}>
                                <div className="flex items-start gap-4">
                                    <div className="min-w-[100px] text-sm font-semibold text-tx pt-1.5">
                                        Limit
                                    </div>

                                    <div className="flex-1 pt-1.5">
                                        <div className="relative w-full">
                                            <Slider
                                                value={[state.limit]}
                                                min={1}
                                                max={20}
                                                step={1}
                                                onValueChange={(v) => setState((s) => ({ ...s, limit: v[0] ?? 5 }))}
                                                onValueCommit={(v) => commit({ limit: v[0] ?? 5 })}
                                            />

                                            {/* Ticks: 1 and 20 */}
                                            <div className="mt-3 relative w-full h-4 select-none">
                                                <span
                                                    className="absolute text-[11px] text-tx/40 top-0 -translate-x-1/2"
                                                    style={{ left: '0%' }}
                                                >
                                                    1
                                                </span>
                                                <span
                                                    className="absolute text-[11px] text-tx/40 top-0 -translate-x-1/2"
                                                    style={{ left: '100%' }}
                                                >
                                                    20
                                                </span>
                                            </div>
                                        </div>
                                    </div>

                                    <div className="min-w-[60px] text-right text-sm text-tx/60 tabular-nums pt-1.5">
                                        {state.limit}
                                    </div>
                                </div>
                            </div>

                        </div>
                    </div>
                </div>
            </div>
        </section>
    )
}
