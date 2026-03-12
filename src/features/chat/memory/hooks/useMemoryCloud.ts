import { useCallback, useEffect, useMemo, useState } from "react"
import type {
    MemoryAssetDetail,
    MemoryAssetRecord,
    MemoryIngestProgress,
    MemoryIngestResult,
} from "@contracts"
import { memoryCloudService } from "@/shared/services/ipc/memoryCloudService"
import { touchConversationActivity } from "@/features/chat/utils/touchConversationActivity"
import { toast } from "sonner"

const LOG_PREFIX = "[memory-cloud/ui]"

type UseMemoryCloudResult = {
    enabled: boolean
    checked: boolean
    assets: MemoryAssetRecord[]
    assetsLoading: boolean
    ingesting: boolean
    progress: MemoryIngestProgress | null
    refreshAssets: () => Promise<void>
    ingestFiles: (files: File[]) => Promise<void>
    readAsset: (assetId: string, maxChars?: number) => Promise<MemoryAssetDetail | null>
    deleteAsset: (assetId: string) => Promise<void>
    openAsset: (assetId: string) => Promise<void>
    revealAsset: (assetId: string) => Promise<void>
    disabledReason: "no_conversation" | "disabled" | null
}

function log(event: string, data: Record<string, unknown>): void {
    console.log(LOG_PREFIX, event, data)
}

function errorToString(err: unknown): string {
    if (err instanceof Error) return err.stack ?? err.message
    return String(err)
}

