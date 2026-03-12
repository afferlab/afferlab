import { HelpCircle } from "lucide-react"
import { useEffect, useMemo, useState } from "react"
import type { ProviderId } from "../utils/providers"
import { DEFAULT_HOSTS, PREVIEW_PATHS, PROVIDERS } from "../utils/providers"
import clsx from "clsx"

function normalizeHost(v: string) {
    return (v || "").trim().replace(/\/+$/, "")
}

function buildPreview(providerId: ProviderId, host: string): string {
    const base = normalizeHost(host)
    if (!base) return ""
    if (providerId === "ollama") {
        return `${base}/api/chat`
    }
    if (providerId === "lmstudio" || providerId === "openai" || providerId === "deepseek") {
        if (base.endsWith("/v1")) {
            return `${base}/chat/completions`
        }
        return `${base}/v1/chat/completions`
    }
    const previewPath = PREVIEW_PATHS[providerId]
    return previewPath ? `${base}${previewPath}` : ""
}

export default function ApiHostSection({ providerId }: { providerId: ProviderId }) {
    const provider = useMemo(
        () => PROVIDERS.find((p) => p.id === providerId),
        [providerId]
    )

    // Provider constants
    const defaultHost = DEFAULT_HOSTS[providerId] ?? provider?.defaultApiHost ?? ""

    // UI state: host shown in the field (= user override or default)
    const [host, setHost] = useState(defaultHost)

    // Initial load: prefer the config override, otherwise show the default
    useEffect(() => {
        let cancelled = false
        setHost(defaultHost)
        ;(async () => {
            const cfg = await window.chatAPI.getProvidersConfig()
            if (cancelled) return
            const saved = cfg?.[providerId]?.apiHost ?? ""
            setHost(saved || defaultHost || "")
        })()
        return () => {
            cancelled = true
        }
    }, [providerId, defaultHost])

    // Dirty state: whether the current input differs from the default
    const isDirty = useMemo(() => {
        const a = normalizeHost(host)
        const b = normalizeHost(defaultHost)
        return Boolean(b) && a !== b
    }, [host, defaultHost])

    // Preview: build using provider-specific rules
    const preview = useMemo(() => {
        return buildPreview(providerId, host)
    }, [providerId, host])

    return (
        <div>
            <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                    <div className="text-sm font-extrabold text-tx select-none">API Host</div>
                    <button
                        type="button"
                        className="text-tx/60 hover:text-tx transition cursor-pointer"
                        title="Use the provider base URL. Leave the default unless you are connecting to a custom endpoint."
                    >
                        <HelpCircle className="h-4 w-4" />
                    </button>
                </div>
            </div>

            <div className="mt-2">
                {/* Input + Reset, visually aligned with the ApiKey Check button */}
                <div className="flex items-stretch gap-0 rounded-md border border-border bg-bg-field overflow-hidden">
                    <input
                        value={host}
                        onChange={(e) => setHost(e.target.value)}
                        onBlur={() => {
                            const next = normalizeHost(host)
                            window.chatAPI.setProviderConfig(providerId, {
                                apiHost: next || undefined,
                            })
                        }}
                        placeholder={defaultHost || "https://api.example.com"}
                        className="h-8 flex-1 outline-none px-2 text-sm text-tx placeholder:opacity-40 bg-transparent"
                        spellCheck={false}
                    />

                    {isDirty && (
                        <button
                            type="button"
                            onClick={() => {
                                setHost(defaultHost)
                                window.chatAPI.setProviderConfig(providerId, { apiHost: defaultHost })
                            }}
                            className={clsx(
                                "w-20 text-sm",
                                "border-l border-border",
                                "text-tx/80 hover:text-tx cursor-pointer",
                                "hover:bg-bg-sidebar-button-hover transition"
                            )}
                        >
                            Reset
                        </button>
                    )}
                </div>

                {preview && (
                    <div className="mt-2 text-xs text-tx/45">
                        Preview: <span className="text-tx/55">{preview}</span>
                    </div>
                )}
            </div>
        </div>
    )
}
