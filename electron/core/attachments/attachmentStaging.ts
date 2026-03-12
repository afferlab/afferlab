import fs from 'node:fs'
import path from 'node:path'
import crypto from 'node:crypto'
import { app } from 'electron'

export function writeAttachmentStaging(args: {
    filename?: string
    ext?: string
    bytes: Uint8Array
}): { assetId: string; storageKey: string; bytesLength: number } {
    const assetId = `stage_${crypto.randomUUID()}`
    const dir = path.join(app.getPath('userData'), 'attachment-staging')
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true })
    const rawExt = (args.ext ?? path.extname(args.filename ?? '')).replace(/^\./, '')
    const safeExt = rawExt.trim().toLowerCase()
    const fileName = safeExt ? `${assetId}.${safeExt}` : assetId
    const storageKey = path.join(dir, fileName)
    fs.writeFileSync(storageKey, Buffer.from(args.bytes))
    return {
        assetId,
        storageKey,
        bytesLength: args.bytes.byteLength,
    }
}

export function readAttachmentStaging(storageKey: string): Uint8Array {
    const bytes = fs.readFileSync(storageKey)
    return new Uint8Array(bytes)
}

export function resolveAttachmentStagingStorageKey(assetId: string): string | null {
    if (!assetId || !assetId.trim()) return null
    const dir = path.join(app.getPath('userData'), 'attachment-staging')
    if (!fs.existsSync(dir)) return null
    const normalized = assetId.trim()
    const direct = path.join(dir, normalized)
    if (fs.existsSync(direct)) return direct
    const entries = fs.readdirSync(dir)
    const hit = entries.find((entry) => entry === normalized || entry.startsWith(`${normalized}.`))
    if (!hit) return null
    const resolved = path.join(dir, hit)
    return fs.existsSync(resolved) ? resolved : null
}

// Stable alias for callers that previously used a shorter resolver name.
export const resolveStagingStorageKey = resolveAttachmentStagingStorageKey
