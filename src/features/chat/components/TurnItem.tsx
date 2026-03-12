// src/components/chat/TurnItem.tsx
import MessageBubble from "./MessageBubble";
import type { UITurn, UIMessage } from "@contracts";
import { RefreshCcw, Pencil, ChevronLeft, ChevronRight, Copy } from "lucide-react";
import IconButton from "@/shared/ui/IconButton";
import { useChatStore } from "@/features/chat/state/chatStore";

function copyText(text: string) {
    const t = text ?? "";
    // This is usually available in Electron/Chrome; if a stricter path is needed later, expose clipboard API through preload
    navigator.clipboard?.writeText(t).catch(() => {
        // Final fallback: do nothing here (or show a toast if preferred)
    });
}

function MsgActions({
                        align = "left",
                        children,
                    }: {
    align?: "left" | "right";
    children: React.ReactNode;
}) {
    return (
        <div
            className={[
                "mt-1",
                "px-1",
                "flex items-center gap-1",
                align === "right" ? "justify-end" : "justify-start",
                // Hidden by default and shown on hover
                "opacity-0 translate-y-1 pointer-events-none",
                "ui-fast transition-[opacity,transform]",
                "group-hover:opacity-100 group-hover:translate-y-0 group-hover:pointer-events-auto",
            ].join(" ")}
        >
            {children}
        </div>
    );
}

export default function TurnItem({
                                     turn,
                                     onRegen,
                                     onRewrite,
                                 }: {
    turn: UITurn;
    onRegen: (turnId: string) => void;
    onRewrite: (turnId: string, userMessage: UIMessage) => void;
}) {
    const setIndex = useChatStore((s) => s.setCurrentAssistantIndex);
    const busyByConversation = useChatStore((s) => s.busyByConversation);

    const total = Array.isArray(turn.assistants) ? turn.assistants.length : 0;

    const safeIdxBase = turn.currentAssistantIndex ?? 0;
    const curIdx = total > 0 ? Math.min(Math.max(0, safeIdxBase), total - 1) : 0;

    const curAssistant = total > 0 ? turn.assistants[curIdx] : undefined;

    const streaming =
        !!curAssistant && busyByConversation[turn.conversation_id]?.replyId === curAssistant.id;

    const streamingSegments = useChatStore((s) =>
        curAssistant?.id ? s.streamingSegmentsById[curAssistant.id] : undefined
    );

    const goPrev = () => {
        if (total === 0) return;
        const next = Math.max(0, curIdx - 1);
        if (next !== curIdx) setIndex(turn.id, next);
    };
    const goNext = () => {
        if (total === 0) return;
        const next = Math.min(total - 1, curIdx + 1);
        if (next !== curIdx) setIndex(turn.id, next);
    };

    const userText = (turn.user?.content ?? "") as string;
    const asstText = (curAssistant?.content ?? "") as string;

    return (
        <li className="space-y-4">
            {/* ---------------- User block ---------------- */}
            <div className="group rounded-2xl px-1 py-1">
                <MessageBubble {...turn.user} />

                <MsgActions align="right">
                    <IconButton
                        aria-label="Copy user message"
                        onClick={() => copyText(userText)}
                        className="text-tx/70 cursor-pointer"
                        title="Copy"
                    >
                        <Copy className="stroke-current" />
                    </IconButton>

                    <IconButton
                        aria-label="编辑并重算"
                        onClick={() => onRewrite(turn.id, turn.user)}
                        disabled={streaming}
                        className="text-tx/70 cursor-pointer"
                        title="Edit"
                    >
                        <Pencil className="stroke-current" />
                    </IconButton>
                </MsgActions>
            </div>

            {/* ---------------- Assistant block ---------------- */}
            {curAssistant && (
                <div className="group rounded-2xl px-1 py-1">
                    <MessageBubble
                        {...(curAssistant as UIMessage)}
                        streaming={streaming}
                        streamingSegments={streamingSegments}
                        turnStatus={turn.status}
                        turnStopReason={turn.stopReason}
                    />

                    <MsgActions align="left">
                        <IconButton
                            aria-label="Copy assistant message"
                            onClick={() => copyText(asstText)}
                            title="Copy"
                            className="text-tx/70 cursor-pointer"
                            disabled={streaming && !asstText}
                        >
                            <Copy className="stroke-current" />
                        </IconButton>

                        <IconButton
                            aria-label="重新生成"
                            onClick={() => onRegen(turn.id)}
                            disabled={streaming}
                            className="text-tx/70 cursor-pointer"
                            title="Regenerate"
                        >
                            <RefreshCcw className="stroke-current" />
                        </IconButton>

                        {/* Version pagination (shown only when multiple versions exist) */}
                        {total > 1 && (
                            <div className="ml-2 flex items-center gap-1 text-[12px] opacity-80">
                                <IconButton
                                    aria-label="上一个版本"
                                    className="text-tx/70 cursor-pointer"
                                    onClick={goPrev}
                                    disabled={curIdx <= 0}
                                    title="Prev"
                                >
                                    <ChevronLeft className="stroke-current" />
                                </IconButton>

                                <span className="px-1 tabular-nums">
                  {curIdx + 1}/{total}
                </span>

                                <IconButton
                                    aria-label="下一个版本"
                                    className="text-tx/70 cursor-pointer"
                                    onClick={goNext}
                                    disabled={curIdx >= total - 1}
                                    title="Next"
                                >
                                    <ChevronRight className="stroke-current" />
                                </IconButton>
                            </div>
                        )}
                    </MsgActions>
                </div>
            )}
        </li>
    );
}
