import { useEffect, useMemo, useState } from "react"
import clsx from "clsx"
import type { StrategyInfo } from "@contracts"
import { Button } from "@/shared/ui/button"
import { Switch } from "@/shared/ui/switch"
import {
    Dialog,
    DialogContent,
    DialogFooter,
    DialogHeader,
    DialogTitle,
} from "@/shared/ui/dialog"
import {
    buildDefaultConfig,
    buildOverridesDiff,
    mergeWithOverrides,
    normalizeStrategyParamsSchema,
    type StrategyConfigField,
} from "../utils/strategyConfigSchema"

type StrategyConfigDialogProps = {
    open: boolean
    strategy: StrategyInfo | null
    loading: boolean
    saving: boolean
    error: string | null
    overrides: Record<string, unknown>
    onOpenChange: (open: boolean) => void
    onSave: (params: Record<string, unknown>) => Promise<void>
}

type DraftValue = string | boolean
type DraftValues = Record<string, DraftValue>

type FieldRowProps = {
    field: StrategyConfigField
    value: DraftValue
    error: string | null
    onChange: (next: DraftValue) => void
    onReset: () => void
}

function toDraftValue(field: StrategyConfigField, value: unknown): DraftValue {
    if (field.type === "boolean") {
        return value === true
    }
    if (field.type === "number") {
        return typeof value === "number" && Number.isFinite(value) ? String(value) : ""
    }
    return typeof value === "string" ? value : ""
}

function toDraftValues(fields: StrategyConfigField[], effective: Record<string, unknown>): DraftValues {
    const next: DraftValues = {}
    for (const field of fields) {
        next[field.key] = toDraftValue(field, effective[field.key])
    }
    return next
}

function clampNumber(value: number, field: StrategyConfigField): number {
    let out = value
    if (typeof field.min === "number") out = Math.max(field.min, out)
    if (typeof field.max === "number") out = Math.min(field.max, out)
    return out
}

function validateField(field: StrategyConfigField, rawValue: DraftValue | undefined): string | null {
    if (field.type !== "number") return null

    const raw = typeof rawValue === "string" ? rawValue : ""
    if (!raw.trim()) {
        return "Enter a number"
    }

    const parsed = Number(raw)
    if (!Number.isFinite(parsed)) {
        return "Enter a number"
    }

    const hasMin = typeof field.min === "number"
    const hasMax = typeof field.max === "number"
    if (hasMin && hasMax && (parsed < (field.min as number) || parsed > (field.max as number))) {
        return `Must be between ${field.min} and ${field.max}`
    }
    if (hasMin && parsed < (field.min as number)) {
        return `Must be at least ${field.min}`
    }
    if (hasMax && parsed > (field.max as number)) {
        return `Must be at most ${field.max}`
    }

    return null
}

function parseDraftToEffective(fields: StrategyConfigField[], draft: DraftValues): Record<string, unknown> {
    const out: Record<string, unknown> = {}

    for (const field of fields) {
        const raw = draft[field.key]

        if (field.type === "boolean") {
            out[field.key] = raw === true
            continue
        }

        if (field.type === "number") {
            const rawString = typeof raw === "string" ? raw : ""
            const parsed = Number(rawString)
            if (!Number.isFinite(parsed)) continue
            out[field.key] = clampNumber(parsed, field)
            continue
        }

        out[field.key] = typeof raw === "string" ? raw : ""
    }

    return out
}

function buildNumberMeta(field: StrategyConfigField): string | null {
    const parts: string[] = []

    if (typeof field.min === "number" && typeof field.max === "number") {
        parts.push(`${field.min}\u2013${field.max}`)
    } else if (typeof field.min === "number") {
        parts.push(`>= ${field.min}`)
    } else if (typeof field.max === "number") {
        parts.push(`<= ${field.max}`)
    }

    if (typeof field.step === "number") {
        parts.push(`step ${field.step}`)
    }

    return parts.length > 0 ? parts.join(" \u00b7 ") : null
}

