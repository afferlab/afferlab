import type { Message, StrategyDevEvent } from "@contracts"
import type { DevConsoleEntry } from "./devConsoleTypes"

function getEventTs(event: StrategyDevEvent): number {
    return event.ts ?? event.timestamp ?? Date.now()
}

function clip(text: string, max: number): string {
    if (text.length <= max) return text
    return `${text.slice(0, max)}...`
}

function cleanText(text: string): string {
    return text.replace(/\s+/g, " ").trim()
}

const INVISIBLE_CHARS = /[\u200b-\u200d\ufeff\ue000-\uf8ff]/g

function stripInvisible(text: string): string {
    return text.replace(INVISIBLE_CHARS, "").trim()
}

function parseUserConsoleLog(text: string): { tag: string; summary: string; nonExpandable: boolean } | null {
    const normalized = cleanText(stripInvisible(text))
    const prefixedMatch = normalized.match(/.*?\[(?:strategy-log|log|warn|error)\]\s*(?:\[([^\]]+)\]|【([^】]+)】)\s*(.*)$/i)
    if (prefixedMatch) {
        const strategyTag = cleanText(stripInvisible(prefixedMatch[1] ?? prefixedMatch[2] ?? ""))
        if (!strategyTag) return null
        const message = cleanText(stripInvisible(prefixedMatch[3] ?? ""))
        return {
            tag: `[${strategyTag}]`,
            summary: message || "<empty>",
            nonExpandable: true,
        }
    }

    // Support direct strategy output such as "[strategy-name] message..."
    const simpleMatch = normalized.match(/^\[([^\]]+)\]\s*(.*)$/)
    if (!simpleMatch) return null
    const strategyTag = cleanText(stripInvisible(simpleMatch[1] ?? ""))
    if (!strategyTag) return null
    const message = cleanText(stripInvisible(simpleMatch[2] ?? ""))
    return {
        tag: `[${strategyTag}]`,
        summary: message || "<empty>",
        nonExpandable: true,
    }
}

function estimateTokens(text: string): number {
    let latin = 0
    let cjk = 0
    for (const ch of text) {
        const code = ch.codePointAt(0) ?? 0
        if (
            (code >= 0x4e00 && code <= 0x9fff)
            || (code >= 0x3400 && code <= 0x4dbf)
            || (code >= 0xf900 && code <= 0xfaff)
        ) {
            cjk += 1
        } else {
            latin += 1
        }
    }
    const estimate = Math.ceil(latin * 0.75 + cjk * 1.6)
    return Math.ceil(estimate * 1.1)
}

function estimateMessageTokens(message: Message): number {
    const content = typeof message.content === "string"
        ? message.content
        : message.content
            ? JSON.stringify(message.content)
            : ""
    const toolCalls = (message as { tool_calls?: unknown }).tool_calls
    const extra = toolCalls ? JSON.stringify(toolCalls) : ""
    return estimateTokens(`${content}${extra}`)
}

function readToolName(input?: unknown): string | null {
    if (!input || typeof input !== "object") return null
    const obj = input as Record<string, unknown>
    const name = obj.name
    return typeof name === "string" && name.trim() ? name : null
}

function readToolId(input?: unknown): string | null {
    if (!input || typeof input !== "object") return null
    const obj = input as Record<string, unknown>
    const id = obj.id
    return typeof id === "string" && id.trim() ? id : null
}

function formatElapsed(ms?: number): string {
    if (typeof ms !== "number" || ms < 0) return "-"
    if (ms < 1000) return `${Math.round(ms)}ms`
    return `${(ms / 1000).toFixed(1)}s`
}

function normalizeToolName(raw: string): string {
    let name = raw.trim()
    if (name.startsWith("builtin.")) {
        name = name.slice("builtin.".length)
    }
    return name.replace(/_/g, ".")
}

function readToolCallCount(output?: unknown): number {
    if (!output || typeof output !== "object") return 0
    const value = (output as { toolCalls?: unknown }).toolCalls
    if (!Array.isArray(value)) return 0
    return value.length
}

function eventId(event: StrategyDevEvent, index: number): string {
    const ts = getEventTs(event)
    return `${ts}-${index}-${event.type}`
}

