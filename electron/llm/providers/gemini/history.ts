import { Buffer } from 'node:buffer'
import type { UIMessage } from '../../../../contracts/index'
import { filterUserAssistantText } from '../../adapters/history'
import { getMessageParts } from '../../adapters/messageParts'

/** Safely read Message.text without using any. */
function textOf(m: UIMessage): string {
    const c = (m as unknown as { content?: unknown }).content
    return typeof c === 'string' ? c : ''
}

function toGeminiParts(message: UIMessage): Array<{ text?: string; inlineData?: { mimeType: string; data: string } }> {
    const parts = getMessageParts(message)
    const out: Array<{ text?: string; inlineData?: { mimeType: string; data: string } }> = []
    for (const part of parts) {
        if (part.type === 'text') {
            if (part.text.trim().length > 0) out.push({ text: part.text })
            continue
        }
        if (!part.data || part.data.length === 0) {
            throw new Error(`AttachmentDataMissing: ${part.name}`)
        }
        out.push({
            inlineData: {
                mimeType: part.mimeType || 'application/octet-stream',
                data: Buffer.from(part.data).toString('base64'),
            },
        })
    }
    if (out.length === 0) {
        const fallback = textOf(message).trim()
        if (fallback.length > 0) out.push({ text: fallback })
    }
    return out
}

/**
 * Normalize history for Gemini:
 * - Keep only user/assistant entries that contain text
 * - Drop leading assistant messages (Gemini requires the first message to be from the user)
 * - Optionally exclude the last user message, because sendMessageStream will send the prompt again
 */
export function toGeminiHistory(
    msgs: UIMessage[],
    opts?: { excludeLastUser?: boolean }
) {
    const filtered = filterUserAssistantText(msgs)

    // Exclude the last user message when requested
    const cut = opts?.excludeLastUser
        ? (() => {
            // Find the last user entry by scanning from the end
            let lastUserIdx = -1
            for (let i = filtered.length - 1; i >= 0; i--) {
                if (filtered[i].role === 'user') {
                    lastUserIdx = i
                    break
                }
            }
            if (lastUserIdx >= 0) {
                const arr = filtered.slice()
                arr.splice(lastUserIdx, 1)
                return arr
            }
            return filtered
        })()
        : filtered

    // Drop leading assistant entries until the first user entry
    let start = 0
    while (start < cut.length && cut[start].role === 'assistant') start++

    const normalized = cut.slice(start).map(m => ({
        role: m.role === 'assistant' ? ('model' as const) : ('user' as const),
        parts: toGeminiParts(m),
    }))

    return normalized
}
