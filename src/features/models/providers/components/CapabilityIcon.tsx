import type { LucideIcon } from 'lucide-react'

export default function CapabilityIcon({
    icon: Icon,
    label,
    bg,
    fg,
}: {
    icon: LucideIcon
    label: string
    bg: string
    fg: string
}) {
    return (
        <div
            title={label}
            aria-label={label}
            className="flex h-4 w-6 shrink-0 items-center justify-center rounded-md"
            style={{
                background: bg,
                color: fg,
            }}
        >
            <Icon size={11} strokeWidth={2} />
        </div>
    )
}
