import { useEffect, useMemo, useRef } from "react"
import type { StreamingSegment } from "@contracts"
import { parseSegments, type SegmentWithRange } from "@/features/chat/utils/segmentParser"
import { segmentRenderers, type FadeRange } from "@/features/chat/segments/segmentRenderers"
import { useUIStore } from "@/features/chat/state/uiStore"

type StreamingMessageRendererProps = {
    content: string
    streaming?: boolean
    streamingSegments?: StreamingSegment[]
}

type SegmentRenderItem = {
    segment: SegmentWithRange
    fadeRanges?: FadeRange[]
}

function buildFadeRanges(
    content: string,
    streamingSegments?: StreamingSegment[]
): FadeRange[] {
    if (!streamingSegments || streamingSegments.length === 0) return []
    const totalSegmentsLen = streamingSegments.reduce((sum, seg) => sum + seg.text.length, 0)
    const baseOffset = Math.max(0, content.length - totalSegmentsLen)
    let cursor = baseOffset
    return streamingSegments.map((seg) => {
        const start = cursor
        const end = cursor + seg.text.length
        cursor = end
        return { id: seg.id, start, end }
    })
}

function buildSegmentItems(
    segments: SegmentWithRange[],
    fadeRanges: FadeRange[]
): SegmentRenderItem[] {
    if (fadeRanges.length === 0) {
        return segments.map((segment) => ({ segment }))
    }

    return segments.map((segment) => {
        if (segment.type !== "markdown") return { segment }
        const ranges = fadeRanges
            .filter((range) => range.end > segment.start && range.start < segment.end)
            .map((range) => ({
                ...range,
                start: Math.max(0, range.start - segment.start),
                end: Math.min(segment.end - segment.start, range.end - segment.start),
            }))
        return { segment, fadeRanges: ranges.length ? ranges : undefined }
    })
}

export default function StreamingMessageRenderer({
    content,
    streaming = false,
    streamingSegments,
}: StreamingMessageRendererProps) {
    const enableStreamReveal = useUIStore((s) => s.enableStreamReveal)
    const debugLoggedRef = useRef(false)
    const DEBUG_STREAM_REVEAL =
        (import.meta as unknown as { env?: Record<string, string> }).env?.VITE_DEBUG_STREAM_REVEAL === "1" ||
        (window as unknown as { DEBUG_STREAM_REVEAL?: string }).DEBUG_STREAM_REVEAL === "1"
    const segments = useMemo(() => parseSegments(content), [content])
    // Only animate the newest appended ranges to avoid re-animating the full message.
    const fadeRanges = useMemo(
        () =>
            streaming && enableStreamReveal
                ? buildFadeRanges(content, streamingSegments)
                : [],
        [content, streaming, streamingSegments, enableStreamReveal]
    )
    const items = useMemo(
        () => buildSegmentItems(segments, fadeRanges),
        [segments, fadeRanges]
    )

    useEffect(() => {
        if (!DEBUG_STREAM_REVEAL) return
        if (!streaming) {
            debugLoggedRef.current = false
            return
        }
        if (debugLoggedRef.current) return
        if (!streamingSegments || streamingSegments.length === 0) return
        const markdownSegments = segments
            .filter((seg) => seg.type === "markdown")
            .map((seg) => ({ start: seg.start, end: seg.end }))
        console.debug("[stream-reveal][meta]", {
            streamingSegmentsLen: streamingSegments.length,
            fadeRanges,
            markdownSegments,
        })
        debugLoggedRef.current = true
    }, [DEBUG_STREAM_REVEAL, streaming, streamingSegments, segments, fadeRanges])

    return (
        <div className="min-w-0 max-w-full break-words overflow-x-hidden">
            {items.map(({ segment, fadeRanges }, index) => {
                const key = segment.type === "code"
                    ? `${segment.type}-${segment.start}-${(segment as SegmentWithRange & { lang?: string }).lang ?? "plain"}-${index}`
                    : `${segment.type}-${segment.start}-${index}`
                const renderer = segmentRenderers[segment.type]
                return (
                    <div key={key} className="min-w-0 max-w-full break-words">
                        {renderer(segment, fadeRanges)}
                    </div>
                )
            })}
        </div>
    )
}
