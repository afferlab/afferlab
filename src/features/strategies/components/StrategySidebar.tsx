import { Download, Globe, Package, Pencil, Sparkles } from "lucide-react"

import { Badge } from "@/shared/ui/badge"
import SettingsDivider from "@/features/settings/shell/components/SettingsDivider"
import SettingsList from "@/features/settings/shell/components/SettingsList"
import SettingsRow from "@/features/settings/shell/components/SettingsRow"

export type StrategyMode = "write" | "download" | "builtin" | "community" | "personal"

type StrategySidebarCounts = {
    builtin: number
    community: number
    personal: number
}

export default function StrategySidebar({
    mode,
    onSelect,
    counts,
}: {
    mode: StrategyMode
    onSelect: (tab: StrategyMode) => void
    counts?: StrategySidebarCounts
}) {
    const showCounts = Boolean(counts)

    const countBadge = (value: number) =>
        showCounts ? (
            <Badge
                variant="secondary"
                className="inline-flex h-5 items-center justify-center px-2 text-[11px] leading-none text-tx/80"
            >
                {value}
            </Badge>
        ) : null

    return (
        <aside className="w-62 h-full bg-bg-chatarea border-r border-border text-tx flex flex-col overflow-hidden">
            <SettingsList contentClassName="pt-3">
                <SettingsRow
                    onClick={() => onSelect("write")}
                    active={mode === "write"}
                    className={mode === "write" ? "border border-border !shadow-none" : "border border-transparent"}
                    leading={<Pencil className="h-5 w-5 opacity-80" />}
                    label="Write Strategy"
                />
                <SettingsRow
                    onClick={() => onSelect("download")}
                    active={mode === "download"}
                    className={mode === "download" ? "border border-border !shadow-none" : "border border-transparent"}
                    leading={<Download className="h-5 w-5 opacity-80" />}
                    label="Download Strategy"
                />

                <SettingsDivider label="Installed" />

                <SettingsRow
                    onClick={() => onSelect("builtin")}
                    active={mode === "builtin"}
                    className={mode === "builtin" ? "border border-border !shadow-none" : "border border-transparent"}
                    leading={<Package className="h-5 w-5 opacity-80" />}
                    label="Built-in"
                    rightSlot={counts ? countBadge(counts.builtin) : null}
                />
                <SettingsRow
                    onClick={() => onSelect("community")}
                    active={mode === "community"}
                    className={mode === "community" ? "border border-border !shadow-none" : "border border-transparent"}
                    leading={<Globe className="h-5 w-5 opacity-80" />}
                    label="Community"
                    rightSlot={counts ? countBadge(counts.community) : null}
                />
                <SettingsRow
                    onClick={() => onSelect("personal")}
                    active={mode === "personal"}
                    className={mode === "personal" ? "border border-border !shadow-none" : "border border-transparent"}
                    leading={<Sparkles className="h-5 w-5 opacity-80" />}
                    label="Personal"
                    rightSlot={counts ? countBadge(counts.personal) : null}
                />
            </SettingsList>
        </aside>
    )
}
