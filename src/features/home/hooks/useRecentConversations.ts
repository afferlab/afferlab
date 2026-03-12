import { useEffect, useMemo, useState } from "react"
import type { Conversation } from "@contracts"
import type { ChatItemRow } from "@contracts/chat"
import { useChatStore } from "@/features/chat/state/chatStore"
import { chatService } from "@/shared/services/ipc/chatService"

export interface RecentConversationPreview {
    id: string
    title: string
    latestUserMessage: string
}

function byMostRecent(a: Conversation, b: Conversation): number {
    return (b.updated_at ?? 0) - (a.updated_at ?? 0)
}

function getLatestUserMessage(rows: ChatItemRow[]): string {
    for (let index = rows.length - 1; index >= 0; index -= 1) {
        const text = rows[index]?.user_text?.trim()
        if (text) {
            return text
        }
    }

    return ""
}

export function useRecentConversations(limit: number = 5): {
    items: RecentConversationPreview[]
    loading: boolean
} {
    const conversations = useChatStore((state) => state.conversations)
    const seeds = useMemo(
        () =>
            [...conversations]
                .filter((conversation) => !conversation.archived)
                .sort(byMostRecent)
                .slice(0, limit),
        [conversations, limit]
    )

    const [items, setItems] = useState<RecentConversationPreview[]>([])
    const [loading, setLoading] = useState(false)

    useEffect(() => {
        let cancelled = false

        if (seeds.length === 0) {
            setItems([])
            setLoading(false)
            return () => {
                cancelled = true
            }
        }

        setLoading(true)

        Promise.all(
            seeds.map(async (conversation) => {
                const rows = await chatService.getChatItems(conversation.id).catch(() => [] as ChatItemRow[])

                return {
                    id: conversation.id,
                    title: conversation.title?.trim() || "Untitled",
                    latestUserMessage: getLatestUserMessage(rows),
                }
            })
        )
            .then((nextItems) => {
                if (cancelled) return
                setItems(nextItems)
                setLoading(false)
            })
            .catch(() => {
                if (cancelled) return
                setItems(
                    seeds.map((conversation) => ({
                        id: conversation.id,
                        title: conversation.title?.trim() || "Untitled",
                        latestUserMessage: "",
                    }))
                )
                setLoading(false)
            })

        return () => {
            cancelled = true
        }
    }, [seeds])

    return { items, loading }
}