export function useMemoryCloud(conversationId: string | null): UseMemoryCloudResult {
    const [enabled, setEnabled] = useState(false)
    const [checked, setChecked] = useState(false)
    const [assetsByConversationId, setAssetsByConversationId] = useState<Record<string, MemoryAssetRecord[]>>({})
    const [assetsLoading, setAssetsLoading] = useState(false)
    const [ingesting, setIngesting] = useState(false)
    const [progress, setProgress] = useState<MemoryIngestProgress | null>(null)

    const disabledReason = useMemo(() => {
        if (!conversationId) return "no_conversation"
        if (!enabled) return "disabled"
        return null
    }, [conversationId, enabled])

    const assets = useMemo(() => {
        if (!conversationId) return []
        return assetsByConversationId[conversationId] ?? []
    }, [assetsByConversationId, conversationId])

    const setAssetsForConversation = useCallback(
        (targetConversationId: string, next: MemoryAssetRecord[]) => {
            setAssetsByConversationId((prev) => ({
                ...prev,
                [targetConversationId]: next,
            }))
        },
        []
    )

    const loadAssets = useCallback(
        async (targetConversationId: string) => {
            setAssetsLoading(true)
            try {
                const result = await memoryCloudService.listAssets(targetConversationId)
                setAssetsForConversation(targetConversationId, result)
                log("listAssets:ok", {
                    conversationId: targetConversationId,
                    count: result.length,
                })
            } catch (err) {
                setAssetsForConversation(targetConversationId, [])
                log("listAssets:error", {
                    conversationId: targetConversationId,
                    error: errorToString(err),
                })
                throw err
            } finally {
                setAssetsLoading(false)
            }
        },
        [setAssetsForConversation]
    )

    const refreshAssets = useCallback(async () => {
        if (!conversationId || !enabled) return
        await loadAssets(conversationId)
    }, [conversationId, enabled, loadAssets])

    useEffect(() => {
        let cancelled = false
        setEnabled(false)
        setChecked(false)
        setProgress(null)

        if (!conversationId) return

        const run = async () => {
            try {
                const result = await memoryCloudService.isEnabled(conversationId)
                if (cancelled) return
                setEnabled(result.enabled)
                setChecked(true)
                log("isEnabled", { conversationId, enabled: result.enabled })
                if (result.enabled) {
                    await loadAssets(conversationId)
                } else {
                    setAssetsForConversation(conversationId, [])
                }
            } catch (err) {
                if (cancelled) return
                setEnabled(false)
                setChecked(true)
                log("isEnabled:error", {
                    conversationId,
                    error: errorToString(err),
                })
                setAssetsForConversation(conversationId, [])
            }
        }

        void run()

        return () => {
            cancelled = true
        }
    }, [conversationId, loadAssets, setAssetsForConversation])

    useEffect(() => {
        if (!conversationId) return
        const handler = (_event: unknown, data: MemoryIngestProgress) => {
            if (data.conversationId !== conversationId) return
            setProgress(data)
            log("progress", {
                conversationId,
                assetId: data.assetId,
                phase: data.phase,
                done: data.done,
                total: data.total,
                status: data.status,
            })
            if (data.status === "completed" || data.phase === "completed" || data.phase === "failed") {
                void refreshAssets()
            }
        }
        memoryCloudService.onIngestProgress(handler)
        return () => {
            memoryCloudService.removeIngestProgressListener()
        }
    }, [conversationId, refreshAssets])

    const ingestFiles = useCallback(
        async (files: File[]) => {
            if (!conversationId || !enabled || files.length === 0) return
            setIngesting(true)
            try {
                let failedCount = 0
                for (const file of files) {
                    const data = new Uint8Array(await file.arrayBuffer())
                    log("ingest:start", {
                        conversationId,
                        filename: file.name,
                        mime: file.type || "application/octet-stream",
                        size: data.byteLength,
                    })
                    let result: MemoryIngestResult
                    try {
                        result = await memoryCloudService.ingestDocument({
                            conversationId,
                            filename: file.name,
                            mime: file.type || "application/octet-stream",
                            data,
                            options: { wait: "load" },
                        })
                        log("ingest:result", {
                            conversationId,
                            filename: file.name,
                            assetId: result.assetId,
                            status: result.status,
                            error: result.error ?? null,
                        })
                        if (result.status === "failed") {
                            failedCount += 1
                            toast.error("Upload failed", {
                                description: `${file.name}: ${result.error ?? "Unknown error"}`,
                            })
                        }
                    } catch (err) {
                        failedCount += 1
                        toast.error("Upload failed", {
                            description: `${file.name}: ${errorToString(err)}`,
                        })
                        log("ingest:error", {
                            conversationId,
                            filename: file.name,
                            error: errorToString(err),
                        })
                    }
                }
                if (failedCount === 0) {
                    toast.success("Assets added")
                }
                if (failedCount < files.length) {
                    touchConversationActivity(conversationId)
                }
            } finally {
                setIngesting(false)
                await refreshAssets()
            }
        },
        [conversationId, enabled, refreshAssets]
    )

    const readAsset = useCallback(
        async (assetId: string, maxChars: number = 4000) => {
            if (!conversationId || !enabled) return null
            log("readAsset:start", { conversationId, assetId })
            try {
                const result = await memoryCloudService.readAsset(conversationId, assetId, maxChars)
                log("readAsset:done", { conversationId, assetId, found: Boolean(result) })
                return result
            } catch (err) {
                log("readAsset:error", {
                    conversationId,
                    assetId,
                    error: errorToString(err),
                })
                throw err
            }
        },
        [conversationId, enabled]
    )

    const deleteAsset = useCallback(
        async (assetId: string) => {
            if (!conversationId || !enabled) return
            const previous = assetsByConversationId[conversationId] ?? []
            setAssetsForConversation(
                conversationId,
                previous.filter((asset) => asset.id !== assetId)
            )
            log("delete:start", { conversationId, assetId })
            try {
                await memoryCloudService.deleteAsset(conversationId, assetId)
                touchConversationActivity(conversationId)
                log("delete:done", { conversationId, assetId })
            } catch (err) {
                setAssetsForConversation(conversationId, previous)
                toast.error("Remove failed", {
                    description: errorToString(err),
                })
                log("delete:error", {
                    conversationId,
                    assetId,
                    error: errorToString(err),
                })
                throw err
            }
            await refreshAssets()
        },
        [assetsByConversationId, conversationId, enabled, refreshAssets, setAssetsForConversation]
    )

    const openAsset = useCallback(
        async (assetId: string) => {
            if (!conversationId || !enabled) return
            try {
                await memoryCloudService.openAsset(conversationId, assetId)
            } catch (err) {
                toast.error("Open failed", {
                    description: errorToString(err),
                })
                throw err
            }
        },
        [conversationId, enabled]
    )

    const revealAsset = useCallback(
        async (assetId: string) => {
            if (!conversationId || !enabled) return
            try {
                await memoryCloudService.revealAsset(conversationId, assetId)
            } catch (err) {
                toast.error("Reveal failed", {
                    description: errorToString(err),
                })
                throw err
            }
        },
        [conversationId, enabled]
    )

    return {
        enabled,
        checked,
        assets,
        assetsLoading,
        ingesting,
        progress,
        refreshAssets,
        ingestFiles,
        readAsset,
        deleteAsset,
        openAsset,
        revealAsset,
        disabledReason,
    }
}
