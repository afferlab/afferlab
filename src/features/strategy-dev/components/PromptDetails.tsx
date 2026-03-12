import type { Message } from "@contracts"

function messageText(message: Message): string {
    if (typeof message.content === "string") return message.content
    if (message.content == null) return ""
    try {
        return JSON.stringify(message.content)
    } catch {
        return String(message.content)
    }
}

function estimateTokens(text: string): number {
    let latin = 0
    let cjk = 0
    for (const ch of text) {
        const code = ch.codePointAt(0) ?? 0
        if (
            (code >= 0x4e00 && code <= 0x9fff)
            || (code >= 0x3400 && code <= 0x4dbf)
            || (code >= 0xf900 && code <= 0xfaff)
        ) {
            cjk += 1
        } else {
            latin += 1
        }
    }
    const estimate = Math.ceil(latin * 0.75 + cjk * 1.6)
    return Math.ceil(estimate * 1.1)
}

function estimateMessageTokens(message: Message): number {
    const content = typeof message.content === "string"
        ? message.content
        : message.content
            ? JSON.stringify(message.content)
            : ""
    const toolCalls = (message as { tool_calls?: unknown }).tool_calls
    const extra = toolCalls ? JSON.stringify(toolCalls) : ""
    return estimateTokens(`${content}${extra}`)
}

type PromptDetailsProps = {
    messages: Message[]
}

export default function PromptDetails({ messages }: PromptDetailsProps) {
    return (
        <div className="min-w-0 max-w-full text-[11px] text-tx/70">
            {messages.length === 0 ? (
                <div>no messages</div>
            ) : (
                messages.map((message, index) => {
                    const text = messageText(message)
                    const role = message.role ?? "unknown"
                    const tokens = estimateMessageTokens(message)
                    const toolCalls = (message as { tool_calls?: unknown }).tool_calls
                    return (
                        <details
                            key={`prompt-msg-${index}`}
                            className={index > 0 ? "border-t border-border/40" : undefined}
                        >
                            <summary className="cursor-pointer py-1 break-words [overflow-wrap:anywhere]">
                                #{index + 1} role:{role} tok:~{tokens}
                            </summary>
                            <div className="pl-3 py-1 space-y-1">
                                <pre className="whitespace-pre-wrap break-words [overflow-wrap:anywhere]">{text || "<empty>"}</pre>
                                {toolCalls ? (
                                    <pre className="whitespace-pre-wrap break-words [overflow-wrap:anywhere]">{JSON.stringify(toolCalls, null, 2)}</pre>
                                ) : null}
                            </div>
                        </details>
                    )
                })
            )}
        </div>
    )
}
