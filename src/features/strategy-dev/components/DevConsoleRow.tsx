import { useState } from "react"
import type { DevConsoleEntry } from "../utils/devConsoleTypes"
import DevConsoleDetails from "./DevConsoleDetails"

type DevConsoleRowProps = {
    entry: DevConsoleEntry
}

export default function DevConsoleRow({ entry }: DevConsoleRowProps) {
    const [open, setOpen] = useState(false)
    const expandable = !entry.meta?.nonExpandable

    return (
        <li className="border-b border-border/60 last:border-b-0">
            {expandable ? (
                <button
                    type="button"
                    onClick={() => setOpen((prev) => !prev)}
                    className="w-full min-w-0 max-w-full grid grid-cols-[1rem_minmax(0,1fr)] items-start gap-0 text-left pl-1 pr-1 py-1 text-[11px] text-tx/80 hover:bg-bg-sidebar-button-hover cursor-pointer"
                >
                    <span className="text-tx/60 leading-4">{open ? "▼" : "▶"}</span>
                    <span className="min-w-0 max-w-full font-mono break-words [overflow-wrap:anywhere] leading-4">{entry.tag} {entry.summary}</span>
                </button>
            ) : (
                <div className="w-full min-w-0 max-w-full grid grid-cols-[1rem_minmax(0,1fr)] items-start gap-0 text-left pl-1 pr-1 py-1 text-[11px] text-tx/80">
                    <span className="leading-4" />
                    <span className="min-w-0 max-w-full font-mono break-words [overflow-wrap:anywhere] leading-4">{entry.tag} {entry.summary}</span>
                </div>
            )}
            {expandable && open ? (
                <div className="min-w-0 max-w-full overflow-hidden pl-5 pr-1 py-2 border-t border-border/40">
                    <DevConsoleDetails entry={entry} />
                </div>
            ) : null}
        </li>
    )
}
