import { useMemo } from "react"
import { Slider } from "@/shared/ui/slider"
import { useModelDefaults } from "../hooks/useModelDefaults"
import type { MaxTokensTier } from "@contracts"
import HelpTip from "@/features/models/providers/components/HelpTip.tsx";

const TOKEN_TIERS: Array<{ label: string; value: MaxTokensTier }> = [
    { label: "4k", value: 4096 },
    { label: "8k", value: 8192 },
    { label: "16k", value: 16384 },
    { label: "32k", value: 32768 },
    { label: "64k", value: 65536 },
    { label: "128k", value: 131072 },
    { label: "256k", value: 262144 },
    { label: "max", value: "max" },
]

// Shared tick configuration for 0, 0.5, and 1
const COMMON_TICKS = [
    { label: "0", percent: 0 },
    { label: "0.5", percent: 50 },
    { label: "1", percent: 100 },
]

export default function ModelSettingsPage() {
    const { params, updateLocal, commitPatch, loading } = useModelDefaults()

    const tierIndex = useMemo(() => {
        const idx = TOKEN_TIERS.findIndex((tier) => tier.value === params.maxTokensTier)
        return idx >= 0 ? idx : TOKEN_TIERS.length - 1
    }, [params.maxTokensTier])

    const tierLabel = TOKEN_TIERS[tierIndex]?.label ?? "max"

    return (
        <section className="min-h-0 h-full flex-1 bg-bg-chatarea overflow-y-auto scrollbar-sidebar">
            <div className="px-5">
                <div className="h-12 [-webkit-app-region:drag] pt-4">
                    <div className="flex items-center gap-3">
                        <div className="text-xl font-semibold text-tx select-none">Model Settings</div>
                    </div>
                </div>

                <div className="mt-1 border-b border-border" />

                <div className="mt-3 space-y-3">
                    {/* Main card */}
                    <div className="rounded-md border border-border bg-bg-setting-card px-3 py-3">
                        <div className="flex items-center gap-2">
                            <div className="text-sm font-extrabold text-tx py-1 select-none">
                                General Model Settings
                            </div>
                            <HelpTip content="Global defaults apply to all models unless overridden per model." />
                        </div>

                        <div className="mt-1 border-b border-border" />

                        <div className="mt-3 grid grid-cols-1 gap-5">

                            {/* Temperature */}
                            <div className={`rounded-md ${loading ? "opacity-60" : ""}`}>
                                <div className="flex items-start mt-3 gap-4">
                                    <div className="min-w-[100px] text-sm font-semibold text-tx pt-1.5">Temperature</div>

                                    <div className="flex-1 pt-1.5">
                                        <div className="relative w-full">
                                            <Slider
                                                value={[params.temperature]}
                                                min={0}
                                                max={1}
                                                step={0.01}
                                                disabled={loading}
                                                onValueChange={(v) => updateLocal({ temperature: v[0] ?? 0 })}
                                                onValueCommit={(v) => commitPatch({ temperature: v[0] ?? 0 })}
                                            />
                                            {/* Tick marks at 0, 0.5, and 1 */}
                                            <div className="mt-3 relative w-full h-4 select-none">
                                                {COMMON_TICKS.map((tick) => (
                                                    <span
                                                        key={tick.label}
                                                        className="absolute text-[11px] text-tx/40 top-0 -translate-x-1/2 transition-colors"
                                                        style={{ left: `${tick.percent}%` }}
                                                    >
                                                        {tick.label}
                                                    </span>
                                                ))}
                                            </div>
                                        </div>
                                    </div>

                                    <div className="min-w-[60px] text-right text-sm text-tx/60 tabular-nums pt-1.5">
                                        {params.temperature.toFixed(2)}
                                    </div>
                                </div>
                            </div>

                            {/* Top P */}
                            <div className={`rounded-md ${loading ? "opacity-60" : ""}`}>
                                <div className="flex items-start gap-4">
                                    <div className="min-w-[100px] text-sm font-semibold text-tx pt-1.5">Top P</div>

                                    <div className="flex-1 pt-1.5">
                                        <div className="relative w-full">
                                            <Slider
                                                value={[params.top_p]}
                                                min={0.1}
                                                max={1}
                                                step={0.01}
                                                disabled={loading}
                                                onValueChange={(v) => updateLocal({ top_p: v[0] ?? 0.1 })}
                                                onValueCommit={(v) => commitPatch({ top_p: v[0] ?? 0.1 })}
                                            />
                                            {/* Tick marks at 0, 0.5, and 1 */}
                                            <div className="mt-3 relative w-full h-4 select-none">
                                                {COMMON_TICKS.map((tick) => (
                                                    <span
                                                        key={tick.label}
                                                        className="absolute text-[11px] text-tx/40 top-0 -translate-x-1/2 transition-colors"
                                                        style={{ left: `${tick.percent}%` }}
                                                    >
                                                        {tick.label}
                                                    </span>
                                                ))}
                                            </div>
                                        </div>
                                    </div>

                                    <div className="min-w-[60px] text-right text-sm text-tx/60 tabular-nums pt-1.5">
                                        {params.top_p.toFixed(2)}
                                    </div>
                                </div>
                            </div>

                            {/* Max Tokens */}
                            <div className={`rounded-md ${loading ? "opacity-60" : ""}`}>
                                <div className="flex items-start gap-4">
                                    <div className="min-w-[100px] text-sm font-semibold text-tx pt-1.5">Max Tokens</div>

                                    <div className="flex-1 pt-1.5">
                                        <div className="relative w-full">
                                            <Slider
                                                value={[tierIndex]}
                                                min={0}
                                                max={TOKEN_TIERS.length - 1}
                                                step={1}
                                                disabled={loading}
                                                onValueChange={(v) => {
                                                    const idx = Math.max(0, Math.min(TOKEN_TIERS.length - 1, v[0] ?? 0))
                                                    const tier = TOKEN_TIERS[idx]?.value ?? "max"
                                                    updateLocal({ maxTokensTier: tier })
                                                }}
                                                onValueCommit={(v) => {
                                                    const idx = Math.max(0, Math.min(TOKEN_TIERS.length - 1, v[0] ?? 0))
                                                    const tier = TOKEN_TIERS[idx]?.value ?? "max"
                                                    commitPatch({ maxTokensTier: tier })
                                                }}
                                            />

                                            <div className="mt-3 relative w-full h-4 select-none">
                                                {TOKEN_TIERS.map((tier, index) => {
                                                    const leftPercent = (index / (TOKEN_TIERS.length - 1)) * 100
                                                    return (
                                                        <span
                                                            key={tier.label}
                                                            className="absolute text-[11px] text-tx/40 top-0 -translate-x-1/2 transition-colors"
                                                            style={{ left: `${leftPercent}%` }}
                                                        >
                                                            {tier.label}
                                                        </span>
                                                    )
                                                })}
                                            </div>
                                        </div>
                                    </div>

                                    <div className="min-w-[60px] text-right text-sm text-tx/60 tabular-nums pt-1.5">
                                        {tierLabel}
                                    </div>
                                </div>
                            </div>

                        </div>
                    </div>

                    {/*/!* Advanced JSON *!/*/}
                    {/*<div className="rounded-md border border-border bg-bg-setting-card p-5">*/}
                    {/*    <div className="mb-3 text-sm font-semibold text-tx">Advanced JSON (optional)</div>*/}
                    {/*    <textarea*/}
                    {/*        rows={4}*/}
                    {/*        placeholder='{ "presence_penalty": 0.2, "seed": 42 }'*/}
                    {/*        className={[*/}
                    {/*            "w-full rounded-md border border-border",*/}
                    {/*            "bg-bg-field",*/}
                    {/*            "text-sm text-tx placeholder:text-tx/35",*/}
                    {/*            "font-mono outline-none",*/}
                    {/*            "focus:border-white/15 focus:ring-0",*/}
                    {/*        ].join(" ")}*/}
                    {/*        spellCheck={false}*/}
                    {/*    />*/}
                    {/*</div>*/}
                </div>
            </div>
        </section>
    )
}
