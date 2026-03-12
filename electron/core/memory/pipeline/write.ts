import path from 'node:path'
import fs from 'node:fs'
import crypto from 'node:crypto'
import { app } from 'electron'

export function persistAssetFile(args: {
    filename?: string
    data: Uint8Array
    defaultExt: string
    contentHash?: string
}): string {
    const assetsDir = path.join(app.getPath('userData'), 'memory-assets')
    if (!fs.existsSync(assetsDir)) fs.mkdirSync(assetsDir, { recursive: true })
    const ext = path.extname(args.filename || '') || args.defaultExt
    const hash = (args.contentHash ?? '').trim().toLowerCase()
    const safeHash = hash && /^[a-f0-9]{16,128}$/.test(hash) ? hash : ''
    const storedFilename = safeHash
        ? `sha256_${safeHash}${ext}`
        : `mem_${crypto.randomUUID()}${ext}`
    const filePath = path.join(assetsDir, storedFilename)
    if (safeHash && fs.existsSync(filePath)) {
        return filePath
    }
    fs.writeFileSync(filePath, Buffer.from(args.data))
    return filePath
}
