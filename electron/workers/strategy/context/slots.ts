import type { Attachment, Input as StrategyInput, LoomaContext, Message, MessageContentPart, SlotsAddOptions } from '../../../../contracts'
import { messageTextFromParts, parseMessageContentParts } from '../../../../shared/chat/contentParts'
import { estimateTokens, estimateTokensForMessages } from '../../../core/tokens/tokenizer'

type SlotMessage = Message & {
    parts?: MessageContentPart[]
}

type SlotEntry = {
    name: string
    messages: SlotMessage[]
    options?: SlotsAddOptions
    index: number
}

type SlotsDebugEntry = {
    name: string
    messages: SlotMessage[]
    options?: SlotsAddOptions
}

type SlotsApiConfig = {
    tokenBudget?: number
    estimateMessages?: (messages: Message[]) => number
    onUpdate?: (entries: SlotsDebugEntry[]) => void
}

type WorkingSlot = SlotEntry & {
    tokenCount: number
}

function normalizeMessages(messages: SlotMessage[], role?: Message['role']): SlotMessage[] {
    return messages.map((msg) => {
        if (!role) return msg
        return { ...msg, role }
    })
}

function toAttachmentPart(attachment: Attachment): MessageContentPart {
    return {
        type: attachment.modality === 'image' ? 'image' : 'file',
        assetId: attachment.id,
        name: attachment.name,
        mimeType: attachment.mimeType ?? 'application/octet-stream',
        size: attachment.size,
    }
}

function isStrategyInput(value: unknown): value is StrategyInput {
    return Boolean(
        value
        && typeof value === 'object'
        && typeof (value as { text?: unknown }).text === 'string'
        && Array.isArray((value as { attachments?: unknown }).attachments)
    )
}

function toInputMessage(name: string, input: StrategyInput, role?: Message['role']): SlotMessage {
    const resolvedRole = role ?? (name === 'system' ? 'system' : 'user')
    const parts: MessageContentPart[] = []
    if (input.text) {
        parts.push({ type: 'text', text: input.text })
    }
    for (const attachment of input.attachments) {
        parts.push(toAttachmentPart(attachment))
    }

    return {
        role: resolvedRole,
        content: input.text,
        ...(parts.length > 0 ? { parts } : {}),
    }
}

function normalizeSlotContent(name: string, content: string | StrategyInput | Message | Message[] | null, role?: Message['role']): SlotMessage[] {
    if (content == null) return []
    if (isStrategyInput(content)) {
        return [toInputMessage(name, content, role)]
    }
    if (typeof content === 'string') {
        const resolvedRole = role ?? (name === 'system' ? 'system' : 'user')
        return [{ role: resolvedRole, content }]
    }
    const list = (Array.isArray(content) ? content : [content]) as SlotMessage[]
    return normalizeMessages(list, role)
}

function cloneMessages(messages: SlotMessage[]): SlotMessage[] {
    return messages.map((message) => ({
        ...message,
        parts: Array.isArray(message.parts) ? parseMessageContentParts(message.parts, message.content ?? '') : message.parts,
    }))
}

function extractParts(message: SlotMessage) {
    const parts = parseMessageContentParts(message.parts, message.content ?? '')
    return parts
}

function hasAttachments(message: SlotMessage): boolean {
    return extractParts(message).some((part) => part.type === 'file' || part.type === 'image')
}

function isSystemSlot(slot: SlotEntry): boolean {
    return slot.name === 'system'
}

function isHistorySlot(slot: SlotEntry): boolean {
    return slot.name.toLowerCase().includes('history') || slot.options?.trimBehavior === 'message'
}

function isInputSlot(slot: SlotEntry): boolean {
    return slot.name === 'input'
}

function isAttachmentSlot(slot: SlotEntry): boolean {
    if (isInputSlot(slot)) return false
    if (slot.name.toLowerCase().includes('attachment')) return true
    return slot.messages.some((message) => hasAttachments(message))
}

function slotCategory(slot: SlotEntry): number {
    if (isSystemSlot(slot)) return 0
    if (isHistorySlot(slot)) return 3
    if (isAttachmentSlot(slot)) return 4
    const priority = slot.options?.priority ?? 0
    if (priority >= 5) return 1
    return 2
}

function sortSlots(a: SlotEntry, b: SlotEntry): number {
    const ac = slotCategory(a)
    const bc = slotCategory(b)
    if (ac !== bc) return ac - bc
    if (ac === 1 || ac === 2) {
        const ap = a.options?.priority ?? 0
        const bp = b.options?.priority ?? 0
        if (ap !== bp) return bp - ap
    }
    const ap = a.options?.position ?? Number.POSITIVE_INFINITY
    const bp = b.options?.position ?? Number.POSITIVE_INFINITY
    if (ap !== bp) return ap - bp
    return a.index - b.index
}

