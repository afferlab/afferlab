// electron/llm/adapters/history.ts
import type { UIMessage } from '../../../contracts/index'
import { messageTextFromParts } from '../../../shared/chat/contentParts'
import { getMessageParts, normalizeMessage } from './messageParts'

/** Return the non-empty string representation of message.content; otherwise return undefined. */
export function textContent(m: UIMessage): string | undefined {
    const normalized = normalizeMessage(m)
    const base = typeof normalized.content === 'string' ? normalized.content : ''
    const parts = getMessageParts(normalized)
    const t = messageTextFromParts(parts, base).trim()
    return t.length > 0 ? t : undefined
}

export function hasFileContent(m: UIMessage): boolean {
    const normalized = normalizeMessage(m)
    const parts = getMessageParts(normalized)
    return parts.some((part) => part.type === 'file' || part.type === 'image')
}

/** Find the last non-empty user text by scanning from the end. */
export function lastUserMessage(msgs: UIMessage[]): string | undefined {
    for (let i = msgs.length - 1; i >= 0; i--) {
        const m = msgs[i]
        if (m.role === 'user') {
            const t = textContent(m)
            if (t) return t
        }
    }
    return undefined
}

/** Keep only user/assistant messages whose content resolves to non-empty text. */
export function filterUserAssistantText(msgs: UIMessage[]): UIMessage[] {
    return msgs.filter(m => {
        if (m.role !== 'user' && m.role !== 'assistant') return false
        return !!textContent(m) || hasFileContent(m)
    })
}
