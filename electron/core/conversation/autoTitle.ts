import { BrowserWindow } from 'electron'
import { v4 as uuidv4 } from 'uuid'
import type { Database } from 'better-sqlite3'
import type { UIMessage } from '../../../contracts/index'
import type { ConversationTitleUpdatedEventData } from '../../../contracts/ipc/event'
import { IPC } from '../../ipc/channels'
import { callLLMUniversalNonStream } from '../../llm'
import { resolveModelConfig } from '../models/modelRegistry'

const DEFAULT_TITLE = 'New conversation'
// Optimization 1: keep titles within 60 characters because the UI truncates longer ones anyway
const DEFAULT_MAX_CHARS = 60
// Optimization 2: lower temperature to 0.3 because accuracy matters more than creativity here
const TITLE_TEMP = 0.3
// Optimization 3: lower the token limit to 50 to force concise output
const TITLE_MAX_TOKENS = 50

const running = new Set<string>()

type AutoTitleRow = {
    tseq: number
    user_message_id?: string | null
    title: string
    title_source: string
    asst_status?: string | null
    asst_content?: string | null
}

function broadcastTitleUpdate(payload: ConversationTitleUpdatedEventData) {
    for (const win of BrowserWindow.getAllWindows()) {
        if (win.isDestroyed()) continue
        win.webContents.send(IPC.CONVERSATION_TITLE_UPDATED, payload)
    }
}

export async function maybeAutoTitleConversation(args: {
    db: Database
    conversationId: string
    turnId: string
    replyId: string
    modelId: string
    providerId?: string | null
    maxChars?: number
}): Promise<{ updated: boolean; skipReason?: string }> {
    const { db, conversationId, turnId, replyId, modelId } = args
    const prefix = `[AUTOTITLE][conv=${conversationId}]`

    if (running.has(conversationId)) {
        return { updated: false, skipReason: 'already_running' }
    }

    const row = db.prepare(`
        SELECT
            t.tseq AS tseq,
            t.user_message_id AS user_message_id,
            c.title AS title,
            c.title_source AS title_source,
            m.status AS asst_status,
            m.content AS asst_content
        FROM turns t
                 JOIN conversations c ON c.id = t.conversation_id
                 LEFT JOIN messages m ON m.id = ? AND m.conversation_id = c.id
        WHERE t.id = ? AND c.id = ?
    `).get(replyId, turnId, conversationId) as AutoTitleRow | undefined

    if (!row) return { updated: false, skipReason: 'turn_not_found' }
    if (row.tseq !== 1) return { updated: false, skipReason: 'not_first_turn' }
    if (row.title_source !== 'default') return { updated: false, skipReason: 'title_source_not_default' }
    if (row.title !== DEFAULT_TITLE) return { updated: false, skipReason: 'title_not_default' }

    // Generate a title only if the assistant actually produced output
    const asstLen = row.asst_content?.trim().length ?? 0
    if (asstLen === 0) return { updated: false, skipReason: 'assistant_empty' }

    const msgRow = row.user_message_id
        ? (db.prepare(`SELECT content FROM messages WHERE id = ?`)
            .get(row.user_message_id) as { content?: string | null } | undefined)
        : undefined

    const userContent = msgRow?.content?.trim() ?? ''

    // If the user input is too short (for example "hi"), skip title generation, or let the LLM handle it
    if (!userContent || userContent.length < 2) return { updated: false, skipReason: 'user_content_too_short' }

    try {
        resolveModelConfig({ modelId })
    } catch {
        return { updated: false, skipReason: 'model_not_found' }
    }

    running.add(conversationId)

    try {
        const maxChars = args.maxChars ?? DEFAULT_MAX_CHARS

        // Optimization 4: rewrite the prompt.
        // Key point: place User Content inside the prompt instead of sending it as a separate message.
        // That helps the LLM treat it as data rather than as dialogue.
        const promptContent = `
Task: Create a concise, descriptive title (3-6 words) for the conversation below.
Language: The title MUST be in the same language as the conversation content.
Constraint: Do NOT answer the user's message. Do NOT summarize the answer. Just a title.
Max length: ${maxChars} characters.

Example Input: "How do I fix a Python recursion error?"
Example Output: Python Recursion Fix

Example Input: "Give me a recipe for chocolate cake"
Example Output: Chocolate Cake Recipe

Conversation Content to Title:
"""
${userContent.slice(0, 1000)}
"""

Title:
`.trim()

        const now = Date.now()
        // Optimization 5: many models weigh the System role differently.
        // For a single-purpose task like this, one User message with all context is usually the most robust option.
        const history: UIMessage[] = [
            {
                id: uuidv4(),
                conversation_id: conversationId,
                role: 'user', // Intentionally use the user role so the model interprets this as a task request
                type: 'text',
                content: promptContent,
                timestamp: now,
            }
        ]

        const titleModel = resolveModelConfig({
            modelId,
            runtimeOverrides: {
                params: {
                    temperature: TITLE_TEMP,
                    maxTokens: TITLE_MAX_TOKENS,
                    top_p: 1,
                },
            },
        })

        let title: string | null = null

        for (let attempt = 1; attempt <= 2; attempt++) {
            try {
                const raw = await callLLMUniversalNonStream(titleModel, history, undefined, undefined)

                // Clean the result: trim whitespace, strip possible quotes, and drop trailing periods
                let candidate = typeof raw === 'string' ? raw.trim() : ''
                candidate = candidate.replace(/^["']|["']$/g, '').replace(/\.$/, '')

                console.log(prefix, `attempt=${attempt}`, { candidate })

                // Basic validity check: non-empty and not identical to the original text
                if (candidate && candidate.length > 0 && candidate !== userContent) {
                    title = candidate
                    break
                }
            } catch (e) {
                console.warn(prefix, `attempt=${attempt} failed`, e)
            }
        }

        if (!title) {
            return { updated: false, skipReason: 'llm_failed' }
        }

        const updatedAt = Date.now()
        const result = db.prepare(`
            UPDATE conversations
            SET title = ?, title_source = 'auto', updated_at = ?
            WHERE id = ? AND title_source = 'default' AND title = ?
        `).run(title, updatedAt, conversationId, DEFAULT_TITLE)

        if (result.changes === 0) {
            return { updated: false, skipReason: 'user_renamed_mid_flight' }
        }

        broadcastTitleUpdate({
            conversation_id: conversationId,
            old_title: DEFAULT_TITLE,
            new_title: title,
            source: 'auto',
            title_source: 'auto',
            updated_at: updatedAt,
        })

        console.log(prefix, 'success', { title })
        return { updated: true }
    } catch (err) {
        console.warn(prefix, 'error', err)
        return { updated: false, skipReason: 'error' }
    } finally {
        running.delete(conversationId)
    }
}