function withTokenCount(slot: SlotEntry, estimateMessagesFn: (messages: Message[]) => number): WorkingSlot {
    return {
        ...slot,
        messages: cloneMessages(slot.messages),
        tokenCount: estimateMessagesFn(slot.messages),
    }
}

function refreshTokenCount(slot: WorkingSlot, estimateMessagesFn: (messages: Message[]) => number): void {
    slot.tokenCount = estimateMessagesFn(slot.messages)
}

function trimTextToTokenTarget(text: string, targetTokens: number): string {
    if (!text || targetTokens <= 0) return ''
    if (estimateTokens(text) <= targetTokens) return text
    let low = 0
    let high = text.length
    let best = text
    while (low <= high) {
        const mid = Math.floor((low + high) / 2)
        const candidate = text.slice(mid).trimStart()
        const tokens = estimateTokens(candidate)
        if (tokens <= targetTokens) {
            best = candidate
            high = mid - 1
        } else {
            low = mid + 1
        }
    }
    return best
}

function updateMessageFromParts(message: SlotMessage, parts: ReturnType<typeof parseMessageContentParts>): SlotMessage {
    return {
        ...message,
        content: messageTextFromParts(parts, message.content),
        parts,
    }
}

function trimMessageAttachments(message: SlotMessage): SlotMessage | null {
    const parts = extractParts(message)
    if (!parts.some((part) => part.type === 'file' || part.type === 'image')) return message
    const textOnly = parts.filter((part) => part.type === 'text')
    if (textOnly.length === 0 && !(message.content ?? '').trim()) return null
    return updateMessageFromParts(message, textOnly)
}

function trimMessageText(message: SlotMessage, targetTokens: number): SlotMessage {
    const parts = extractParts(message)
    const textParts = parts.filter((part) => part.type === 'text')
    const text = textParts.length > 0
        ? messageTextFromParts(textParts, message.content)
        : (message.content ?? '')
    const trimmedText = trimTextToTokenTarget(text, targetTokens)
    return {
        ...message,
        content: trimmedText,
        parts: trimmedText ? [{ type: 'text', text: trimmedText }] : [],
    }
}

function trimSlotMessagesToBudget(args: {
    slot: WorkingSlot
    targetTokens: number
    estimateMessagesFn: (messages: Message[]) => number
}): void {
    const minimumTokens = Math.max(0, args.slot.options?.minTokens ?? 0)
    const budgetFloor = Math.max(args.targetTokens, minimumTokens)
    while (args.slot.messages.length > 0 && args.slot.tokenCount > budgetFloor) {
        if (args.slot.messages.length > 1) {
            args.slot.messages.shift()
            refreshTokenCount(args.slot, args.estimateMessagesFn)
            continue
        }
        const [lastMessage] = args.slot.messages
        const preservedMessageBudget = Math.max(0, budgetFloor)
        const trimmed = trimMessageText(lastMessage, preservedMessageBudget)
        args.slot.messages = [trimmed]
        refreshTokenCount(args.slot, args.estimateMessagesFn)
        break
    }
}

function trimSlotAttachments(args: {
    slot: WorkingSlot
    targetTokens: number
    estimateMessagesFn: (messages: Message[]) => number
}): void {
    for (let i = 0; i < args.slot.messages.length && args.slot.tokenCount > args.targetTokens; i += 1) {
        const trimmed = trimMessageAttachments(args.slot.messages[i])
        if (!trimmed) {
            args.slot.messages.splice(i, 1)
            i -= 1
        } else {
            args.slot.messages[i] = trimmed
        }
        refreshTokenCount(args.slot, args.estimateMessagesFn)
    }
    if (args.slot.tokenCount > args.targetTokens) {
        trimSlotMessagesToBudget(args)
    }
}

function trimLowPrioritySlot(args: {
    slot: WorkingSlot
    targetTokens: number
    estimateMessagesFn: (messages: Message[]) => number
}): void {
    if ((args.slot.options?.trimBehavior ?? 'message') === 'char' && args.slot.messages.length > 0) {
        trimSlotMessagesToBudget(args)
        return
    }
    args.slot.messages = []
    refreshTokenCount(args.slot, args.estimateMessagesFn)
}

function finalizeMessages(slots: WorkingSlot[]): Message[] {
    return slots
        .filter((slot) => slot.messages.length > 0)
        .sort(sortSlots)
        .flatMap((slot) => slot.messages)
}

