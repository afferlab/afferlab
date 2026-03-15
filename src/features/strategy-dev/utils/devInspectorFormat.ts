import type { Message, StrategyDevEvent, StrategyDevEventPhase, LoomaAttachment } from "@contracts"
import type { DevFilterKey, DevTurnScope } from "@/features/strategy-dev/state/devUiStore"

export type DevStatusData = Extract<StrategyDevEvent, { type: "status" }>["data"]

export type RowFieldTone = "ok" | "muted" | "warn" | "error"

export type RowField = {
    label: string
    value: string
    tone?: RowFieldTone
}

export type DevInspectorRowDetails = {
    keyFields?: RowField[]
    sections?: Array<{ title: string; fields: RowField[] }>
    promptMessages?: Message[]
    logs?: Array<{ level: string; timeLabel: string; text: string }>
    outputPreview?: string
}

export type DevInspectorRow = {
    id: string
    badge: string
    title: string
    tsLabel: string
    primaryFields: RowField[]
    secondaryFields?: RowField[]
    details?: DevInspectorRowDetails
    metaLine?: string
    jsonData?: unknown
    jsonLabel?: string
}

export type DevInspectorErrorEvent = {
    key: string
    message: string
    phase?: string
    stack?: string
}

export type DevInspectorTurnGroup = {
    turnKey: string
    label: string
    rows: Array<{ category: DevFilterKey; row: DevInspectorRow }>
}

export type DevInspectorDerived = {
    statusData: DevStatusData | null
    errorPanel: DevInspectorErrorEvent[]
    turnGroups: DevInspectorTurnGroup[]
    counts: Record<DevFilterKey, number>
}

type NormalizedHistorySelection = {
    selectedCount?: number
    originalCount?: number
    historyClipReason?: string
    historyDroppedMessageIds?: string[]
}

type NormalizedPromptMeta = {
    inputTokenEstimate?: number
    historySelectedCount?: number
    historyOriginalCount?: number
    historyClipReason?: string
    historyDroppedMessageIds?: string[]
}

type NormalizedResultMessage = {
    status?: string
    finishReason?: string
    content?: string
    usage?: { totalTokens?: number; inputTokens?: number; outputTokens?: number }
    rawError?: unknown
    errorCode?: string
}

type NormalizedEventData = {
    [key: string]: unknown
    active?: boolean
    fallbackUsed?: boolean
    source?: "worker" | "host"
    action?: string
    input?: Record<string, unknown> & { text?: string; attachments?: LoomaAttachment[] }
    output?: unknown
    error?: string
    status?: string
    entries?: Array<{ name?: string; messages?: Message[]; key?: string; value?: unknown }>
    historySelection?: NormalizedHistorySelection
    capabilities?: {
        tools?: boolean
        vision?: boolean
        structuredOutput?: boolean
    }
    message?: NormalizedResultMessage | string | null
    messages?: Message[]
    meta?: NormalizedPromptMeta
    totalTokens?: number
    textTokens?: number
    attachmentEstimatedTokens?: number
    safetyMarginTokens?: number
    maxTokens?: number
    usedRatio?: number
}

type NormalizedEvent = {
    type: StrategyDevEvent["type"]
    conversationId: string
    strategyId: string
    turnId?: string | null
    timestamp: number
    ts: number
    phase: StrategyDevEventPhase | "system"
    kind: string
    turnKey: string
    key: string
    data?: NormalizedEventData
    level?: string
    text?: string
    message?: string
    stack?: string
    version?: string
    hash?: string
}

type SlotCounts = Record<string, number>

type TurnViewModel = {
    turnKey: string
    label: string
    events: NormalizedEvent[]
    inputEvent?: NormalizedEvent
    slotsEvent?: NormalizedEvent
    promptEvent?: NormalizedEvent
    budgetEvent?: NormalizedEvent
    resultEvent?: NormalizedEvent
    toolEvents: NormalizedEvent[]
    memoryEvents: NormalizedEvent[]
    logEvents: NormalizedEvent[]
}

const SLOT_ORDER = ["history", "system", "input"]

function formatTime(ts: number): string {
    return new Date(ts).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", second: "2-digit" })
}

function formatIso(ts: number): string {
    return new Date(ts).toISOString()
}

function cleanText(text: string): string {
    return text.replace(/\s+/g, " ").trim()
}

