import type { Message, StrategyDevEvent } from "@contracts"
import type { DevConsoleEntry } from "../utils/devConsoleTypes"
import PromptDetails from "./PromptDetails"
import ToolDetails from "./ToolDetails"

function clip(text: string, max: number): string {
    if (text.length <= max) return text
    return `${text.slice(0, max)}...`
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

function formatElapsed(ms?: number): string {
    if (typeof ms !== "number" || ms < 0) return "-"
    if (ms < 1000) return `${Math.round(ms)}ms`
    return `${(ms / 1000).toFixed(1)}s`
}

function parseError(raw: unknown): { code?: string; message?: string } | null {
    if (!raw) return null
    if (typeof raw === "string") {
        const msg = raw.trim()
        return msg ? { message: msg } : null
    }
    if (typeof raw === "object") {
        const obj = raw as { code?: unknown; message?: unknown; error?: unknown }
        const code = typeof obj.code === "string" ? obj.code : undefined
        const message =
            typeof obj.message === "string"
                ? obj.message
                : typeof obj.error === "string"
                    ? obj.error
                    : undefined
        if (!code && !message) return null
        return { code, message }
    }
    return null
}

type AttachmentReadDetail = {
    reason?: string
    sourceKind?: string
    hasPath?: boolean
    filePath?: string
    storageKey?: string
    assetId?: string
    bytesLength?: number
    exists?: boolean
    fsErrorCode?: string
    message?: string
    stack?: string
    selectedModelId?: string
    selectedProviderId?: string
}

function parseAttachmentReadDetail(raw: unknown): AttachmentReadDetail | null {
    if (!raw || typeof raw !== "object") return null
    const root = raw as Record<string, unknown>
    const attachmentError = root.attachmentError && typeof root.attachmentError === "object"
        ? (root.attachmentError as Record<string, unknown>)
        : root
    const violations = Array.isArray(attachmentError.violations) ? attachmentError.violations : []
    if (violations.length === 0) return null
    const first = violations[0]
    if (!first || typeof first !== "object") return null
    const entry = first as Record<string, unknown>
    return {
        reason: typeof entry.reason === "string" ? entry.reason : undefined,
        sourceKind: typeof entry.sourceKind === "string" ? entry.sourceKind : undefined,
        hasPath: typeof entry.hasPath === "boolean" ? entry.hasPath : undefined,
        filePath: typeof entry.filePath === "string" ? entry.filePath : undefined,
        storageKey: typeof entry.storageKey === "string" ? entry.storageKey : undefined,
        assetId: typeof entry.assetId === "string" ? entry.assetId : undefined,
        bytesLength: typeof entry.bytesLength === "number" ? entry.bytesLength : undefined,
        exists: typeof entry.exists === "boolean" ? entry.exists : undefined,
        fsErrorCode: typeof entry.fsErrorCode === "string" ? entry.fsErrorCode : undefined,
        message: typeof entry.message === "string" ? entry.message : undefined,
        stack: typeof entry.stack === "string" ? entry.stack : undefined,
        selectedModelId: typeof attachmentError.selectedModelId === "string" ? attachmentError.selectedModelId : undefined,
        selectedProviderId: typeof attachmentError.selectedProviderId === "string" ? attachmentError.selectedProviderId : undefined,
    }
}

function extractToolNames(value: unknown): string[] {
    if (!Array.isArray(value)) return []
    const names: string[] = []
    for (const item of value) {
        if (!item || typeof item !== "object") continue
        const obj = item as { name?: unknown; function?: { name?: unknown } }
        if (typeof obj.name === "string" && obj.name.trim()) {
            names.push(obj.name)
            continue
        }
        const fnName = obj.function?.name
        if (typeof fnName === "string" && fnName.trim()) {
            names.push(fnName)
        }
    }
    return names
}

function readRawOutput(value: unknown): string | null {
    if (!value) return null
    if (typeof value === "string") {
        return value.trim().length > 0 ? value : null
    }
    if (typeof value !== "object") return null
    const obj = value as {
        rawOutput?: unknown
        raw_output?: unknown
        text?: unknown
        content?: unknown
        message?: { content?: unknown } | unknown
    }
    const candidates: unknown[] = [
        obj.rawOutput,
        obj.raw_output,
        obj.text,
        obj.content,
        (obj.message && typeof obj.message === "object")
            ? (obj.message as { content?: unknown }).content
            : undefined,
    ]
    for (const candidate of candidates) {
        if (typeof candidate !== "string") continue
        if (candidate.trim().length > 0) return candidate
    }
    return null
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

function messageText(message: Message): string {
    if (typeof message.content === "string") return message.content
    if (message.content == null) return ""
    try {
        return JSON.stringify(message.content)
    } catch {
        return String(message.content)
    }
}

function InputDetails({ event }: { event: Extract<StrategyDevEvent, { type: "context" }> }) {
    const text = event.data?.input?.text ?? ""
    const attachments = event.data?.input?.attachments ?? []
    return (
        <div className="space-y-1 text-[11px] text-tx/70 break-words [overflow-wrap:anywhere]">
            <div>text: {text ? clip(text, 400) : "<empty>"}</div>
            <div>attachments: {attachments.length}</div>
            <div>conversationId: {event.conversationId ?? "-"}</div>
            <div>turnId: {event.turnId ?? "-"}</div>
        </div>
    )
}

function SlotsDetails({ event }: { event: Extract<StrategyDevEvent, { type: "slots" }> }) {
    const entries = event.data?.entries ?? []
    return (
        <div className="min-w-0 max-w-full text-[11px] text-tx/70">
            {entries.length === 0 ? (
                <div>no slots</div>
            ) : (
                entries.map((slot, idx) => {
                    const messages = slot.messages ?? []
                    const msgCount = messages.length
                    const tokenCount = messages.reduce((sum, message) => sum + estimateMessageTokens(message), 0)
                    const roles = Array.from(new Set(messages.map((message) => message.role ?? "unknown")))
                    const roleOrMixed = roles.length === 0 ? "-" : roles.length === 1 ? roles[0] : "mixed"
                    const priority = slot.options?.priority
                    const position = slot.options?.position
                    return (
                        <details
                            key={`${slot.name}-${idx}`}
                            className={idx > 0 ? "border-t border-border/40" : undefined}
                        >
                            <summary className="cursor-pointer py-1 break-words [overflow-wrap:anywhere]">
                                {slot.name} - role:{roleOrMixed}, msgs:{msgCount}, tok:~{tokenCount}, priority:{priority ?? "-"}, position:{position ?? "-"}
                            </summary>
                            <div className="pl-3 py-1">
                                {messages.length === 0 ? (
                                    <div>no messages</div>
                                ) : (
                                    messages.map((message, messageIndex) => {
                                        const text = messageText(message)
                                        const msgTokens = estimateMessageTokens(message)
                                        return (
                                            <details
                                                key={`${slot.name}-${idx}-msg-${messageIndex}`}
                                                className={messageIndex > 0 ? "border-t border-border/40" : undefined}
                                            >
                                                <summary className="cursor-pointer py-1 break-words [overflow-wrap:anywhere]">
                                                    #{messageIndex + 1} tok:~{msgTokens}
                                                </summary>
                                                <pre className="pl-3 py-1 whitespace-pre-wrap break-words [overflow-wrap:anywhere]">{text || "<empty>"}</pre>
                                            </details>
                                        )
                                    })
                                )}
                            </div>
                        </details>
                    )
                })
            )}
        </div>
    )
}

function LlmDetails({ entry }: { entry: DevConsoleEntry }) {
    const event = entry.data
    if (event.type !== "tools") return null

    const action = event.data?.action ?? "llm"
    const input = event.data?.input as {
        provider?: string
        model?: string
        attachmentTransport?: string
        messageCount?: number
        historySelectedCount?: number
        historyOriginalCount?: number
        historyClipReason?: string
        historyDroppedMessageIds?: string[]
        messages?: Message[]
        tools?: unknown[]
        toolCount?: number
        partsCount?: number
        attachmentsCount?: number
        estimatedTokens?: number
        safetyMargin?: number
        webSearchMode?: string
    } | undefined
    const output = event.data?.output as {
        finishReason?: string
        usage?: { prompt?: number; completion?: number; total?: number }
        toolCalls?: unknown[]
        error?: unknown
    } | undefined

    if (action === "llm.call" || action === "llm.run") {
        const provider = input?.provider ?? "-"
        const model = input?.model ?? "-"
        const messageCount = typeof input?.messageCount === "number"
            ? input.messageCount
            : Array.isArray(input?.messages)
                ? input.messages.length
                : "-"
        const toolsRaw = Array.isArray(input?.tools) ? input.tools : []
        const toolNames = toolsRaw.map((tool) => {
            if (typeof tool === "string") return tool
            if (!tool || typeof tool !== "object") return "unknown"
            const obj = tool as { name?: unknown; function?: { name?: unknown } }
            if (typeof obj.name === "string" && obj.name.trim()) return obj.name
            const fnName = obj.function?.name
            if (typeof fnName === "string" && fnName.trim()) return fnName
            return "unknown"
        })
        const toolsText = toolNames.length > 0
            ? toolNames.join(", ")
            : typeof input?.toolCount === "number" && input.toolCount === 0
                ? "-"
                : "-"
        return (
            <div className="space-y-1 text-[11px] text-tx/70 break-words [overflow-wrap:anywhere]">
                <div>provider/model: {provider}/{model}</div>
                <div>transport: {input?.attachmentTransport ?? "-"}</div>
                <div>messages: {messageCount}</div>
                <div>parts: {input?.partsCount ?? "-"}, attachments: {input?.attachmentsCount ?? "-"}</div>
                <div>token estimate: {input?.estimatedTokens ?? "-"} (margin {input?.safetyMargin ?? "-"})</div>
                <div>history selected: {input?.historySelectedCount ?? "-"} / {input?.historyOriginalCount ?? "-"}</div>
                <div>history clip: {input?.historyClipReason ?? "-"}</div>
                {Array.isArray(input?.historyDroppedMessageIds) && input.historyDroppedMessageIds.length > 0 ? (
                    <div>dropped: {input.historyDroppedMessageIds.join(", ")}</div>
                ) : null}
                <div>webSearch: {input?.webSearchMode ?? "-"}</div>
                <div>tools: {toolsText}</div>
            </div>
        )
    }

    const usage = output?.usage
    const error = parseError(event.data?.error ?? output?.error)
    const toolNames = extractToolNames(output?.toolCalls)
    const rawOutput = readRawOutput(output)

    return (
        <div className="space-y-1 text-[11px] text-tx/70 break-words [overflow-wrap:anywhere]">
            <div>finishReason: {output?.finishReason ?? "-"}</div>
            <div>durationMs: {formatElapsed(entry.meta?.elapsedMs)}</div>
            {usage ? (
                <div>usage detail: prompt={usage.prompt ?? "-"}, completion={usage.completion ?? "-"}, total={usage.total ?? "-"}</div>
            ) : null}
            {error ? (
                <div>error: code={error.code ?? "-"}, message={error.message ?? "-"}</div>
            ) : null}
            {toolNames.length > 0 ? (
                <div>tool_calls: {toolNames.join(", ")}</div>
            ) : null}
            {rawOutput ? (
                <details>
                    <summary className="cursor-pointer break-words [overflow-wrap:anywhere]">raw_output</summary>
                    <pre className="mt-1 whitespace-pre-wrap break-words [overflow-wrap:anywhere]">{rawOutput}</pre>
                </details>
            ) : null}
        </div>
    )
}

function ResultDetails({ entry }: { entry: DevConsoleEntry }) {
    const event = entry.data
    const attachmentRead = parseAttachmentReadDetail(
        (entry.meta?.resultMessage as { rawError?: unknown } | undefined)?.rawError
    )
    if (event.type === "turn") {
        const rawStatus = event.data?.status ?? "-"
        const stopReason = event.data?.reason
        const status = stopReason === "aborted"
            ? "aborted"
            : rawStatus === "error"
                ? "error"
                : rawStatus === "done"
                    ? "done"
                    : rawStatus
        const errorCode = status === "error" && stopReason ? stopReason : undefined
        const errorMessage = status === "error" ? event.data?.message : undefined
        return (
            <div className="space-y-1 text-[11px] text-tx/70 break-words [overflow-wrap:anywhere]">
                <div>status: {status}</div>
                {stopReason ? <div>stopReason: {stopReason}</div> : null}
                {(errorCode || errorMessage) ? (
                    <div>error: code={errorCode ?? "-"}, message={errorMessage ?? "-"}</div>
                ) : null}
                {attachmentRead?.reason ? <div>readReason: {attachmentRead.reason}</div> : null}
                {attachmentRead?.sourceKind ? <div>sourceKind: {attachmentRead.sourceKind}</div> : null}
                {typeof attachmentRead?.hasPath === "boolean" ? <div>hasPath: {attachmentRead.hasPath ? "true" : "false"}</div> : null}
                {attachmentRead?.storageKey ? <div>storageKey: {attachmentRead.storageKey}</div> : null}
                {typeof attachmentRead?.exists === "boolean" ? <div>exists: {attachmentRead.exists ? "true" : "false"}</div> : null}
                {attachmentRead?.filePath ? <div>filePath: {attachmentRead.filePath}</div> : null}
                {attachmentRead?.assetId ? <div>assetId: {attachmentRead.assetId}</div> : null}
                {typeof attachmentRead?.bytesLength === "number" ? <div>bytesLength: {attachmentRead.bytesLength}</div> : null}
                {attachmentRead?.fsErrorCode ? <div>fsErrorCode: {attachmentRead.fsErrorCode}</div> : null}
                {attachmentRead?.message ? <div>message: {attachmentRead.message}</div> : null}
                {attachmentRead?.stack ? <pre className="whitespace-pre-wrap break-words [overflow-wrap:anywhere]">{attachmentRead.stack}</pre> : null}
                {attachmentRead ? <div>selectedModelId: {attachmentRead.selectedModelId ?? "not resolved"}</div> : null}
                {attachmentRead ? <div>selectedProviderId: {attachmentRead.selectedProviderId ?? "not resolved"}</div> : null}
            </div>
        )
    }

    if (event.type === "error") {
        const errorCode = event.phase ? event.phase.toUpperCase() : undefined
        const errorMessage = event.message
        return (
            <div className="space-y-1 text-[11px] text-tx/70 break-words [overflow-wrap:anywhere]">
                <div>status: error</div>
                {event.phase ? <div>stopReason: {event.phase}</div> : null}
                {(errorCode || errorMessage) ? (
                    <div>error: code={errorCode ?? "-"}, message={errorMessage ?? "-"}</div>
                ) : null}
                {attachmentRead?.reason ? <div>readReason: {attachmentRead.reason}</div> : null}
                {attachmentRead?.sourceKind ? <div>sourceKind: {attachmentRead.sourceKind}</div> : null}
                {typeof attachmentRead?.hasPath === "boolean" ? <div>hasPath: {attachmentRead.hasPath ? "true" : "false"}</div> : null}
                {attachmentRead?.storageKey ? <div>storageKey: {attachmentRead.storageKey}</div> : null}
                {typeof attachmentRead?.exists === "boolean" ? <div>exists: {attachmentRead.exists ? "true" : "false"}</div> : null}
                {attachmentRead?.filePath ? <div>filePath: {attachmentRead.filePath}</div> : null}
                {attachmentRead?.assetId ? <div>assetId: {attachmentRead.assetId}</div> : null}
                {typeof attachmentRead?.bytesLength === "number" ? <div>bytesLength: {attachmentRead.bytesLength}</div> : null}
                {attachmentRead?.fsErrorCode ? <div>fsErrorCode: {attachmentRead.fsErrorCode}</div> : null}
                {attachmentRead?.message ? <div>message: {attachmentRead.message}</div> : null}
                {attachmentRead?.stack ? <pre className="whitespace-pre-wrap break-words [overflow-wrap:anywhere]">{attachmentRead.stack}</pre> : null}
                {attachmentRead ? <div>selectedModelId: {attachmentRead.selectedModelId ?? "not resolved"}</div> : null}
                {attachmentRead ? <div>selectedProviderId: {attachmentRead.selectedProviderId ?? "not resolved"}</div> : null}
                {event.stack ? <pre className="whitespace-pre-wrap break-words [overflow-wrap:anywhere]">{event.stack}</pre> : null}
            </div>
        )
    }

    return <div className="text-[11px] text-tx/70">-</div>
}

function LogDetails({ event }: { event: StrategyDevEvent }) {
    if (event.type !== "console") return null
    return (
        <div className="space-y-1 text-[11px] text-tx/70 whitespace-pre-wrap break-words [overflow-wrap:anywhere]">
            <div>source: USER</div>
            <div>{event.text}</div>
        </div>
    )
}

type DevConsoleDetailsProps = {
    entry: DevConsoleEntry
}

export default function DevConsoleDetails({ entry }: DevConsoleDetailsProps) {
    const event = entry.data

    if (entry.type === "input" && event.type === "context") {
        return <InputDetails event={event} />
    }

    if (entry.type === "slots" && event.type === "slots") {
        return <SlotsDetails event={event} />
    }

    if (entry.type === "prompt" && event.type === "prompt") {
        return <PromptDetails messages={event.data?.messages ?? []} />
    }

    if (entry.type === "tool") {
        return <ToolDetails entry={entry} />
    }

    if (entry.type === "llm") {
        return <LlmDetails entry={entry} />
    }

    if (entry.type === "result") {
        return <ResultDetails entry={entry} />
    }

    if (entry.type === "log") {
        return <LogDetails event={event} />
    }

    return (
        <pre className="text-[11px] text-tx/70 whitespace-pre-wrap break-words [overflow-wrap:anywhere]">
            {stringify(event)}
        </pre>
    )
}