export function enforcePromptTokenBudget(args: {
    messages: Message[]
    budget: number
    estimateMessages?: (messages: Message[]) => number
}): { messages: Message[]; totalTokens: number; trimmed: boolean } {
    const estimateMessagesFn = args.estimateMessages ?? estimateTokensForMessages
    const budget = Math.max(0, Math.floor(args.budget))
    const working = cloneMessages(args.messages)
    let totalTokens = estimateMessagesFn(working)
    let trimmed = false
    let latestUserIndex = -1
    for (let i = working.length - 1; i >= 0; i -= 1) {
        if (working[i]?.role === 'user') {
            latestUserIndex = i
            break
        }
    }

    while (totalTokens > budget) {
        const removableIndex = working.findIndex((message, index) => message.role !== 'system' && index !== latestUserIndex)
        if (removableIndex >= 0) {
            working.splice(removableIndex, 1)
            if (latestUserIndex > removableIndex) latestUserIndex -= 1
            totalTokens = estimateMessagesFn(working)
            trimmed = true
            continue
        }

        if (latestUserIndex >= 0) {
            const current = working[latestUserIndex]
            const withoutCurrent = working.filter((_, index) => index !== latestUserIndex)
            const remainingBudget = Math.max(0, budget - estimateMessagesFn(withoutCurrent))
            const trimmedUser = trimMessageAttachments(current) ?? current
            const finalUser = trimMessageText(trimmedUser, remainingBudget)
            if (estimateMessagesFn([finalUser]) >= estimateMessagesFn([current]) && totalTokens > budget) {
                break
            }
            working[latestUserIndex] = finalUser
            totalTokens = estimateMessagesFn(working)
            trimmed = true
            continue
        }

        const systemIndex = working.findIndex((message) => message.role === 'system')
        if (systemIndex >= 0) {
            const current = working[systemIndex]
            const withoutCurrent = working.filter((_, index) => index !== systemIndex)
            const remainingBudget = Math.max(0, budget - estimateMessagesFn(withoutCurrent))
            const trimmedSystem = trimMessageText(current, remainingBudget)
            if (estimateMessagesFn([trimmedSystem]) >= estimateMessagesFn([current]) && totalTokens > budget) {
                break
            }
            working[systemIndex] = trimmedSystem
            totalTokens = estimateMessagesFn(working)
            trimmed = true
            continue
        }

        break
    }

    return {
        messages: working,
        totalTokens,
        trimmed,
    }
}

export function createSlotsApi(config?: SlotsApiConfig): { add: LoomaContext['slots']['add']; render: LoomaContext['slots']['render'] } {
    const slots: SlotEntry[] = []
    const estimateMessagesFn = config?.estimateMessages ?? estimateTokensForMessages

    return {
        add: (name, content, options) => {
            const messages = normalizeSlotContent(name, content, options?.role)
            if (messages.length === 0) return
            slots.push({
                name,
                messages,
                options,
                index: slots.length,
            })
            config?.onUpdate?.(slots.map((slot) => ({
                name: slot.name,
                messages: slot.messages,
                options: slot.options,
            })))
        },
        render: () => {
            const ordered = [...slots].sort(sortSlots).map((slot) => withTokenCount(slot, estimateMessagesFn))
            const budget = Math.max(0, Math.floor(config?.tokenBudget ?? Number.POSITIVE_INFINITY))
            let totalTokens = ordered.reduce((sum, slot) => sum + slot.tokenCount, 0)

            if (Number.isFinite(budget) && totalTokens > budget) {
                const historySlots = ordered.filter((slot) => isHistorySlot(slot) && !isInputSlot(slot))
                for (const slot of historySlots) {
                    if (totalTokens <= budget) break
                    trimSlotMessagesToBudget({
                        slot,
                        targetTokens: Math.max(0, slot.tokenCount - (totalTokens - budget)),
                        estimateMessagesFn,
                    })
                    totalTokens = ordered.reduce((sum, item) => sum + item.tokenCount, 0)
                }

                const attachmentSlots = ordered.filter((slot) => isAttachmentSlot(slot) && !isInputSlot(slot))
                for (const slot of attachmentSlots) {
                    if (totalTokens <= budget) break
                    trimSlotAttachments({
                        slot,
                        targetTokens: Math.max(0, slot.tokenCount - (totalTokens - budget)),
                        estimateMessagesFn,
                    })
                    totalTokens = ordered.reduce((sum, item) => sum + item.tokenCount, 0)
                }

                const lowPrioritySlots = ordered
                    .filter((slot) => !isSystemSlot(slot) && !isInputSlot(slot) && !isHistorySlot(slot) && !isAttachmentSlot(slot))
                    .sort((a, b) => (a.options?.priority ?? 0) - (b.options?.priority ?? 0))
                for (const slot of lowPrioritySlots) {
                    if (totalTokens <= budget) break
                    trimLowPrioritySlot({
                        slot,
                        targetTokens: Math.max(0, slot.tokenCount - (totalTokens - budget)),
                        estimateMessagesFn,
                    })
                    totalTokens = ordered.reduce((sum, item) => sum + item.tokenCount, 0)
                }
            }

            const finalMessages = finalizeMessages(ordered)
            const enforced = Number.isFinite(budget)
                ? enforcePromptTokenBudget({
                    messages: finalMessages,
                    budget,
                    estimateMessages: estimateMessagesFn,
                })
                : {
                    messages: finalMessages,
                    totalTokens: estimateMessagesFn(finalMessages),
                    trimmed: false,
                }
            return { messages: enforced.messages }
        },
    }
}
