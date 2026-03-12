import type { ReactElement } from "react"
import type { Segment } from "@/features/chat/utils/segmentParser"
import MarkdownRenderer, { type FadeRange } from "@/features/chat/renderers/MarkdownRenderer"
import CodeBlock from "@/features/chat/renderers/CodeBlock"

export type { FadeRange }

export const segmentRenderers: Record<
    Segment["type"],
    (segment: Segment, fadeRanges?: FadeRange[]) => ReactElement
> = {
    markdown: (segment, fadeRanges) => (
        <MarkdownRenderer
            content={(segment as Segment & { text: string }).text}
            fadeRanges={fadeRanges}
        />
    ),
    code: (segment) => {
        const codeSegment = segment as Segment & { lang: string; code: string; closed: boolean }
        return (
            <CodeBlock
                code={codeSegment.code}
                language={codeSegment.lang}
                closed={codeSegment.closed}
            />
        )
    },
}
