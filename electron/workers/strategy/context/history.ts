import type { Message } from '../../../../contracts'
import { estimateMessageTokens, messagePlainTextWithAttachmentPlaceholders } from '../../../core/attachments/attachmentTokenEstimator'

export function createHistoryHelper(historyMessages: Message[]) {
    let lastDebugState: {
        mode: 'range' | 'recent' | 'byTokens'
        selectedCount: number
        originalCount: number
        requested?: number
        historyClipReason?: string
        historyDroppedMessageIds?: string[]
    } | null = null

    const recordDebugState = (
        mode: 'range' | 'recent' | 'byTokens',
        selected: Message[],
        requested?: number,
        reason?: string,
    ) => {
        const selectedIds = new Set(
            selected
                .map((msg) => msg.id)
                .filter((id): id is string => typeof id === 'string' && id.length > 0),
        )
        const dropped = historyMessages
            .map((msg) => msg.id)
            .filter((id): id is string => typeof id === 'string' && id.length > 0)
            .filter((id) => !selectedIds.has(id))
        lastDebugState = {
            mode,
            selectedCount: selected.length,
            originalCount: historyMessages.length,
            requested,
            historyClipReason: reason,
            historyDroppedMessageIds: dropped.length > 0 ? dropped : undefined,
        }
    }

    const sliceRange = (fromEnd: number, toEnd: number): Message[] => {
        const end = historyMessages.length
        const startIdx = Math.max(0, end - Math.max(0, fromEnd))
        const endIdx = Math.max(0, end - Math.max(0, toEnd))
        return historyMessages.slice(startIdx, Math.max(startIdx, endIdx))
    }

    const historyHelper = {
        lastUser: () => {
            for (let i = historyMessages.length - 1; i >= 0; i -= 1) {
                const msg = historyMessages[i]
                if (msg.role === 'user') return msg
            }
            return null
        },
        lastAssistant: () => {
            for (let i = historyMessages.length - 1; i >= 0; i -= 1) {
                const msg = historyMessages[i]
                if (msg.role === 'assistant') return msg
            }
            return null
        },
        range: ({ fromEnd, toEnd }: { fromEnd: number; toEnd: number }) => {
            const selected = sliceRange(fromEnd, toEnd)
            recordDebugState('range', selected, fromEnd, 'range')
            return selected
        },
        recent: (n: number) => {
            const selected = historyHelper.range({ fromEnd: n, toEnd: 0 })
            recordDebugState('recent', selected, n, 'recent')
            return selected
        },
        byTokens: (maxTokens: number) => {
            if (!Number.isFinite(maxTokens) || maxTokens <= 0) return []
            const picked: Message[] = []
            let total = 0
            for (let i = historyMessages.length - 1; i >= 0; i -= 1) {
                const msg = historyMessages[i]
                const tokens = estimateMessageTokens(msg).totalTokens
                if (total + tokens > maxTokens && picked.length > 0) break
                total += tokens
                picked.push(msg)
            }
            const selected = picked.reverse()
            recordDebugState('byTokens', selected, maxTokens, 'byTokens')
            return selected
        },
        asPlainText: (msg: Message) => {
            return messagePlainTextWithAttachmentPlaceholders(msg)
        },
        debugState: () => lastDebugState,
        peekRecent: (n: number) => sliceRange(n, 0),
    }
    return historyHelper
}