function truncateText(text: string, max: number): string {
    if (text.length <= max) return text
    return `${text.slice(0, max)}...`
}

function formatBytes(size?: number): string {
    if (typeof size !== "number" || Number.isNaN(size)) return "-"
    if (size < 1024) return `${size} B`
    if (size < 1024 * 1024) return `${(size / 1024).toFixed(1)} KB`
    if (size < 1024 * 1024 * 1024) return `${(size / (1024 * 1024)).toFixed(1)} MB`
    return `${(size / (1024 * 1024 * 1024)).toFixed(1)} GB`
}

function isPhase(value: unknown): value is StrategyDevEventPhase {
    return value === "context" || value === "llm" || value === "turnEnd" || value === "system"
}

function inferPhase(event: StrategyDevEvent): StrategyDevEventPhase | "system" {
    if (isPhase(event.phase)) return event.phase
    switch (event.type) {
        case "context":
        case "prompt":
        case "slots":
        case "budget":
        case "state":
            return "context"
        case "tools":
            if (
                event.data?.action === "llm.call"
                || event.data?.action === "llm.run"
                || event.data?.action === "llm.result"
            ) {
                return "llm"
            }
            return "turnEnd"
        case "memory":
            return "turnEnd"
        case "console":
        case "error":
        case "meta":
        case "reload":
        case "status":
        case "turn":
        default:
            return "system"
    }
}

function inferKind(event: StrategyDevEvent): string {
    if (event.kind) return event.kind
    switch (event.type) {
        case "context":
            return "context.snapshot"
        case "prompt":
            return "prompt.final"
        case "slots":
            return "slots.snapshot"
        case "budget":
            return "budget.summary"
        case "state":
            return "state.snapshot"
        case "tools":
            if (event.data?.action === "toolCall") return "tool.call"
            if (event.data?.action === "tool.call") return "tool.call"
            if (event.data?.action === "tool.result") return "tool.result"
            if (event.data?.action === "tool.error") return "tool.error"
            if (event.data?.action === "llm.result") return "llm.result"
            if (event.data?.action === "llm.call" || event.data?.action === "llm.run") {
                return event.data?.output ? "llm.result" : "llm.call"
            }
            return "tools.context"
        case "memory":
            return `memory.${event.data?.action ?? "event"}`
        case "console":
            return "log"
        case "error":
            return "error"
        case "meta":
            return "meta"
        case "reload":
            return "reload"
        case "status":
            return "status"
        case "turn":
            return event.data?.status === "error"
                ? "turn.error"
                : event.data?.status === "done"
                    ? "turn.done"
                    : "turn.start"
        default:
            return "unknown"
    }
}

function buildMetaLine(event?: NormalizedEvent): string {
    if (!event) return "No event metadata"
    return [
        `phase=${event.phase}`,
        `kind=${event.kind}`,
        `ts=${formatIso(event.ts)}`,
        event.conversationId ? `conversationId=${event.conversationId}` : null,
        event.strategyId ? `strategyId=${event.strategyId}` : null,
        event.turnId ? `turnId=${event.turnId}` : null,
    ]
        .filter(Boolean)
        .join(" | ")
}

function getSlotCounts(event?: NormalizedEvent): SlotCounts | null {
    if (!event || event.type !== "slots") return null
    const counts: SlotCounts = {}
    for (const entry of event.data?.entries ?? []) {
        const count = entry.messages?.length ?? 0
        const name = entry.name ?? "unknown"
        counts[name] = (counts[name] ?? 0) + count
    }
    return counts
}

function buildSlotDelta(current: SlotCounts | null, prev: SlotCounts | null): string {
    if (!current) return "-"
    const base = prev ?? {}
    const names = new Set<string>([...Object.keys(current), ...Object.keys(base)])
    const ordered = [
        ...SLOT_ORDER.filter((name) => names.has(name)),
        ...Array.from(names).filter((name) => !SLOT_ORDER.includes(name)).sort((a, b) => a.localeCompare(b)),
    ]
    const parts = ordered.map((name) => {
        const delta = (current[name] ?? 0) - (base[name] ?? 0)
        const sign = delta >= 0 ? "+" : ""
        return `${name} ${sign}${delta}`
    })
    return parts.length ? parts.join(" / ") : "-"
}

function collectRoleCounts(messages: Message[]): Record<string, number> {
    const counts: Record<string, number> = {}
    for (const msg of messages) {
        counts[msg.role] = (counts[msg.role] ?? 0) + 1
    }
    return counts
}

