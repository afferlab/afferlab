import type { Attachment, Message, RuntimeMessage } from '../../../../contracts'
import { estimateMessageTokens } from '../../../core/attachments/attachmentTokenEstimator'

type HistoryRuntimeMessage = RuntimeMessage & {
    attachments?: Attachment[]
    parts?: unknown
}

function toPublicMessage(message: HistoryRuntimeMessage): Message {
    return {
        role: message.role === 'tool' ? 'assistant' : message.role,
        content: typeof message.content === 'string' ? message.content : null,
        ...(Array.isArray(message.attachments) && message.attachments.length > 0
            ? { attachments: message.attachments }
            : {}),
    }
}

function attachmentHintText(attachment: Attachment): string {
    return `File: ${attachment.name}`
}

function formatRecentText(messages: HistoryRuntimeMessage[]): string {
    return messages
        .map((message) => {
            const publicMessage = toPublicMessage(message)
            const roleLabel = publicMessage.role === 'system'
                ? 'System'
                : publicMessage.role === 'assistant'
                    ? 'Assistant'
                    : 'User'
            const lines = [
                `${roleLabel}: ${publicMessage.content ?? ''}`.trimEnd(),
                ...((publicMessage.attachments ?? []).map(attachmentHintText)),
            ].filter((line) => line.trim().length > 0)
            return lines.join('\n')
        })
        .filter((block) => block.trim().length > 0)
        .join('\n\n')
}

export function createHistoryHelper(historyMessages: HistoryRuntimeMessage[]) {
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
        selected: HistoryRuntimeMessage[],
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

    const sliceRange = (fromEnd: number, toEnd: number): HistoryRuntimeMessage[] => {
        if (!Number.isFinite(fromEnd) || !Number.isFinite(toEnd)) return []
        if (fromEnd <= toEnd || toEnd < 0) return []
        const end = historyMessages.length
        const startIdx = Math.max(0, end - Math.max(0, fromEnd))
        const endIdx = Math.max(0, end - Math.max(0, toEnd))
        return historyMessages.slice(startIdx, Math.max(startIdx, endIdx))
    }

    const historyHelper = {
        lastUser: () => {
            for (let i = historyMessages.length - 1; i >= 0; i -= 1) {
                const msg = historyMessages[i]
                if (msg.role === 'user') return toPublicMessage(msg)
            }
            return null
        },
        lastAssistant: () => {
            for (let i = historyMessages.length - 1; i >= 0; i -= 1) {
                const msg = historyMessages[i]
                if (msg.role === 'assistant') return toPublicMessage(msg)
            }
            return null
        },
        range: ({ fromEnd, toEnd }: { fromEnd: number; toEnd: number }) => {
            const selected = sliceRange(fromEnd, toEnd)
            recordDebugState('range', selected, fromEnd, 'range')
            return selected.map(toPublicMessage)
        },
        recent: (n: number) => {
            const selected = sliceRange(n, 0)
            recordDebugState('recent', selected, n, 'recent')
            return selected.map(toPublicMessage)
        },
        byTokens: (maxTokens: number) => {
            if (!Number.isFinite(maxTokens) || maxTokens <= 0) return []
            const picked: HistoryRuntimeMessage[] = []
            let total = 0
            for (let i = historyMessages.length - 1; i >= 0; i -= 1) {
                const msg = historyMessages[i]
                const tokens = estimateMessageTokens(msg).totalTokens
                if (total + tokens > maxTokens) break
                total += tokens
                picked.push(msg)
            }
            const selected = picked.reverse()
            recordDebugState('byTokens', selected, maxTokens, 'byTokens')
            return selected.map(toPublicMessage)
        },
        recentText: (n: number) => {
            return formatRecentText(sliceRange(n, 0))
        },
        debugState: () => lastDebugState,
        peekRecent: (n: number) => sliceRange(n, 0),
    }
    return historyHelper
}
