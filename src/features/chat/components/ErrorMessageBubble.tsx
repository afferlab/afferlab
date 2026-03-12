import { useMemo, useState } from "react"
import { AlertTriangle, ChevronRight } from "lucide-react"
import type { TurnStatus, UIMessage } from "@contracts"
import { normalizeErrorDetails, normalizeErrorSummary } from "../utils/errorMessageUtils"

interface ErrorMessageBubbleProps {
    message: UIMessage
    turnStatus?: TurnStatus
    turnStopReason?: string | null
}

export default function ErrorMessageBubble({
    message,
    turnStatus,
    turnStopReason,
}: ErrorMessageBubbleProps) {
    const [expanded, setExpanded] = useState(false)
    const summary = useMemo(
        () => normalizeErrorSummary({ message, turnStatus, turnStopReason }),
        [message, turnStatus, turnStopReason]
    )
    const details = useMemo(
        () => normalizeErrorDetails({ message, turnStatus, turnStopReason }),
        [message, turnStatus, turnStopReason]
    )

    return (
        <div className="w-full rounded-2xl border border-[var(--warning-fg)]/30 bg-[var(--warning-bg)] text-[var(--warning-fg)]">
            <div className="flex items-start gap-2 px-3 py-2">
                <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
                <div className="min-w-0 flex-1 text-[13px] leading-5 [overflow-wrap:anywhere]">
                    {summary}
                </div>
                {details ? (
                    <button
                        type="button"
                        aria-label={expanded ? "Hide error details" : "Show error details"}
                        className="ui-fast ui-press mt-0.5 h-5 w-5 shrink-0 text-[var(--warning-fg)]/85 transition-colors hover:text-[var(--warning-fg)] cursor-pointer"
                        onClick={() => setExpanded((prev) => !prev)}
                    >
                        <ChevronRight
                            className={expanded
                                ? "ui-panel h-4 w-4 rotate-90 transition-transform"
                                : "ui-panel h-4 w-4 transition-transform"}
                        />
                    </button>
                ) : (
                    <span className="h-5 w-5 shrink-0" />
                )}
            </div>

            {details ? (
                <div
                    className={expanded
                        ? "ui-panel grid grid-rows-[1fr] opacity-100 transition-[grid-template-rows,opacity]"
                        : "ui-panel grid grid-rows-[0fr] opacity-0 transition-[grid-template-rows,opacity]"}
                >
                    <div className="overflow-hidden">
                        <div
                            className={expanded
                                ? "ui-panel border-t border-[var(--warning-fg)]/20 px-3 py-2 transition-[padding]"
                                : "ui-panel border-t border-[var(--warning-fg)]/20 px-3 py-0 transition-[padding]"}
                        >
                            <pre className="m-0 whitespace-pre-wrap break-words [overflow-wrap:anywhere] text-[11px] leading-5 text-[var(--warning-fg)]/90">
                                {details}
                            </pre>
                        </div>
                    </div>
                </div>
            ) : null}
        </div>
    )
}