function getToolName(event: NormalizedEvent): string {
    if (event.type !== "tools") return "unknown"
    const input = event.data?.input as Record<string, unknown> | undefined
    const candidates = [
        input?.name,
        input?.toolName,
        input?.tool,
        (input?.function as { name?: string } | undefined)?.name,
    ]
    for (const candidate of candidates) {
        if (typeof candidate === "string" && candidate.trim()) {
            return candidate
        }
    }
    return "unknown"
}

function summarizeToolCalls(toolEvents: NormalizedEvent[]): { count: number; label: string } {
    const toolCalls = toolEvents.filter((event) => event.type === "tools" && event.data?.action === "toolCall")
    const names = toolCalls.map(getToolName).filter((name) => name !== "unknown")
    const unique = Array.from(new Set(names))
    if (toolCalls.length === 0) return { count: 0, label: "0" }
    const shown = unique.slice(0, 2)
    if (shown.length === 0) return { count: toolCalls.length, label: String(toolCalls.length) }
    const extra = unique.length > 2 ? ` +${unique.length - 2}` : ""
    return { count: toolCalls.length, label: `${toolCalls.length} (${shown.join(", ")}${extra})` }
}

function summarizeMemory(memoryEvents: NormalizedEvent[]): { count: number; label: string } {
    if (memoryEvents.length === 0) return { count: 0, label: "0" }
    const actions = memoryEvents
        .map((event) => event.data?.action)
        .filter((action): action is string => Boolean(action))
    const unique = Array.from(new Set(actions))
    if (unique.length === 0) return { count: memoryEvents.length, label: String(memoryEvents.length) }
    const shown = unique.slice(0, 2)
    const extra = unique.length > 2 ? ` +${unique.length - 2}` : ""
    return { count: memoryEvents.length, label: `${memoryEvents.length} (${shown.join(", ")}${extra})` }
}

function describeAttachment(attachment: LoomaAttachment): RowField {
    const details = [`${attachment.modality}`, formatBytes(attachment.size)].filter(Boolean).join(" / ")
    return { label: attachment.name || "attachment", value: details || "-" }
}

function describeMemoryEvent(event: NormalizedEvent): RowField {
    const action = event.data?.action ?? "event"
    const rawInput = event.data?.input
    if (typeof rawInput === "string") {
        return { label: action, value: rawInput }
    }
    const input = rawInput as Record<string, unknown> | undefined
    const detail = input?.key || input?.query || input?.text || input?.id
    const value = detail ? `${detail}` : "-"
    return { label: action, value }
}

type AttachmentReadViolation = {
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

function parseAttachmentReadViolation(raw: unknown): AttachmentReadViolation | null {
    if (!raw || typeof raw !== "object") return null
    const root = raw as Record<string, unknown>
    const detail = root.attachmentError && typeof root.attachmentError === "object"
        ? (root.attachmentError as Record<string, unknown>)
        : root
    const violations = Array.isArray(detail.violations) ? detail.violations : []
    if (!violations.length) return null
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
        selectedModelId: typeof detail.selectedModelId === "string" ? detail.selectedModelId : undefined,
        selectedProviderId: typeof detail.selectedProviderId === "string" ? detail.selectedProviderId : undefined,
    }
}

function normalizeEvents(events: StrategyDevEvent[]): NormalizedEvent[] {
    return events.map((event, index) => {
        const ts = event.ts ?? event.timestamp ?? Date.now()
        const turnKey = event.turnId ?? `sys-${event.conversationId.slice(0, 6)}-${Math.floor(ts / 1000)}`
        const withData = event as StrategyDevEvent & {
            data?: NormalizedEventData
            level?: "log" | "warn" | "error"
            text?: string
            message?: string
            stack?: string
            version?: string
            hash?: string
        }
        return {
            ...event,
            ts,
            turnKey,
            phase: inferPhase(event),
            kind: inferKind(event),
            key: `${ts}-${index}-${event.type}`,
            data: withData.data,
            level: withData.level,
            text: withData.text,
            message: withData.message,
            stack: withData.stack,
            version: withData.version,
            hash: withData.hash,
        }
    })
}

