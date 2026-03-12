// src/pages/settings/model/components/ApiKeySection.tsx
import clsx from 'clsx'
import { Check, Copy, Eye, EyeOff, X } from 'lucide-react'
import { useEffect, useMemo, useState } from 'react'
import type { ProviderId } from '../utils/providers'
import { PROVIDERS } from '../utils/providers'
import type { LLMModelConfig } from '@contracts'

export default function ApiKeySection({
    providerId,
    optional = false,
}: {
    providerId: ProviderId
    optional?: boolean
}) {
    const [show, setShow] = useState(false)
    const [value, setValue] = useState('')
    const [open, setOpen] = useState(false)
    const [models, setModels] = useState<LLMModelConfig[]>([])
    const [selectedModelId, setSelectedModelId] = useState('')
    const [status, setStatus] = useState<'idle' | 'running' | 'success' | 'failed'>('idle')
    const [errorText, setErrorText] = useState('')
    const [latencyMs, setLatencyMs] = useState<number | null>(null)
    const [loadingModels, setLoadingModels] = useState(false)

    useEffect(() => {
        let cancelled = false
        window.chatAPI.getProvidersConfig().then((cfg) => {
            if (cancelled) return
            setValue(cfg[providerId]?.apiKey ?? '')
        })
        return () => { cancelled = true }
    }, [providerId])

    useEffect(() => {
        if (!open) return
        let cancelled = false
        setLoadingModels(true)
        window.chatAPI.listModels()
            .then((list) => {
                if (cancelled) return
                const filtered = list.filter((m) => m.provider === providerId)
                setModels(filtered)
                setSelectedModelId((prev) => {
                    if (prev && filtered.some((m) => m.id === prev)) return prev
                    return filtered[0]?.id ?? ''
                })
            })
            .catch(() => {
                if (cancelled) return
                setModels([])
                setSelectedModelId('')
            })
            .finally(() => {
                if (cancelled) return
                setLoadingModels(false)
            })
        return () => { cancelled = true }
    }, [open, providerId])

    useEffect(() => {
        if (!open) return
        setStatus('idle')
        setErrorText('')
        setLatencyMs(null)
    }, [open])

    const providerLabel = useMemo(() => {
        return PROVIDERS.find((p) => p.id === providerId)?.label ?? providerId
    }, [providerId])

    const runTest = async () => {
        if (!selectedModelId || status === 'running') return
        setStatus('running')
        setErrorText('')
        setLatencyMs(null)
        try {
            const res = await window.chatAPI.testProviderModel(providerId, selectedModelId)
            if (res.ok) {
                setStatus('success')
                setLatencyMs(res.latencyMs ?? null)
                return
            }
            setStatus('failed')
            setErrorText(res.error ?? 'unknown error')
            setLatencyMs(res.latencyMs ?? null)
        } catch (err) {
            const msg = err instanceof Error ? err.message : String(err)
            setStatus('failed')
            setErrorText(msg)
        }
    }

    const copyError = async () => {
        if (!errorText) return
        try {
            await navigator.clipboard.writeText(errorText)
        } catch {
            // ignore clipboard errors
        }
    }

    return (
        <div className="relative">
            <div className="text-sm font-extrabold text-tx select-none">
                {optional ? 'API Key (Optional)' : 'API Key'}
            </div>

            <div className="mt-2">
                <div className="h-8 flex items-stretch rounded-md border border-border bg-bg-field overflow-hidden">
                    <input
                        value={value}
                        onChange={(e) => setValue(e.target.value)}
                        onBlur={() => {
                            window.chatAPI.setProviderConfig(providerId, {
                                apiKey: value.trim() || undefined,
                            })
                        }}
                        type={show ? "text" : "password"}
                        placeholder="API Key"
                        spellCheck={false}
                        className="flex-1 bg-transparent px-2 text-sm text-tx outline-none placeholder:opacity-35"
                    />

                    <button
                        type="button"
                        onClick={() => setShow((v) => !v)}
                        title={show ? "Hide" : "Show"}
                        className="w-11 appearance-none cursor-pointer grid place-items-center border-l border-border text-tx/55 hover:text-tx hover:bg-bg-sidebar-button-hover transition"
                    >
                        {show ? <Eye className="h-4 w-4" /> : <EyeOff className="h-4 w-4" />}
                    </button>

                    <button
                        type="button"
                        onClick={() => setOpen(true)}
                        className="w-20 appearance-none cursor-pointer select-none border-l border-border text-sm text-tx/80 hover:text-tx hover:bg-bg-sidebar-button-hover transition"
                    >
                        Check
                    </button>
                </div>

                {open && (
                    <div
                        className="absolute right-0 top-full mt-2 w-[320px] z-30 rounded-xl border border-border bg-bg-chatarea shadow-xl p-3 text-sm text-tx [-webkit-app-region:no-drag]"
                        role="dialog"
                        aria-label="Test API Key"
                    >
                        <div className="flex items-center justify-between">
                            <div className="font-semibold text-tx">Test API Key</div>
                            <button
                                type="button"
                                onClick={() => setOpen(false)}
                                aria-label="Close"
                                className="h-7 w-7 grid place-items-center rounded-md cursor-pointer text-tx/60 hover:text-tx hover:bg-bg-sidebar-button-hover transition"
                            >
                                <X className="h-4 w-4" />
                            </button>
                        </div>

                        <div className="mt-1 text-xs text-tx/55">
                            Provider: <span className="text-tx/80">{providerLabel}</span>
                        </div>

                        <div className="mt-3 space-y-2">
                            <div className="text-xs text-tx/60">Model</div>
                            <select
                                value={selectedModelId}
                                onChange={(e) => setSelectedModelId(e.target.value)}
                                disabled={loadingModels || models.length === 0}
                                className="h-8 w-full cursor-pointer rounded-lg border border-border bg-bg-field px-2 text-sm text-tx outline-none disabled:opacity-50"
                            >
                                {models.map((m) => (
                                    <option key={m.id} value={m.id}>
                                        {m.name ?? m.label ?? m.id}
                                    </option>
                                ))}
                            </select>

                            {models.length === 0 && !loadingModels && (
                                <div className="text-xs text-tx/55">
                                    No models available for this provider.
                                </div>
                            )}
                        </div>

                        <div className="mt-3 flex items-center gap-2">
                            <button
                                type="button"
                                onClick={runTest}
                                disabled={loadingModels || models.length === 0 || status === "running"}
                                className={clsx(
                                    "h-8 px-3 rounded-lg border border-border text-sm font-medium text-tx/90 hover:text-tx hover:bg-bg-sidebar-button-hover transition select-none cursor-pointer",
                                    (loadingModels || models.length === 0 || status === "running") &&
                                    "opacity-50 cursor-not-allowed"
                                )}
                            >
                                Run test
                            </button>

                            {status === "running" && (
                                <div className="text-xs text-tx/55">Running...</div>
                            )}
                        </div>

                        <div className="mt-3 rounded-lg border border-border/60 bg-bg-field/40 p-2 text-xs text-tx/70">
                            {status === "idle" && <span>Idle</span>}

                            {status === "success" && (
                                <div className="flex items-center gap-2 text-emerald-300">
                                    <Check className="h-3.5 w-3.5" />
                                    <span>Success</span>
                                </div>
                            )}

                            {status === "failed" && (
                                <div className="space-y-2 text-rose-300">
                                    <div>Failed</div>
                                    {errorText && (
                                        <div className="rounded-md border border-border/70 bg-bg-chatarea/60 p-2 text-[11px] text-tx/80">
                                            <div className="flex items-start justify-between gap-2">
                      <span className="break-all whitespace-pre-wrap">
                        {errorText}
                      </span>
                                                <button
                                                    type="button"
                                                    onClick={copyError}
                                                    title="Copy error"
                                                    className="shrink-0 h-6 w-6 grid place-items-center rounded-md text-tx/60 hover:text-tx hover:bg-bg-sidebar-button-hover transition"
                                                >
                                                    <Copy className="h-3.5 w-3.5" />
                                                </button>
                                            </div>
                                        </div>
                                    )}
                                </div>
                            )}

                            {latencyMs != null && (
                                <div className="mt-2 text-[11px] text-tx/55">
                                    Latency: {latencyMs} ms
                                </div>
                            )}
                        </div>
                    </div>
                )}
            </div>
        </div>
    )
}
