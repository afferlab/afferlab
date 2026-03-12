// src/pages/settings/model/components/ProviderSidebar.tsx
import { useMemo, useState } from "react"
import type { ProviderId, ProviderItem } from "../utils/providers"
import SettingsRow from "@/features/settings/shell/components/SettingsRow"
import SettingsList from "@/features/settings/shell/components/SettingsList"
import { ProviderIcon } from "./ProviderIcon"

export default function ProviderSidebar({
                                            providers,
                                            activeId,
                                            onSelect,
                                            loadedByProvider,
                                        }: {
    providers: ProviderItem[]
    activeId: ProviderId
    onSelect: (id: ProviderId) => void
    loadedByProvider: Partial<Record<ProviderId, boolean>>
}) {
    const [q] = useState("")

    const filtered = useMemo(() => {
        const s = q.trim().toLowerCase()
        if (!s) return providers
        return providers.filter((p) => (p.label ?? "").toLowerCase().includes(s))
    }, [providers, q])

    return (
        <aside className="w-62 h-full bg-bg-chatarea border-r border-border text-tx flex flex-col overflow-hidden">

            {/* List: use SettingsList so all settings rows share consistent outer spacing */}
            <SettingsList>
                {filtered.map((p) => {
                    const active = p.id === activeId

                    return (
                        <SettingsRow
                            key={p.id}
                            onClick={() => onSelect(p.id)}
                            active={active}
                            className={active ? "border border-border !shadow-none" : "border border-transparent"}
                            leading={
                                <ProviderIcon providerId={p.id} size={24} className="shrink-0" />
                            }
                            label={p.label}
                            rightSlot={
                                loadedByProvider[p.id]
                                    ? (
                                        <span className="flex items-center">
                                            <span className="inline-block h-2 w-2 rounded-full bg-[var(--status-active-g)]" />
                                        </span>
                                    )
                                    : null
                            }
                        />
                    )
                })}

                {filtered.length === 0 && (
                    <div className="px-1 py-6 text-[13px] text-tx/50">No results</div>
                )}
            </SettingsList>

            {/*/!* Add Model *!/*/}
            {/*<div className="px-3 py-3 border-t border-border">*/}
            {/*    <button*/}
            {/*        type="button"*/}
            {/*        className="w-full h-10 rounded-full border border-border/70 bg-bg-chatarea/40 hover:bg-bg-sidebar-button-hover transition flex items-center justify-center gap-2 text-sm"*/}
            {/*    >*/}
            {/*        <span className="text-[18px] leading-none">+</span>*/}
            {/*        <span>Add</span>*/}
            {/*    </button>*/}
            {/*</div>*/}
        </aside>
    )
}