function buildTurnViewModel(turnKey: string, events: NormalizedEvent[]): TurnViewModel {
    const sorted = [...events].sort((a, b) => a.ts - b.ts)
    const inputEvent = sorted.find((event) => event.type === "context")
    const slotsEvent = [...sorted].reverse().find((event) => event.type === "slots")
    const promptEvent = [...sorted].reverse().find((event) => event.type === "prompt")
    const budgetEvent = [...sorted].reverse().find((event) => event.type === "budget")
    const resultEvent = [...sorted].reverse().find((event) => event.type === "context" && event.data?.message)

    const toolEvents = sorted.filter((event) => event.type === "tools")
    const memoryEvents = sorted.filter((event) => event.type === "memory")
    const logEvents = sorted.filter((event) => event.type === "console")

    const label = turnKey.startsWith("sys-") ? "SYSTEM" : `TURN ${turnKey.slice(0, 6)}`

    return {
        turnKey,
        label,
        events: sorted,
        inputEvent,
        slotsEvent,
        promptEvent,
        budgetEvent,
        resultEvent,
        toolEvents,
        memoryEvents,
        logEvents,
    }
}

function buildInputRow(vm: TurnViewModel, anchorTs: number): DevInspectorRow {
    const textRaw = vm.inputEvent?.data?.input?.text ?? ""
    const textClean = cleanText(textRaw)
    const preview = textClean ? `"${truncateText(textClean, 60)}"` : "-"
    const attachments = vm.inputEvent?.data?.input?.attachments ?? []
    const historySelection = vm.inputEvent?.data?.historySelection
    const caps = vm.inputEvent?.data?.capabilities

    const primaryFields: RowField[] = [
        { label: "text", value: preview },
        { label: "attachments", value: String(attachments.length) },
    ]

    const secondaryFields: RowField[] = []
    if (caps) {
        secondaryFields.push(
            { label: "tools", value: caps.tools ? "on" : "off", tone: caps.tools ? "ok" : "muted" },
            { label: "vision", value: caps.vision ? "on" : "off", tone: caps.vision ? "ok" : "muted" },
            { label: "json", value: caps.structuredOutput ? "on" : "off", tone: caps.structuredOutput ? "ok" : "muted" }
        )
    }
    if (historySelection) {
        secondaryFields.push({
            label: "history",
            value: `${historySelection.selectedCount}/${historySelection.originalCount}`,
        })
        if (historySelection.historyClipReason) {
            secondaryFields.push({ label: "clip", value: historySelection.historyClipReason })
        }
    }

    const keyFields: RowField[] = [
        { label: "text", value: textRaw || "-" },
        { label: "attachments", value: String(attachments.length) },
    ]

    const sections: Array<{ title: string; fields: RowField[] }> = []
    if (attachments.length > 0) {
        sections.push({ title: "Attachments", fields: attachments.map(describeAttachment) })
    }
    if (historySelection?.historyDroppedMessageIds && historySelection.historyDroppedMessageIds.length > 0) {
        sections.push({
            title: "Dropped Messages",
            fields: historySelection.historyDroppedMessageIds.map((id: string) => ({
                label: id,
                value: "dropped",
                tone: "warn",
            })),
        })
    }

    return {
        id: `${vm.turnKey}-input`,
        badge: "input",
        title: "Input",
        tsLabel: formatTime(anchorTs),
        primaryFields,
        secondaryFields: secondaryFields.length ? secondaryFields : undefined,
        metaLine: buildMetaLine(vm.inputEvent),
        jsonData: vm.inputEvent ?? { message: "Input event missing" },
        details: {
            keyFields,
            sections,
        },
    }
}