export function buildDevConsoleEntries(
    events: StrategyDevEvent[],
    options?: { turnId?: string | null }
): DevConsoleEntry[] {
    const turnId = options?.turnId ?? null
    const scoped = turnId
        ? events.filter((event) => event.turnId === turnId)
        : [...events]
    const sorted = scoped
        .map((event, index) => ({ event, index, ts: getEventTs(event) }))
        .sort((a, b) => {
            if (a.ts !== b.ts) return a.ts - b.ts
            return a.index - b.index
        })
    const lastSlotsSortedIndexByTurn = new Map<string, number>()
    sorted.forEach((item, sortedIndex) => {
        if (item.event.type !== "slots") return
        const turnKey = item.event.turnId ?? "unknown"
        lastSlotsSortedIndexByTurn.set(turnKey, sortedIndex)
    })

    const entries: DevConsoleEntry[] = []
    const pendingToolCalls = new Map<string, number>()
    let llmCallStartedAt: number | null = null
    let finalResultEntry: DevConsoleEntry | null = null
    let latestResultMessage: unknown = undefined

    for (let sortedIndex = 0; sortedIndex < sorted.length; sortedIndex += 1) {
        const item = sorted[sortedIndex]
        const event = item.event
        const ts = item.ts
        const id = eventId(event, item.index)

        if (event.type === "context" && event.data?.message) {
            latestResultMessage = event.data.message
        }

        if (event.type === "context" && event.phase === "context") {
            const text = cleanText(event.data?.input?.text ?? "")
            const preview = text ? `text "${clip(text, 80)}"` : "text <empty>"
            entries.push({
                id,
                type: "input",
                tag: "[input]",
                summary: preview,
                data: event,
            })
            continue
        }

        if (
            event.type === "context"
            || event.type === "budget"
            || event.type === "status"
            || event.type === "state"
            || event.type === "meta"
        ) {
            continue
        }

        if (event.type === "slots") {
            const turnKey = event.turnId ?? "unknown"
            if (lastSlotsSortedIndexByTurn.get(turnKey) !== sortedIndex) {
                continue
            }
            const slotEntries = event.data?.entries ?? []
            const messageCount = slotEntries.reduce((sum, slot) => sum + (slot.messages?.length ?? 0), 0)
            const tokenCount = slotEntries.reduce(
                (sum, slot) => sum + (slot.messages ?? []).reduce((sub, message) => sub + estimateMessageTokens(message), 0),
                0
            )
            entries.push({
                id,
                type: "slots",
                tag: "[slots]",
                summary: `${slotEntries.length} slots, ${messageCount} msgs, ~${tokenCount} tok`,
                data: event,
            })
            continue
        }

        if (event.type === "prompt") {
            const messages = event.data?.messages ?? []
            entries.push({
                id,
                type: "prompt",
                tag: "[prompt]",
                summary: `${messages.length} messages`,
                data: event,
            })
            continue
        }

        if (event.type === "tools") {
            const action = event.data?.action ?? "tools"
            if (action === "llm.call" || action === "llm.run") {
                llmCallStartedAt = ts
                entries.push({
                    id,
                    type: "llm",
                    tag: "[llm]",
                    summary: "call",
                    data: event,
                    meta: { action, status: "call" },
                })
                continue
            }
            if (action === "llm.result") {
                const output = event.data?.output as { finishReason?: string; toolCalls?: unknown[] } | undefined
                const finish = output?.finishReason ?? "unknown"
                const toolCallCount = readToolCallCount(event.data?.output)
                const elapsedMs = llmCallStartedAt != null ? Math.max(0, ts - llmCallStartedAt) : undefined
                const hasError = finish === "error" || Boolean(event.data?.error)
                const state = hasError
                    ? "error"
                    : finish === "tool_calls"
                        ? `tool_calls=${toolCallCount}`
                        : finish
                entries.push({
                    id,
                    type: "llm",
                    tag: "[llm]",
                    summary: `${state}${elapsedMs != null ? ` ${formatElapsed(elapsedMs)}` : ""}`,
                    data: event,
                    meta: { action, status: "done", elapsedMs },
                })
                llmCallStartedAt = null
                continue
            }

            const toolName = readToolName(event.data?.input)
            const toolId = readToolId(event.data?.input)
            const isCall = action === "tool.call" || action === "toolCall"
            const isResult = action === "tool.result"
            const isError = action === "tool.error" || Boolean(event.data?.error)

            if (toolId && isCall) {
                pendingToolCalls.set(toolId, ts)
                continue
            }
            if (!isResult && !isError) continue

            const startedAt = toolId ? pendingToolCalls.get(toolId) : undefined
            const durationMs = startedAt != null ? Math.max(0, ts - startedAt) : undefined

            if (toolId && (isResult || isError)) {
                pendingToolCalls.delete(toolId)
            }

            if (!toolName) {
                continue
            }

            const status: "ok" | "error" = isError ? "error" : "ok"
            const normalizedName = normalizeToolName(toolName)
            entries.push({
                id,
                type: "tool",
                tag: "[tool]",
                summary: `${normalizedName} ${status}${durationMs != null ? ` ${durationMs}ms` : ""}`,
                data: event,
                meta: { action, status, durationMs, toolName: normalizedName },
            })
            continue
        }

        if (event.type === "memory") {
            continue
        }

        if (event.type === "turn") {
            const rawStatus = event.data?.status ?? "unknown"
            if (rawStatus === "start") {
                continue
            }

            const reason = cleanText(event.data?.reason ?? "")
            const normalizedStatus = reason === "aborted"
                ? "aborted"
                : rawStatus === "error"
                    ? "error"
                    : "done"

            let summary = normalizedStatus
            if (normalizedStatus === "done" && reason) {
                summary = `done ${reason}`
            } else if (normalizedStatus === "error" && reason) {
                summary = `error (${reason})`
            }

            finalResultEntry = {
                id,
                type: "result",
                tag: "[result]",
                summary,
                data: event,
                meta: latestResultMessage === undefined ? undefined : { resultMessage: latestResultMessage },
            }
            continue
        }

        if (event.type === "error") {
            const code = event.phase ? event.phase.toUpperCase() : ""
            const summary = code ? `error (${code})` : "error"
            finalResultEntry = {
                id,
                type: "result",
                tag: "[result]",
                summary,
                data: event,
                meta: latestResultMessage === undefined ? undefined : { resultMessage: latestResultMessage },
            }
            continue
        }

        if (event.type === "console") {
            const parsed = parseUserConsoleLog(event.text)
            if (parsed) {
                entries.push({
                    id,
                    type: "log",
                    tag: parsed.tag,
                    summary: parsed.summary,
                    data: event,
                    meta: { nonExpandable: true },
                })
                continue
            }
            entries.push({
                id,
                type: "log",
                tag: "[log]",
                summary: clip(cleanText(event.text), 140),
                data: event,
            })
            continue
        }

        entries.push({
            id,
            type: "log",
            tag: "[log]",
            summary: `${event.type}`,
            data: event,
        })
    }

    if (finalResultEntry) {
        entries.push(finalResultEntry)
    }

    return entries
}

function stringify(value: unknown): string {
    if (value == null) return ""
    if (typeof value === "string") return value
    try {
        return JSON.stringify(value, null, 2)
    } catch {
        return String(value)
    }
}

function copyBody(entry: DevConsoleEntry): string {
    const event = entry.data
    if (entry.type === "log" && event.type === "console") {
        return event.text
    }
    if (event.type === "tools" || event.type === "memory" || event.type === "prompt" || event.type === "slots" || event.type === "context") {
        return stringify(event.data)
    }
    if (event.type === "turn") {
        return stringify(event.data)
    }
    if (event.type === "error") {
        return `${event.message}\n${event.stack ?? ""}`.trim()
    }
    return stringify(event)
}

export function buildConsoleCopyText(entries: DevConsoleEntry[]): string {
    return entries
        .map((entry) => {
            const head = `${entry.tag} ${entry.summary}`
            const detail = copyBody(entry)
            return detail ? `${head}\n${detail}` : head
        })
        .join("\n\n")
}
