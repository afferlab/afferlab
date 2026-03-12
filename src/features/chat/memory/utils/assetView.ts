import type { MemoryAssetRecord } from "@contracts"

export type AssetKind =
    | "image"
    | "video"
    | "audio"
    | "pdf"
    | "text"
    | "code"
    | "binary"

export type AssetView = {
    asset: MemoryAssetRecord
    name: string
    kind: AssetKind
    fileUrl: string | null
}

const CODE_EXTENSIONS = new Set([
    "c",
    "cc",
    "cpp",
    "cs",
    "css",
    "go",
    "h",
    "hpp",
    "html",
    "java",
    "js",
    "json",
    "jsx",
    "kt",
    "lua",
    "m",
    "mdx",
    "php",
    "py",
    "rb",
    "rs",
    "sh",
    "sql",
    "swift",
    "toml",
    "ts",
    "tsx",
    "xml",
    "yaml",
    "yml",
])

function safeJson<T>(raw: string | null | undefined): T | null {
    if (!raw) return null
    try {
        return JSON.parse(raw) as T
    } catch {
        return null
    }
}

function getExt(name: string): string {
    const idx = name.lastIndexOf(".")
    if (idx <= -1) return ""
    return name.slice(idx + 1).toLowerCase()
}

export function getAssetName(asset: MemoryAssetRecord): string {
    const meta = safeJson<{ filename?: unknown }>(asset.meta)
    if (typeof meta?.filename === "string" && meta.filename.trim().length > 0) {
        return meta.filename.trim()
    }
    const uri = asset.uri ?? ""
    if (uri) {
        const tail = uri.split(/[\\/]/).pop()
        if (tail) return tail
    }
    return asset.id
}

export function detectAssetKind(asset: MemoryAssetRecord, name: string): AssetKind {
    const mime = (asset.mimeType ?? "").toLowerCase()
    const ext = getExt(name)

    if (mime.startsWith("image/")) return "image"
    if (mime.startsWith("video/")) return "video"
    if (mime.startsWith("audio/")) return "audio"
    if (mime.includes("pdf")) return "pdf"
    if (mime.startsWith("text/")) {
        return CODE_EXTENSIONS.has(ext) ? "code" : "text"
    }
    if (mime.includes("markdown")) return "text"
    if (mime.includes("json") || mime.includes("javascript") || mime.includes("typescript")) return "code"

    if (["png", "jpg", "jpeg", "gif", "webp", "svg", "bmp", "heic"].includes(ext)) return "image"
    if (["mp4", "mov", "mkv", "webm", "avi", "m4v"].includes(ext)) return "video"
    if (["mp3", "wav", "m4a", "aac", "ogg", "flac"].includes(ext)) return "audio"
    if (ext === "pdf") return "pdf"
    if (["txt", "md", "markdown", "rtf"].includes(ext)) return "text"
    if (CODE_EXTENSIONS.has(ext)) return "code"

    return "binary"
}

export function toFileUrl(uri: string | null | undefined): string | null {
    const raw = typeof uri === "string" ? uri.trim() : ""
    if (!raw) return null
    if (raw.startsWith("file://")) return raw

    const normalized = raw.replace(/\\/g, "/")
    if (/^[a-zA-Z]:\//.test(normalized)) {
        return encodeURI(`file:///${normalized}`)
    }
    if (normalized.startsWith("/")) {
        return encodeURI(`file://${normalized}`)
    }
    return encodeURI(`file:///${normalized}`)
}

export function buildAssetView(asset: MemoryAssetRecord): AssetView {
    const name = getAssetName(asset)
    return {
        asset,
        name,
        kind: detectAssetKind(asset, name),
        fileUrl: toFileUrl(asset.uri),
    }
}

export function isInlinePreviewKind(kind: AssetKind): boolean {
    return kind === "image"
        || kind === "video"
        || kind === "audio"
        || kind === "pdf"
        || kind === "text"
        || kind === "code"
}

export function needsTextPreview(kind: AssetKind): boolean {
    return kind === "text" || kind === "code"
}