function buildStrategyRow(vm: TurnViewModel, prevSlots: SlotCounts | null, anchorTs: number): DevInspectorRow {
    const slotCounts = getSlotCounts(vm.slotsEvent)
    const deltaText = buildSlotDelta(slotCounts, prevSlots)
    const toolsSummary = summarizeToolCalls(vm.toolEvents)
    const memorySummary = summarizeMemory(vm.memoryEvents)

    const primaryFields: RowField[] = [
        { label: "slots", value: deltaText },
        { label: "tools", value: toolsSummary.label },
    ]
    const secondaryFields: RowField[] = []
    if (memorySummary.count > 0) {
        secondaryFields.push({ label: "memory", value: memorySummary.label })
    }

    const keyFields: RowField[] = [
        { label: "slots", value: deltaText },
        { label: "tools", value: toolsSummary.label },
    ]
    if (memorySummary.count > 0) {
        keyFields.push({ label: "memory", value: memorySummary.label })
    }

    const sections: Array<{ title: string; fields: RowField[] }> = []
    if (slotCounts) {
        sections.push({
            title: "Slots",
            fields: Object.entries(slotCounts).map(([name, count]) => ({
                label: name,
                value: String(count),
            })),
        })
    }

    const toolCalls = vm.toolEvents.filter((event) => event.type === "tools" && event.data?.action === "toolCall")
    if (toolCalls.length > 0) {
        sections.push({
            title: "Tools",
            fields: toolCalls.map((event) => {
                const name = getToolName(event)
                const status = event.data?.error ? "error" : "ok"
                return {
                    label: name,
                    value: status,
                    tone: event.data?.error ? "error" : "ok",
                }
            }),
        })
    }

    if (vm.memoryEvents.length > 0) {
        sections.push({
            title: "Memory",
            fields: vm.memoryEvents.map(describeMemoryEvent),
        })
    }

    const anchor = vm.slotsEvent ?? vm.toolEvents[0] ?? vm.memoryEvents[0] ?? vm.inputEvent

    return {
        id: `${vm.turnKey}-strategy`,
        badge: "strategy",
        title: "Strategy",
        tsLabel: formatTime(anchor?.ts ?? anchorTs),
        primaryFields,
        secondaryFields: secondaryFields.length ? secondaryFields : undefined,
        metaLine: buildMetaLine(anchor),
        jsonData: {
            slots: vm.slotsEvent,
            tools: vm.toolEvents,
            memory: vm.memoryEvents,
        },
        details: {
            keyFields,
            sections,
        },
    }
}

function buildPromptRow(vm: TurnViewModel, anchorTs: number): DevInspectorRow {
    const messages = (vm.promptEvent?.data?.messages ?? []) as Message[]
    const counts = collectRoleCounts(messages)
    const total = messages.length
    const metaTokens = vm.promptEvent?.data?.meta?.inputTokenEstimate
    const historySelected = vm.promptEvent?.data?.meta?.historySelectedCount
    const historyOriginal = vm.promptEvent?.data?.meta?.historyOriginalCount
    const historyClipReason = vm.promptEvent?.data?.meta?.historyClipReason
    const historyDropped = vm.promptEvent?.data?.meta?.historyDroppedMessageIds ?? []
    const budgetTokens = vm.budgetEvent?.data?.totalTokens
    const budgetTextTokens = vm.budgetEvent?.data?.textTokens
    const budgetAttachmentTokens = vm.budgetEvent?.data?.attachmentEstimatedTokens
    const budgetMarginTokens = vm.budgetEvent?.data?.safetyMarginTokens
    const budgetMax = vm.budgetEvent?.data?.maxTokens
    const chars = messages.reduce((sum: number, msg: Message) => sum + (typeof msg.content === "string" ? msg.content.length : 0), 0)

    const primaryFields: RowField[] = [
        { label: "system", value: String(counts.system ?? 0) },
        { label: "user", value: String(counts.user ?? 0) },
        { label: "tool", value: String(counts.tool ?? 0) },
        { label: "assistant", value: String(counts.assistant ?? 0) },
    ]

    const secondaryFields: RowField[] = [
        { label: "total", value: String(total) },
    ]
    if (typeof metaTokens === "number") {
        secondaryFields.push({ label: "tokens", value: String(metaTokens) })
    } else if (typeof budgetTokens === "number") {
        secondaryFields.push({ label: "tokens", value: String(budgetTokens) })
    } else if (chars > 0) {
        secondaryFields.push({ label: "chars", value: String(chars) })
    }
    if (typeof budgetTextTokens === "number") {
        secondaryFields.push({ label: "textTok", value: String(budgetTextTokens) })
    }
    if (typeof budgetAttachmentTokens === "number") {
        secondaryFields.push({ label: "attTok~", value: String(budgetAttachmentTokens) })
    }
    if (typeof budgetMarginTokens === "number") {
        secondaryFields.push({ label: "margin", value: String(budgetMarginTokens) })
    }
    if (typeof budgetMax === "number") {
        secondaryFields.push({ label: "max", value: String(budgetMax) })
    }
    if (typeof historySelected === "number") {
        const original = typeof historyOriginal === "number" ? historyOriginal : total
        secondaryFields.push({ label: "history", value: `${historySelected}/${original}` })
    }

    const keyFields: RowField[] = [
        { label: "messages", value: String(total) },
    ]
    if (typeof metaTokens === "number") {
        keyFields.push({ label: "tokens", value: String(metaTokens) })
    } else if (typeof budgetTokens === "number") {
        keyFields.push({ label: "tokens", value: String(budgetTokens) })
    } else if (chars > 0) {
        keyFields.push({ label: "chars", value: String(chars) })
    }
    if (typeof budgetTextTokens === "number") {
        keyFields.push({ label: "textTokens", value: String(budgetTextTokens) })
    }
    if (typeof budgetAttachmentTokens === "number") {
        keyFields.push({ label: "attachmentEstimated", value: String(budgetAttachmentTokens) })
    }
    if (typeof budgetMarginTokens === "number") {
        keyFields.push({ label: "safetyMargin", value: String(budgetMarginTokens) })
    }
    if (typeof budgetMax === "number") {
        keyFields.push({ label: "maxContext", value: String(budgetMax) })
    }
    if (typeof historySelected === "number") {
        keyFields.push({
            label: "historySelected",
            value: typeof historyOriginal === "number" ? `${historySelected}/${historyOriginal}` : String(historySelected),
        })
    }
    if (historyClipReason) {
        keyFields.push({ label: "clipReason", value: historyClipReason })
    }

    const sections: Array<{ title: string; fields: RowField[] }> = []
    if (historyDropped.length > 0) {
        sections.push({
            title: "Dropped Messages",
            fields: historyDropped.map((id: string) => ({ label: id, value: "dropped", tone: "warn" })),
        })
    }

    return {
        id: `${vm.turnKey}-prompt`,
        badge: "prompt",
        title: "Prompt",
        tsLabel: formatTime(anchorTs),
        primaryFields,
        secondaryFields,
        metaLine: buildMetaLine(vm.promptEvent),
        jsonData: vm.promptEvent ?? { message: "Prompt event missing" },
        jsonLabel: "Raw JSON",
        details: {
            keyFields,
            sections: sections.length > 0 ? sections : undefined,
            promptMessages: messages.length ? messages : undefined,
        },
    }
}