function FieldRow({ field, value, error, onChange, onReset }: FieldRowProps) {
    const commonInputClass = clsx(
        "w-full rounded-md border bg-bg px-2 py-1 text-sm text-tx outline-none",
        error ? "border-[var(--error-fg)]" : "border-border/60"
    )

    if (field.type === "boolean") {
        return (
            <div className="flex items-start justify-between gap-3 py-2">
                <div className="space-y-1">
                    <div className="text-sm text-tx">{field.label}</div>
                    {field.description ? (
                        <div className="text-xs text-tx/60">{field.description}</div>
                    ) : null}
                </div>
                <div className="flex items-center gap-2">
                    <button
                        type="button"
                        className="text-[10px] text-tx/55 hover:text-tx cursor-pointer"
                        onClick={onReset}
                    >
                        Reset
                    </button>
                    <Switch
                        checked={value === true}
                        onCheckedChange={(checked) => onChange(checked === true)}
                    />
                </div>
            </div>
        )
    }

    if (field.type === "text") {
        return (
            <div className="space-y-1 py-2">
                <div className="flex items-center justify-between gap-2">
                    <div className="text-sm text-tx">{field.label}</div>
                    <button
                        type="button"
                        className="text-[10px] text-tx/55 hover:text-tx cursor-pointer"
                        onClick={onReset}
                    >
                        Reset
                    </button>
                </div>
                {field.description ? (
                    <div className="text-xs text-tx/60">{field.description}</div>
                ) : null}
                <textarea
                    rows={5}
                    value={typeof value === "string" ? value : ""}
                    onChange={(event) => onChange(event.currentTarget.value)}
                    className={commonInputClass}
                />
                {error ? (
                    <div className="text-[10px] text-[var(--error-fg)]">{error}</div>
                ) : null}
            </div>
        )
    }

    if (field.type === "number") {
        const rangeHint = buildNumberMeta(field)
        return (
            <div className="space-y-1 py-2">
                <div className="flex items-center justify-between gap-2">
                    <div className="text-sm text-tx">{field.label}</div>
                    <div className="flex items-center gap-2">
                        {rangeHint ? (
                            <span className="text-[10px] text-tx/50">{rangeHint}</span>
                        ) : null}
                        <button
                            type="button"
                            className="text-[10px] text-tx/55 hover:text-tx cursor-pointer"
                            onClick={onReset}
                        >
                            Reset
                        </button>
                    </div>
                </div>
                {field.description ? (
                    <div className="text-xs text-tx/60">{field.description}</div>
                ) : null}
                <input
                    type="number"
                    min={field.min}
                    max={field.max}
                    step={field.step}
                    value={typeof value === "string" ? value : ""}
                    onChange={(event) => onChange(event.currentTarget.value)}
                    className={commonInputClass}
                />
                {error ? (
                    <div className="text-[10px] text-[var(--error-fg)]">{error}</div>
                ) : null}
            </div>
        )
    }

    return (
        <div className="space-y-1 py-2">
            <div className="flex items-center justify-between gap-2">
                <div className="text-sm text-tx">{field.label}</div>
                <button
                    type="button"
                    className="text-[10px] text-tx/55 hover:text-tx cursor-pointer"
                    onClick={onReset}
                >
                    Reset
                </button>
            </div>
            {field.description ? (
                <div className="text-xs text-tx/60">{field.description}</div>
            ) : null}
            <input
                type="text"
                value={typeof value === "string" ? value : ""}
                onChange={(event) => onChange(event.currentTarget.value)}
                className={commonInputClass}
            />
            {error ? (
                <div className="text-[10px] text-[var(--error-fg)]">{error}</div>
            ) : null}
        </div>
    )
}

export default function StrategyConfigDialog({
    open,
    strategy,
    loading,
    saving,
    error,
    overrides,
    onOpenChange,
    onSave,
}: StrategyConfigDialogProps) {
    const fields = useMemo(
        () => normalizeStrategyParamsSchema(strategy?.manifest?.paramsSchema),
        [strategy?.manifest?.paramsSchema]
    )

    const defaults = useMemo(() => buildDefaultConfig(fields), [fields])
    const defaultDraft = useMemo(() => toDraftValues(fields, defaults), [fields, defaults])

    const [draft, setDraft] = useState<DraftValues>({})

    useEffect(() => {
        if (!open) return
        const merged = mergeWithOverrides(fields, overrides)
        setDraft(toDraftValues(fields, merged))
    }, [open, fields, overrides])

    const fieldErrors = useMemo(() => {
        const errors: Record<string, string | null> = {}
        for (const field of fields) {
            errors[field.key] = validateField(field, draft[field.key])
        }
        return errors
    }, [draft, fields])

    const hasFieldErrors = useMemo(
        () => Object.values(fieldErrors).some((message) => typeof message === "string" && message.length > 0),
        [fieldErrors]
    )

    const canSave = strategy != null && !loading && fields.length > 0 && !hasFieldErrors

    const handleSave = async () => {
        const effective = parseDraftToEffective(fields, draft)
        await onSave(buildOverridesDiff(fields, effective))
    }

    return (
        <Dialog open={open} onOpenChange={onOpenChange}>
            <DialogContent className="max-w-2xl border-border [&_[data-slot='dialog-close']]:ring-0 [&_[data-slot='dialog-close']]:ring-offset-0 [&_[data-slot='dialog-close']]:shadow-none">
                <DialogHeader>
                    <DialogTitle>Strategy Config</DialogTitle>
                </DialogHeader>
                <div className="max-h-[60vh] overflow-y-auto">
                    {loading ? (
                        <div className="text-sm text-tx/60 py-2">Loading config...</div>
                    ) : fields.length === 0 ? (
                        <div className="text-sm text-tx/60 py-2">
                            No configurable fields.
                        </div>
                    ) : (
                        <div className="divide-y divide-border/50">
                            {fields.map((field) => (
                                <FieldRow
                                    key={field.key}
                                    field={field}
                                    value={draft[field.key] ?? (field.type === "boolean" ? false : "")}
                                    error={fieldErrors[field.key] ?? null}
                                    onChange={(next) => {
                                        setDraft((prev) => ({ ...prev, [field.key]: next }))
                                    }}
                                    onReset={() => {
                                        setDraft((prev) => ({
                                            ...prev,
                                            [field.key]: defaultDraft[field.key] ?? (field.type === "boolean" ? false : ""),
                                        }))
                                    }}
                                />
                            ))}
                        </div>
                    )}
                    {error ? (
                        <div className="mt-2 text-sm text-destructive">{error}</div>
                    ) : null}
                </div>
                <DialogFooter>
                    <Button
                        type="button"
                        variant="outline"
                        disabled={!canSave || saving}
                        onClick={() => setDraft(defaultDraft)}
                    >
                        Reset to defaults
                    </Button>
                    <Button
                        type="button"
                        disabled={!canSave || saving}
                        onClick={() => void handleSave()}
                    >
                        {saving ? "Saving..." : "Save"}
                    </Button>
                </DialogFooter>
            </DialogContent>
        </Dialog>
    )
}
