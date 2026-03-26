import type { UIMessage, StreamingSegment, TurnStatus } from "@contracts";
import clsx from "clsx";
import StreamingMessageRenderer from "@/features/chat/components/StreamingMessageRenderer";
import ErrorMessageBubble from "@/features/chat/components/ErrorMessageBubble";
import AttachmentList, { type AttachmentCardItem } from "@/features/chat/attachments/components/AttachmentList";

export interface MessageBubbleProps extends UIMessage {
    streaming?: boolean;
    streamingSegments?: StreamingSegment[];
    className?: string;
    turnStatus?: TurnStatus;
    turnStopReason?: string | null;
}

function isAttachmentPart(part: NonNullable<UIMessage["contentParts"]>[number]): part is Extract<NonNullable<UIMessage["contentParts"]>[number], { type: "file" | "image" }> {
    return part.type === "file" || part.type === "image";
}

export default function MessageBubble(props: MessageBubbleProps) {
    const isUser = props.role === "user";
    const attachmentParts = (props.contentParts ?? []).filter(isAttachmentPart);
    const messageAttachments: AttachmentCardItem[] = attachmentParts.map((part, index) => ({
        id: (part.assetId && part.assetId.trim().length > 0) ? part.assetId : `message-attachment-${index}`,
        name: part.name || part.assetId || `attachment-${index + 1}`,
        mimeType: part.mimeType || "application/octet-stream",
        size: Number.isFinite(part.size) ? part.size : 0,
        kind: part.type === "image" ? "image" : "document",
        status: part.status,
        errorMessage: part.readDiagnostics?.message,
    }));

    // User bubbles have a maximum width of 60%
    const maxWidth = isUser ? "max-w-[60%]" : "max-w-full";
    const align = isUser ? "justify-end" : "justify-start";

    const bubbleBase = isUser
        ? "bg-bg-messagebubble-user text-tx"
        : "bg-bg-messagebubble-assistant text-tx";

    // Placeholder state: currently uses progress, while remaining compatible with a future loading state
    const isPlaceholder = props.type === "progress" || props.type === "loading";
    const isError = !isUser && (props.type === "error" || props.turnStatus === "error");

    // Streaming ring: show only for assistant + streaming + text
    const bubbleShell = clsx(
        "py-1.5 rounded-2xl",
        maxWidth,
        bubbleBase,
        props.className
    );

    // Placeholder UI: render a pulsing dot here for both progress and loading
    if (isPlaceholder) {
        return (
            <div className={clsx("flex", align, "my-2")}>
                <div className={bubbleShell}>
          <span
              className={clsx(
                  "inline-block rounded-full",
                  "w-3.5 h-3.5",
                  "bg-tx/90",
                  "animate-breathe"
              )}
              aria-label="Loading"
          />
                </div>
            </div>
        );
    }

    if (isError) {
        return (
            <div className={clsx("flex", align, "my-2")}>
                <div className={clsx(maxWidth, "w-full", props.className)}>
                    <ErrorMessageBubble
                        message={props}
                        turnStatus={props.turnStatus}
                        turnStopReason={props.turnStopReason}
                    />
                </div>
            </div>
        );
    }

    const content = props.content ?? "";

    if (isUser && messageAttachments.length > 0) {
        return (
            <div className="my-2 flex flex-col items-end gap-0">
                {messageAttachments.map((attachment) => (
                    <AttachmentList
                        key={attachment.id}
                        attachments={[attachment]}
                        variant="message"
                        className="mb-0"
                        listClassName="flex flex-col gap-0"
                        cardClassName="border-0 bg-bg-messagebubble-user"
                    />
                ))}
                {content ? (
                    <div className={bubbleShell}>
                        <div className="px-3">
                            <div className="message-bubble-content text-[14px] !font-[550] leading-6 whitespace-pre-wrap break-words">
                                {content}
                            </div>
                        </div>
                    </div>
                ) : null}
            </div>
        );
    }

    return (
            <div className={clsx("flex", align, "my-2")}>
            <div className={bubbleShell}>
                {isUser ? (
                    <div className="px-3">
                        <div className="message-bubble-content text-[14px] !font-[550] leading-6 whitespace-pre-wrap break-words">
                            {content}
                        </div>
                    </div>
                ) : (
                    <div className="message-bubble-content px-3 min-w-0 max-w-full overflow-x-hidden break-words">
                        <StreamingMessageRenderer
                            content={content}
                            streaming={props.streaming}
                            streamingSegments={props.streamingSegments}
                        />
                    </div>
                )}

            </div>
        </div>
    );
}