function buildResultRow(vm: TurnViewModel, anchorTs: number): DevInspectorRow {
    const message = vm.resultEvent?.data?.message as NormalizedResultMessage | undefined
    const status = message?.status ?? (vm.resultEvent ? "unknown" : "pending")
    const finish = message?.finishReason ?? "-"
    const content = typeof message?.content === "string" ? message?.content : ""
    const outputChars = content ? content.length : 0
    const usage = message?.usage?.totalTokens ?? ((message?.usage?.inputTokens ?? 0) + (message?.usage?.outputTokens ?? 0))
    const attachmentRead = parseAttachmentReadViolation(message?.rawError)

    const statusTone: RowFieldTone | undefined = status === "completed"
        ? "ok"
        : status === "error"
            ? "error"
            : status === "aborted"
                ? "warn"
                : undefined
    const primaryFields: RowField[] = [
        { label: "status", value: status, tone: statusTone },
        { label: "finish", value: finish },
    ]
    const secondaryFields: RowField[] = []
    if (outputChars) {
        secondaryFields.push({ label: "outputChars", value: String(outputChars) })
    }
    if (usage) {
        secondaryFields.push({ label: "usage", value: String(usage) })
    } else if (vm.budgetEvent?.data?.usedRatio) {
        secondaryFields.push({ label: "usage", value: `${Math.round(vm.budgetEvent.data.usedRatio * 100)}%` })
    }

    const keyFields: RowField[] = [
        { label: "status", value: status, tone: statusTone },
        { label: "finish", value: finish },
    ]
    if (outputChars) {
        keyFields.push({ label: "outputChars", value: String(outputChars) })
    }
    if (usage) {
        keyFields.push({ label: "usage", value: String(usage) })
    } else if (vm.budgetEvent?.data?.usedRatio) {
        keyFields.push({ label: "usage", value: `${Math.round(vm.budgetEvent.data.usedRatio * 100)}%` })
    }
    if (message?.errorCode) {
        keyFields.push({ label: "error", value: message.errorCode, tone: "error" })
    }
    if (attachmentRead?.reason) {
        keyFields.push({ label: "readReason", value: attachmentRead.reason, tone: "warn" })
    }
    if (attachmentRead?.sourceKind) {
        keyFields.push({ label: "sourceKind", value: attachmentRead.sourceKind })
    }
    if (typeof attachmentRead?.hasPath === "boolean") {
        keyFields.push({ label: "hasPath", value: attachmentRead.hasPath ? "true" : "false" })
    }
    if (attachmentRead?.storageKey) {
        keyFields.push({ label: "storageKey", value: attachmentRead.storageKey })
    }
    if (attachmentRead?.assetId) {
        keyFields.push({ label: "assetId", value: attachmentRead.assetId })
    }
    if (typeof attachmentRead?.bytesLength === "number") {
        keyFields.push({ label: "bytesLength", value: String(attachmentRead.bytesLength) })
    }
    if (typeof attachmentRead?.exists === "boolean") {
        keyFields.push({ label: "exists", value: attachmentRead.exists ? "true" : "false" })
    }
    if (attachmentRead?.filePath) {
        keyFields.push({ label: "filePath", value: attachmentRead.filePath })
    }
    if (attachmentRead?.fsErrorCode) {
        keyFields.push({ label: "fsErrorCode", value: attachmentRead.fsErrorCode, tone: "warn" })
    }
    if (attachmentRead?.message) {
        keyFields.push({ label: "readMessage", value: attachmentRead.message })
    }
    if (attachmentRead) {
        keyFields.push({ label: "selectedModelId", value: attachmentRead.selectedModelId ?? "not resolved" })
        keyFields.push({ label: "selectedProviderId", value: attachmentRead.selectedProviderId ?? "not resolved" })
    }

    const outputPreview = content ? truncateText(cleanText(content), 300) : ""

    return {
        id: `${vm.turnKey}-result`,
        badge: "result",
        title: "Result",
        tsLabel: formatTime(anchorTs),
        primaryFields,
        secondaryFields: secondaryFields.length ? secondaryFields : undefined,
        metaLine: buildMetaLine(vm.resultEvent ?? vm.budgetEvent ?? vm.toolEvents[vm.toolEvents.length - 1]),
        jsonData: {
            resultEvent: vm.resultEvent,
            budget: vm.budgetEvent,
            toolEvents: vm.toolEvents,
        },
        details: {
            keyFields,
            outputPreview: outputPreview || undefined,
        },
    }
}

