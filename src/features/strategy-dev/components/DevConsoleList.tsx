import type { DevConsoleEntry } from "../utils/devConsoleTypes"
import DevConsoleRow from "./DevConsoleRow"

type DevConsoleListProps = {
    entries: DevConsoleEntry[]
}

export default function DevConsoleList({ entries }: DevConsoleListProps) {
    if (entries.length === 0) {
        return <div className="text-xs text-tx/50">No console logs yet.</div>
    }

    return (
        <ul className="min-w-0 max-w-full overflow-hidden">
            {entries.map((entry) => (
                <DevConsoleRow key={entry.id} entry={entry} />
            ))}
        </ul>
    )
}
