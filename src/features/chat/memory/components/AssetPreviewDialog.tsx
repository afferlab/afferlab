import { useEffect, useMemo, useState } from "react"
import { File, Loader2 } from "lucide-react"

import { Button } from "@/shared/ui/button"
import {
    Dialog,
    DialogContent,
    DialogDescription,
    DialogHeader,
    DialogTitle,
} from "@/shared/ui/dialog"
import type { MemoryAssetDetail } from "@contracts"
import type { AssetView } from "../utils/assetView"
import { isInlinePreviewKind, needsTextPreview } from "../utils/assetView"

type AssetPreviewDialogProps = {
    open: boolean
    asset: AssetView | null
    onOpenChange: (open: boolean) => void
    readAsset: (assetId: string, maxChars?: number) => Promise<MemoryAssetDetail | null>
    onOpenAsset: (assetId: string) => Promise<void>
    onRevealAsset: (assetId: string) => Promise<void>
}

function parseError(error: unknown): string {
    if (error instanceof Error) return error.message
    return String(error)
}

export default function AssetPreviewDialog({
    open,
    asset,
    onOpenChange,
    readAsset,
    onOpenAsset,
    onRevealAsset,
}: AssetPreviewDialogProps) {
    const [loadingText, setLoadingText] = useState(false)
    const [textContent, setTextContent] = useState<string | null>(null)
    const [textError, setTextError] = useState<string | null>(null)
    const previewKind = asset?.kind ?? "binary"
    const fileUrl = asset?.fileUrl ?? null

    useEffect(() => {
        if (!open || !asset) return
        if (!needsTextPreview(asset.kind)) {
            setTextContent(null)
            setTextError(null)
            setLoadingText(false)
            return
        }
        let active = true
        setLoadingText(true)
        setTextError(null)
        setTextContent(null)
        void (async () => {
            try {
                const detail = await readAsset(asset.asset.id, 30_000)
                if (!active) return
                setTextContent(detail?.text ?? null)
            } catch (error) {
                if (!active) return
                setTextError(parseError(error))
            } finally {
                if (active) setLoadingText(false)
            }
        })()
        return () => {
            active = false
        }
    }, [asset, open, readAsset])

    const description = useMemo(() => {
        if (!asset) return ""
        if (isInlinePreviewKind(asset.kind)) return "Preview"
        return "Binary asset"
    }, [asset])

    const hasFileActions = Boolean(asset?.asset.uri)

    return (
        <Dialog open={open} onOpenChange={onOpenChange}>
            <DialogContent className="max-w-4xl border-border bg-bg-topbar text-tx p-0 overflow-hidden">
                <DialogHeader className="border-b border-border/60 px-4 py-3">
                    <DialogTitle className="truncate text-base">{asset?.name ?? "Asset"}</DialogTitle>
                    <DialogDescription className="text-tx/60">{description}</DialogDescription>
                </DialogHeader>

                <div className="px-4 py-3">
                    {asset && previewKind === "image" && fileUrl ? (
                        <div className="max-h-[70vh] overflow-auto rounded-md border border-border/60 bg-black/15 p-2">
                            <img src={fileUrl} alt={asset.name} className="mx-auto h-auto max-h-[66vh] w-auto" />
                        </div>
                    ) : null}

                    {asset && previewKind === "video" && fileUrl ? (
                        <video
                            className="max-h-[70vh] w-full rounded-md border border-border/60 bg-black/15"
                            controls
                            src={fileUrl}
                        />
                    ) : null}

                    {asset && previewKind === "audio" && fileUrl ? (
                        <div className="rounded-md border border-border/60 bg-bg-chatarea/40 p-4">
                            <audio className="w-full" controls src={fileUrl} />
                        </div>
                    ) : null}

                    {asset && previewKind === "pdf" && fileUrl ? (
                        <iframe
                            title={asset.name}
                            src={fileUrl}
                            className="h-[70vh] w-full rounded-md border border-border/60 bg-white"
                        />
                    ) : null}

                    {asset && needsTextPreview(previewKind) ? (
                        <div className="rounded-md border border-border/60 bg-bg-chatarea/30">
                            {loadingText ? (
                                <div className="flex items-center gap-2 px-3 py-4 text-xs text-tx/70">
                                    <Loader2 className="h-4 w-4 animate-spin" />
                                    Loading preview...
                                </div>
                            ) : textError ? (
                                <div className="px-3 py-4 text-xs text-[var(--error-fg)]">{textError}</div>
                            ) : textContent ? (
                                <pre className="max-h-[70vh] overflow-auto whitespace-pre-wrap break-words [overflow-wrap:anywhere] p-3 text-xs leading-5 text-tx/85">
                                    {textContent}
                                </pre>
                            ) : (
                                <div className="px-3 py-4 text-xs text-tx/60">No preview available.</div>
                            )}
                        </div>
                    ) : null}

                    {asset && !isInlinePreviewKind(previewKind) ? (
                        <div className="rounded-md border border-border/60 bg-bg-chatarea/30 px-3 py-4 text-sm text-tx/70">
                            <div className="flex items-center gap-2">
                                <File className="h-4 w-4 shrink-0" />
                                <span className="truncate">{asset.name}</span>
                            </div>
                            <div className="mt-2 text-xs text-tx/55">
                                This file type cannot be previewed inline.
                            </div>
                        </div>
                    ) : null}
                </div>

                <div className="flex items-center justify-end gap-2 border-t border-border/60 px-4 py-3">
                    {asset && hasFileActions ? (
                        <>
                            <Button
                                type="button"
                                variant="outline"
                                size="sm"
                                className="cursor-pointer"
                                onClick={async () => {
                                    await onOpenAsset(asset.asset.id)
                                }}
                            >
                                Open
                            </Button>
                            <Button
                                type="button"
                                variant="outline"
                                size="sm"
                                className="cursor-pointer"
                                onClick={async () => {
                                    await onRevealAsset(asset.asset.id)
                                }}
                            >
                                Reveal in Finder
                            </Button>
                        </>
                    ) : null}
                </div>
            </DialogContent>
        </Dialog>
    )
}
