import { useNavigate } from "react-router-dom"
import { useChatStore } from "@/features/chat/state/chatStore"
import { cn } from "@/shared/lib/utils"
import { useRecentConversations } from "@/features/home/hooks/useRecentConversations"

const fadeMaskStyle = {
    WebkitMaskImage: "linear-gradient(to right, black 0%, black 84%, transparent 100%)",
    maskImage: "linear-gradient(to right, black 0%, black 84%, transparent 100%)",
}

export default function RecentConversations() {
    const navigate = useNavigate()
    const setSelectedConversationId = useChatStore((state) => state.setSelectedConversationId)
    const { items, loading } = useRecentConversations()

    if (!loading && items.length === 0) {
        return (
            <section className="select-none w-full max-w-2xl pt-4 text-left">
                <div className="border-b border-border/60 px-1 pb-1 font-semibold text-tx/85">
                    Recent Conversations
                </div>
                <div className="rounded-2xl py-5 text-sm w-full text-center text-tx/45">
                    No recent conversations yet.
                </div>
            </section>
        )
    }

    return (
        <section className="select-none w-full max-w-2xl px-1 pt-4 text-left">
            <div className="border-b border-border/60 pb-1 text-md font-semibold text-tx/85">
                Recent Conversations
            </div>
            <div className="divide-y divide-border/60">
                {loading
                    ? Array.from({ length: 5 }, (_, index) => (
                        <div
                            key={`recent-loading-${index}`}
                            className="py-2"
                        >
                            <div className="h-4 w-40 animate-pulse rounded bg-white/10" />
                            <div className="mt-2 h-3.5 w-full animate-pulse rounded bg-white/[0.06]" />
                        </div>
                    ))
                    : items.map((item) => (
                        <button
                            key={item.id}
                            type="button"
                            className={cn(
                                "group w-full py-2 text-left",
                                "cursor-pointer transition-[background-color,color] duration-200 ui-fast",
                                "bg-transparent "
                            )}
                            onClick={() => {
                                setSelectedConversationId(item.id)
                                navigate("/")
                            }}
                        >
                            <div className="truncate text-sm font-semibold text-tx/55 transition-colors duration-200 group-hover:text-tx/85">
                                {item.title}
                            </div>
                            <div
                                className="mt-1 overflow-hidden whitespace-nowrap text-xs text-tx/55 transition-colors duration-200 group-hover:text-tx/80"
                                style={fadeMaskStyle}
                            >
                                {item.latestUserMessage || "No user message yet."}
                            </div>
                        </button>
                    ))}
            </div>
        </section>
    )
}
