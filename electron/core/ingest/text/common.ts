// electron/core/ingest/text/common.ts
import type { Bytes } from '../../../../contracts/index'

/** UTF-8 decoding with fallback behavior. */
export function decodeUtf8(buf: Bytes): string {
    try {
        return new TextDecoder('utf-8', { fatal: false }).decode(buf)
    } catch {
        // Fallback: decode roughly as latin1
        let s = ''
        for (let i = 0; i < buf.length; i++) s += String.fromCharCode(buf[i])
        return s
    }
}

/** Lightweight cleanup: remove BOM, normalize newlines, trim trailing whitespace. */
export function normalizeText(raw: string): string {
    const noBom = raw.replace(/^\uFEFF/, '')
    const normalizedNl = noBom.replace(/\r\n?/g, '\n')
    return normalizedNl.replace(/[ \t]+\n/g, '\n').trimEnd()
}