function buildLogsRow(vm: TurnViewModel, anchorTs: number): DevInspectorRow {
    const total = vm.logEvents.length
    const warnCount = vm.logEvents.filter((event) => event.level === "warn").length
    const errorCount = vm.logEvents.filter((event) => event.level === "error").length

    const primaryFields: RowField[] = [
        { label: "logs", value: String(total) },
    ]
    if (warnCount > 0) {
        primaryFields.push({ label: "warn", value: String(warnCount), tone: "warn" })
    }
    if (errorCount > 0) {
        primaryFields.push({ label: "error", value: String(errorCount), tone: "error" })
    }

    const keyFields: RowField[] = [
        { label: "total", value: String(total) },
    ]
    if (warnCount > 0) {
        keyFields.push({ label: "warn", value: String(warnCount), tone: "warn" })
    }
    if (errorCount > 0) {
        keyFields.push({ label: "error", value: String(errorCount), tone: "error" })
    }

    const logs = vm.logEvents.map((event) => ({
        level: event.level ?? "log",
        timeLabel: formatTime(event.ts),
        text: event.text ?? "",
    }))

    return {
        id: `${vm.turnKey}-logs`,
        badge: "log",
        title: "Logs",
        tsLabel: formatTime(anchorTs),
        primaryFields,
        metaLine: buildMetaLine(vm.logEvents[0]),
        jsonData: vm.logEvents,
        details: {
            keyFields,
            logs,
        },
    }
}

