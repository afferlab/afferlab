import type { StrategyDevEvent } from "@contracts"

export type DevConsoleEntryType = "input" | "slots" | "prompt" | "llm" | "tool" | "result" | "log"

export type DevConsoleEntry = {
    id: string
    type: DevConsoleEntryType
    tag: string
    summary: string
    data: StrategyDevEvent
    meta?: {
        action?: string
        status?: "pending" | "ok" | "error" | "call" | "done"
        durationMs?: number
        elapsedMs?: number
        toolName?: string
        nonExpandable?: boolean
        resultMessage?: unknown
    }
}
