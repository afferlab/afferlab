import { useMemo, useState } from "react"
import clsx from "clsx"

import { Tooltip, TooltipContent, TooltipTrigger } from "@/shared/ui/tooltip"

export type TokenBreakdownItem = {
    name: string
    tokens: number
}

type TokenBreakdownBarProps = {
    items: TokenBreakdownItem[]
    total: number
}

const COLOR_PALETTE = [
    "#7dd3fc",
    "#fda4af",
    "#a7f3d0",
    "#fde68a",
    "#c4b5fd",
    "#fbcfe8",
    "#93c5fd",
    "#f9a8d4",
    "#86efac",
    "#fcd34d",
]

function hashName(name: string): number {
    let hash = 0
    for (let i = 0; i < name.length; i += 1) {
        hash = (hash * 31 + name.charCodeAt(i)) % 65536
    }
    return hash
}

function getSlotColor(name: string) {
    const idx = hashName(name) % COLOR_PALETTE.length
    return COLOR_PALETTE[idx]
}

export default function TokenBreakdownBar({ items, total }: TokenBreakdownBarProps) {
    const [hoverIndex, setHoverIndex] = useState<number | null>(null)
    const sorted = useMemo(() => {
        return [...items]
            .filter((item) => item.tokens > 0)
            .sort((a, b) => {
                if (b.tokens !== a.tokens) return b.tokens - a.tokens
                return a.name.localeCompare(b.name)
            })
    }, [items])

    if (sorted.length === 0 || total <= 0) {
        return <div className="text-[10px] text-tx/50">No token breakdown yet.</div>
    }

    return (
        <div className="space-y-2 min-w-0">
            <div className="h-3.5 w-full overflow-hidden rounded-full bg-border/40 flex">
                {sorted.map((item, index) => {
                    const pct = total > 0 ? (item.tokens / total) * 100 : 0
                    const color = getSlotColor(item.name)
                    const isDimmed = hoverIndex !== null && hoverIndex !== index
                    return (
                        <Tooltip key={item.name}>
                            <TooltipTrigger asChild>
                                <div
                                    className={clsx("h-full transition", isDimmed && "opacity-60")}
                                    style={{
                                        width: `${Math.max(pct, 1)}%`,
                                        backgroundColor: color,
                                    }}
                                    aria-label={`${item.name}: ${item.tokens} tokens, ${pct.toFixed(0)}%`}
                                    onMouseEnter={() => setHoverIndex(index)}
                                    onMouseLeave={() => setHoverIndex(null)}
                                />
                            </TooltipTrigger>
                            <TooltipContent side="top" sideOffset={6} className="text-xs">
                                <div className="font-medium">{item.name}</div>
                                <div>{item.tokens} tokens</div>
                                <div>{pct.toFixed(0)}%</div>
                            </TooltipContent>
                        </Tooltip>
                    )
                })}
            </div>
            <div className="grid grid-cols-2 gap-x-4 gap-y-1 text-[10px] text-tx/60 min-w-0">
                {sorted.map((item) => {
                    const pct = total > 0 ? (item.tokens / total) * 100 : 0
                    const color = getSlotColor(item.name)
                    return (
                        <div key={`legend-${item.name}`} className="flex items-center gap-2 min-w-0">
                            <span
                                className="h-2 w-2 rounded-full shrink-0"
                                style={{ backgroundColor: color }}
                            />
                            <span className="truncate min-w-0">
                                {item.name} · {item.tokens} tokens ({pct.toFixed(0)}%)
                            </span>
                        </div>
                    )
                })}
            </div>
        </div>
    )
}