export function buildDevInspectorDerived(
    events: StrategyDevEvent[],
    devTurnScope: DevTurnScope
): DevInspectorDerived {
    const normalized = normalizeEvents(events)
    const sorted = [...normalized].sort((a, b) => a.ts - b.ts)

    const statusEvents = sorted.filter((event) => event.type === "status")
    const statusData: DevStatusData | null = statusEvents.length
        ? ((statusEvents[statusEvents.length - 1].data as DevStatusData | undefined) ?? null)
        : null

    const turnMap = new Map<string, NormalizedEvent[]>()
    for (const event of sorted) {
        const list = turnMap.get(event.turnKey) ?? []
        list.push(event)
        turnMap.set(event.turnKey, list)
    }

    const turnOrder = Array.from(turnMap.entries())
        .map(([turnKey, list]) => ({
            turnKey,
            latestTs: Math.max(...list.map((item) => item.ts)),
        }))
        .sort((a, b) => b.latestTs - a.latestTs)

    const limit = devTurnScope === "latest" ? 1 : devTurnScope === "last3" ? 3 : devTurnScope === "last5" ? 5 : turnOrder.length
    const scopedTurns = devTurnScope === "all" ? turnOrder : turnOrder.slice(0, limit)
    const allowed = new Set(scopedTurns.map((item) => item.turnKey))

    let errorEvents = sorted.filter((event) => event.type === "error" && allowed.has(event.turnKey))
    if (statusData?.fallbackUsed && errorEvents.length === 0 && statusEvents.length) {
        const base = statusEvents[statusEvents.length - 1]
        const fallbackError: NormalizedEvent = {
            conversationId: base.conversationId,
            strategyId: base.strategyId,
            turnId: base.turnId,
            timestamp: base.timestamp,
            ts: base.ts,
            phase: "system",
            kind: "error",
            turnKey: base.turnKey,
            key: `${base.key}-fallback`,
            type: "error",
            message: statusData.message ?? "Dev strategy not active, fallback used",
        }
        errorEvents = [fallbackError]
    }

    const errorPanel: DevInspectorErrorEvent[] = errorEvents.map((event) => ({
        key: event.key,
        message: event.type === "error" ? (event.message ?? "Unknown error") : "Unknown error",
        phase: event.phase,
        stack: event.type === "error" ? event.stack : undefined,
    }))

    const counts: Record<DevFilterKey, number> = {
        input: 0,
        strategy: 0,
        prompt: 0,
        result: 0,
        logs: 0,
    }

    const turnsChrono = Array.from(turnMap.entries())
        .map(([turnKey, list]) => ({
            turnKey,
            latestTs: Math.max(...list.map((item) => item.ts)),
            events: list,
        }))
        .sort((a, b) => a.latestTs - b.latestTs)

    const slotCountsByTurn = new Map<string, SlotCounts | null>()
    for (const turn of turnsChrono) {
        const lastSlots = [...turn.events].reverse().find((event) => event.type === "slots")
        slotCountsByTurn.set(turn.turnKey, getSlotCounts(lastSlots))
    }

    const prevSlotByTurn = new Map<string, SlotCounts | null>()
    let prevSlots: SlotCounts | null = null
    for (const turn of turnsChrono) {
        prevSlotByTurn.set(turn.turnKey, prevSlots)
        const nextSlots = slotCountsByTurn.get(turn.turnKey) ?? null
        if (nextSlots) {
            prevSlots = nextSlots
        }
    }

    const turnGroups = scopedTurns.map((turn) => {
        const vm = buildTurnViewModel(turn.turnKey, turnMap.get(turn.turnKey) ?? [])
        const rows: Array<{ category: DevFilterKey; row: DevInspectorRow }> = []

        const inputAnchor = vm.inputEvent ?? vm.promptEvent ?? vm.slotsEvent
        rows.push({
            category: "input",
            row: buildInputRow(vm, inputAnchor?.ts ?? turn.latestTs),
        })
        counts.input += 1

        rows.push({
            category: "strategy",
            row: buildStrategyRow(vm, prevSlotByTurn.get(turn.turnKey) ?? null, turn.latestTs),
        })
        counts.strategy += 1

        rows.push({
            category: "prompt",
            row: buildPromptRow(vm, vm.promptEvent?.ts ?? turn.latestTs),
        })
        counts.prompt += 1

        const hasResult = Boolean(vm.resultEvent || vm.toolEvents.length || vm.budgetEvent)
        if (hasResult) {
            rows.push({
                category: "result",
                row: buildResultRow(vm, vm.resultEvent?.ts ?? turn.latestTs),
            })
            counts.result += 1
        }

        if (vm.logEvents.length) {
            rows.push({
                category: "logs",
                row: buildLogsRow(vm, vm.logEvents[0]?.ts ?? turn.latestTs),
            })
            counts.logs += vm.logEvents.length
        }

        return { turnKey: vm.turnKey, label: vm.label, rows }
    })

    return { statusData, errorPanel, turnGroups, counts }
}
