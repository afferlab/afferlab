// src/pages/settings/components/SettingsDivider.tsx
import clsx from "clsx"

export default function SettingsDivider({
                                            label,
                                            className,
                                        }: {
    label?: string
    className?: string
}) {
    // No label: render as a single thin divider
    if (!label) {
        return (
            <div className={clsx("h-px w-full bg-border", className)} />
        )
    }

    // With label: render two lines with centered text
    return (
        <div className={clsx("flex items-center gap-3", className)}>
            <div className="h-px flex-1 bg-border" />
            <div className="text-[11px] font-semibold tracking-wide text-tx/45">
                {label}
            </div>
            <div className="h-px flex-1 bg-border" />
        </div>
    )
}
