import type { DevConsoleEntry } from "../utils/devConsoleTypes"

function stringify(value: unknown): string {
    if (value == null) return ""
    if (typeof value === "string") return value
    try {
        return JSON.stringify(value, null, 2)
    } catch {
        return String(value)
    }
}

function previewResult(value: unknown): string {
    const text = stringify(value)
    if (!text) return "-"
    if (text.length <= 400) return text
    return `${text.slice(0, 400)}...`
}

type ToolDetailsProps = {
    entry: DevConsoleEntry
}

export default function ToolDetails({ entry }: ToolDetailsProps) {
    const event = entry.data

    if (event.type !== "tools") {
        return null
    }
    const result = event.data?.output
    const error = event.data?.error

    return (
        <div className="min-w-0 max-w-full space-y-2 text-[11px] text-tx/70">
            {result !== undefined ? (
                <details>
                    <summary className="cursor-pointer break-words [overflow-wrap:anywhere]">result preview</summary>
                    <pre className="mt-1 whitespace-pre-wrap break-words [overflow-wrap:anywhere]">{previewResult(result)}</pre>
                </details>
            ) : null}

            {error ? (
                <details open>
                    <summary className="cursor-pointer break-words [overflow-wrap:anywhere]">error</summary>
                    <pre className="mt-1 whitespace-pre-wrap break-words [overflow-wrap:anywhere]">{stringify(error)}</pre>
                </details>
            ) : null}
        </div>
    )
}
