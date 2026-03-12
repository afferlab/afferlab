import crypto from 'node:crypto'
import path from 'node:path'

export type RuntimeLogLevel = 'debug' | 'info' | 'warn' | 'error'

type RuntimeLogEntry = {
    ts: number
    level: RuntimeLogLevel
    tag: string
    data?: Record<string, unknown>
}

type RuntimeLogOptions = {
    debugFlag?: string
    stream?: 'stdout' | 'stderr'
}

type ExportLogArgs = {
    conversationId?: string
    traceId?: string
    limit?: number
}

const RING_LIMIT = 1000
const ringBuffer: RuntimeLogEntry[] = []
const sampleCounter = new Map<string, number>()
const lastStateByKey = new Map<string, string>()

const REDACTED = '[REDACTED]'
const DEV_ONLY = process.env.NODE_ENV !== 'production'

function stableHash(value: string): string {
    return crypto.createHash('sha256').update(value).digest('hex').slice(0, 8)
}

function toPlainObject(value: unknown): Record<string, unknown> {
    if (!value || typeof value !== 'object') return {}
    return value as Record<string, unknown>
}

function sanitizeStorageKey(value: string): string {
    const trimmed = value.trim()
    if (!trimmed) return trimmed
    if (trimmed.startsWith('sha256_')) {
        return trimmed.length > 20 ? `${trimmed.slice(0, 20)}…` : trimmed
    }
    const parts = trimmed.split(/[\\/]/).filter(Boolean)
    const tail = parts[parts.length - 1] ?? trimmed
    return tail.length > 64 ? `${tail.slice(0, 32)}…${tail.slice(-8)}` : tail
}

function sanitizePath(value: string): string {
    const trimmed = value.trim()
    if (!trimmed) return trimmed
    if (!path.isAbsolute(trimmed)) return trimmed
    const base = path.basename(trimmed)
    return `${base}#${stableHash(trimmed)}`
}

function shouldRedactKey(key: string): boolean {
    return /api[_-]?key|authorization|secret|token|password/i.test(key)
}

function truncateBodyPreview(key: string, value: string): string {
    if (!/bodypreview|responsebody|rawbody/i.test(key)) return value
    if (value.length <= 200) return value
    return `${value.slice(0, 200)}…`
}

function redactValue(key: string, value: unknown): unknown {
    if (value == null) return value
    if (shouldRedactKey(key)) return REDACTED
    if (typeof value === 'string') {
        if (/storagekey/i.test(key)) return sanitizeStorageKey(value)
        if (/filepath|path/i.test(key)) return sanitizePath(value)
        return truncateBodyPreview(key, value)
    }
    if (Array.isArray(value)) return value.map((item) => redactValue(key, item))
    if (typeof value === 'object') {
        const out: Record<string, unknown> = {}
        for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
            out[k] = redactValue(k, v)
        }
        return out
    }
    return value
}

function redactData(data?: Record<string, unknown>): Record<string, unknown> | undefined {
    if (!data) return undefined
    return redactValue('', data) as Record<string, unknown>
}

function toLine(tag: string, data?: Record<string, unknown>): string {
    if (!data || Object.keys(data).length === 0) return tag
    return `${tag} ${JSON.stringify(data)}`
}

function isDebugEnabled(flag?: string): boolean {
    if (!flag) return false
    return process.env[flag] === '1'
}

function shouldPrint(level: RuntimeLogLevel, opts?: RuntimeLogOptions): boolean {
    if (level !== 'debug') return true
    return isDebugEnabled(opts?.debugFlag)
}

function pushToRing(entry: RuntimeLogEntry): void {
    if (!DEV_ONLY) return
    ringBuffer.push(entry)
    if (ringBuffer.length > RING_LIMIT) {
        ringBuffer.splice(0, ringBuffer.length - RING_LIMIT)
    }
}

export function log(level: RuntimeLogLevel, tag: string, data?: Record<string, unknown>, opts?: RuntimeLogOptions): void {
    const safeData = redactData(data)
    const entry: RuntimeLogEntry = {
        ts: Date.now(),
        level,
        tag,
        ...(safeData ? { data: safeData } : {}),
    }
    pushToRing(entry)
    if (!shouldPrint(level, opts)) return
    const line = `${toLine(tag, safeData)}\n`
    const stream = opts?.stream ?? (level === 'warn' || level === 'error' ? 'stderr' : 'stdout')
    if (stream === 'stderr') {
        process.stderr.write(line)
        return
    }
    process.stdout.write(line)
}

export function logEveryN(key: string, n: number): boolean {
    if (!Number.isFinite(n) || n <= 1) return true
    const next = (sampleCounter.get(key) ?? 0) + 1
    sampleCounter.set(key, next)
    return next % Math.floor(n) === 0
}

export function hasLogStateChanged(key: string, data?: Record<string, unknown>): boolean {
    const safeData = redactData(data)
    const serialized = JSON.stringify(safeData ?? {})
    const prev = lastStateByKey.get(key)
    if (prev === serialized) return false
    lastStateByKey.set(key, serialized)
    return true
}

function matchesFilter(entry: RuntimeLogEntry, args: ExportLogArgs): boolean {
    const data = toPlainObject(entry.data)
    if (args.traceId) {
        const traceId = typeof data.traceId === 'string' ? data.traceId : undefined
        if (traceId !== args.traceId) return false
    }
    if (args.conversationId) {
        const candidate = typeof data.conversationId === 'string'
            ? data.conversationId
            : typeof data.conversation_id === 'string'
                ? data.conversation_id
                : undefined
        if (candidate !== args.conversationId) return false
    }
    return true
}

export function exportRuntimeLogs(args?: ExportLogArgs): string {
    if (!DEV_ONLY) return ''
    const limit = Number.isFinite(args?.limit) ? Math.max(1, Math.floor(args?.limit as number)) : 300
    const filtered = ringBuffer.filter((entry) => matchesFilter(entry, args ?? {}))
    const tail = filtered.slice(-limit)
    return tail.map((entry) => JSON.stringify(entry)).join('\n')
}

export function debugFlagEnabled(flag: string): boolean {
    return isDebugEnabled(flag)
}
