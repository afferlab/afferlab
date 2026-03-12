export type Segment =
    | { type: "markdown"; text: string }
    | { type: "code"; lang: string; code: string; closed: boolean }

export type SegmentWithRange = Segment & { start: number; end: number }

export function parseSegments(content: string): SegmentWithRange[] {
    const segments: SegmentWithRange[] = []
    let cursor = 0

    while (cursor < content.length) {
        const fenceStart = content.indexOf("```", cursor)
        if (fenceStart === -1) {
            if (cursor < content.length) {
                segments.push({
                    type: "markdown",
                    text: content.slice(cursor),
                    start: cursor,
                    end: content.length,
                })
            }
            break
        }

        if (fenceStart > cursor) {
            segments.push({
                type: "markdown",
                text: content.slice(cursor, fenceStart),
                start: cursor,
                end: fenceStart,
            })
        }

        const infoStart = fenceStart + 3
        const lineEnd = content.indexOf("\n", infoStart)
        const lang = lineEnd === -1
            ? content.slice(infoStart).trim()
            : content.slice(infoStart, lineEnd).trim()
        const codeStart = lineEnd === -1 ? content.length : lineEnd + 1

        const fenceEnd = content.indexOf("```", codeStart)
        if (fenceEnd === -1) {
            let code = content.slice(codeStart)
            if (code.endsWith("\n")) code = code.slice(0, -1)
            segments.push({
                type: "code",
                lang,
                code,
                closed: false,
                start: codeStart,
                end: content.length,
            })
            break
        }

        let code = content.slice(codeStart, fenceEnd)
        if (code.endsWith("\n")) code = code.slice(0, -1)
        segments.push({
            type: "code",
            lang,
            code,
            closed: true,
            start: codeStart,
            end: fenceEnd,
        })
        cursor = fenceEnd + 3
    }

    return segments
}
