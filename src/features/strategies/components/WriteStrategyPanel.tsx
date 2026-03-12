import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import clsx from 'clsx'
import { ArrowRight, BookOpen, Download } from 'lucide-react'
import { toast } from 'sonner'

import { Button } from '@/shared/ui/button'
import { Card, CardContent } from '@/shared/ui/card'
import {
    Dialog,
    DialogContent,
    DialogDescription,
    DialogHeader,
    DialogTitle,
} from '@/shared/ui/dialog'
import type { StrategyDevCompileResult, StrategyDevDiagnostic, StrategyInfo } from '@contracts'
import { strategyDevService } from '@/features/strategy-dev/services/strategyDevService'
import {
    downloadStrategyTemplate,
    STRATEGY_TEMPLATE_CODE,
} from '../utils/strategyTemplate'

type TestStatus = 'idle' | 'compiling' | 'testing' | 'saving' | 'passed' | 'failed'

export type DevStrategy = {
    strategy: StrategyInfo
    id: string
    name: string
    version: string
    description?: string
    sourcePath?: string
    status?: 'passed' | 'failed' | 'unknown'
    diagnostics?: StrategyDevDiagnostic[]
    usageCount?: number
    enabled: boolean
}

function pathLabel(filePath: string): string {
    const parts = filePath.split(/[/\\]/g)
    return parts[parts.length - 1] || filePath
}

function statusDotClass(status: TestStatus): string {
    if (status === 'passed') {
        return 'bg-emerald-400 shadow-[0_0_8px_rgba(52,211,153,0.6)]'
    }
    if (status === 'failed') {
        return 'bg-rose-400 shadow-[0_0_8px_rgba(251,113,133,0.6)]'
    }
    if (status === 'saving') {
        return 'bg-amber-400 shadow-[0_0_8px_rgba(251,191,36,0.55)]'
    }
    return 'bg-muted-foreground/40 shadow-[0_0_6px_rgba(148,163,184,0.4)]'
}

export default function WriteStrategyPanel({
    devStrategies,
    onRefresh,
    onOpenPersonal,
}: {
    devStrategies: DevStrategy[]
    onRefresh: () => Promise<void>
    onOpenPersonal?: () => void
}) {
    const inputRef = useRef<HTMLInputElement>(null)
    const phaseTimerRef = useRef<number | null>(null)

    const [selectedFileName, setSelectedFileName] = useState<string | null>(null)
    const [testStatus, setTestStatus] = useState<TestStatus>('idle')
    const [testResult, setTestResult] = useState<StrategyDevCompileResult | null>(null)
    const [isDragging, setIsDragging] = useState(false)
    const [isHovering, setIsHovering] = useState(false)
    const [docsOpen, setDocsOpen] = useState(false)
    const [savedNotice, setSavedNotice] = useState<{ strategyId: string; name: string } | null>(null)

    useEffect(() => {
        return () => {
            if (phaseTimerRef.current) window.clearTimeout(phaseTimerRef.current)
        }
    }, [])

    const devStrategiesBySourcePath = useMemo(() => {
        const map = new Map<string, DevStrategy>()
        devStrategies.forEach((strategy) => {
            if (strategy.sourcePath) map.set(strategy.sourcePath, strategy)
        })
        return map
    }, [devStrategies])

    const statusSummary = useMemo(() => {
        if (testStatus === 'compiling') return 'Compiling…'
        if (testStatus === 'testing') return 'Running tests…'
        if (testStatus === 'saving') return 'Adding to Personal…'
        if (testStatus === 'passed') return 'Passed'
        if (testStatus === 'failed') return 'Failed'
        return ''
    }, [testStatus])

    const showNotice = useCallback((strategyId: string, name: string) => {
        setSavedNotice({ strategyId, name })
    }, [])

    const upsertPersonalStrategy = useCallback(async (
        result: StrategyDevCompileResult,
        filePath: string,
    ) => {
        if (!result.ok || !result.code) return
        const existing = devStrategiesBySourcePath.get(filePath)
        setTestStatus('saving')

        if (existing) {
            const reloadRes = await strategyDevService.reload({
                strategyId: existing.id,
                filePath,
                code: result.code,
                meta: result.meta,
                paramsSchema: result.paramsSchema,
                hash: result.hash,
                diagnostics: result.diagnostics,
            })
            if (!reloadRes.ok) {
                throw new Error(reloadRes.error ?? 'Reload failed')
            }
            await onRefresh()
            setTestStatus('passed')
            showNotice(existing.id, result.meta?.name ?? existing.name)
            return
        }

        const saveRes = await strategyDevService.save({
            filePath,
            code: result.code,
            meta: result.meta,
            paramsSchema: result.paramsSchema,
            hash: result.hash,
            diagnostics: result.diagnostics,
        })
        if (!saveRes.ok || !saveRes.strategyId) {
            throw new Error(saveRes.error ?? 'Save failed')
        }
        await onRefresh()
        setTestStatus('passed')
        showNotice(saveRes.strategyId, result.meta?.name ?? pathLabel(filePath))
    }, [devStrategiesBySourcePath, onRefresh, showNotice])

    const runCompileAndTest = useCallback(async (filePath: string, displayName?: string) => {
        if (phaseTimerRef.current) window.clearTimeout(phaseTimerRef.current)
        if (!filePath) {
            const message = 'File path is not available. Please run in the desktop app.'
            setTestStatus('failed')
            setTestResult({ ok: false, errors: [{ message }], diagnostics: [{ kind: 'runtime', message }] })
            return null
        }

        setTestStatus('compiling')
        setTestResult(null)
        setSavedNotice(null)

        phaseTimerRef.current = window.setTimeout(() => {
            setTestStatus('testing')
        }, 200)

        try {
            const result = await strategyDevService.compileAndTest({ filePath, displayName })
            setTestResult(result)
            if (!result.ok) {
                setTestStatus('failed')
                return result
            }
            await upsertPersonalStrategy(result, filePath)
            return result
        } catch (err) {
            const message = err instanceof Error ? err.message : 'Unknown error'
            setTestResult({ ok: false, errors: [{ message }] })
            setTestStatus('failed')
            return null
        } finally {
            if (phaseTimerRef.current) {
                window.clearTimeout(phaseTimerRef.current)
            }
        }
    }, [upsertPersonalStrategy])

    const handleFile = useCallback(async (file?: File | null) => {
        if (!file) return
        const filePath = (file as File & { path?: string }).path ?? null
        setSelectedFileName(file.name)
        await runCompileAndTest(filePath, file.name)
    }, [runCompileAndTest])

    const handleInputChange = useCallback((event: React.ChangeEvent<HTMLInputElement>) => {
        const file = event.target.files?.[0]
        void handleFile(file)
        event.target.value = ''
    }, [handleFile])

    const handleDragEnter = useCallback(() => {
        setIsDragging(true)
    }, [])

    const handleDragLeave = useCallback((event: React.DragEvent<HTMLDivElement>) => {
        const nextTarget = event.relatedTarget as Node | null
        if (nextTarget && event.currentTarget.contains(nextTarget)) return
        setIsDragging(false)
    }, [])

    const handleDragOver = useCallback((event: React.DragEvent<HTMLDivElement>) => {
        event.preventDefault()
        setIsDragging(true)
    }, [])

    const handleDrop = useCallback((event: React.DragEvent<HTMLDivElement>) => {
        event.preventDefault()
        setIsDragging(false)
        const file = event.dataTransfer.files?.[0]
        void handleFile(file)
    }, [handleFile])

    return (
        <section className="h-full min-h-0 overflow-y-auto scrollbar-sidebar">
            <div className="px-5 pb-6">
                <div className="pt-3 pb-2">
                    <div className="text-xl text-tx font-semibold select-none">Write Strategy</div>
                    <div className="text-sm text-tx/60">
                        Validate a single TypeScript strategy file and add it directly into Personal.
                    </div>
                </div>

                <div className="mt-5 space-y-6">
                    <div>
                        <div className="flex items-center justify-between gap-3">
                            <div>
                                <div className="text-sm font-semibold text-tx/80 select-none">Download Template</div>
                                <div className="text-xs text-tx/55">Start from a valid single-file strategy template.</div>
                            </div>
                            <Button
                                size="sm"
                                variant="outline"
                                className="gap-2 border-border/60 cursor-pointer"
                                onClick={downloadStrategyTemplate}
                            >
                                <Download className="h-4 w-4" />
                                Download
                            </Button>
                        </div>
                    </div>

                    <Card
                        className={clsx(
                            'border border-dashed border-border/60 bg-muted/20',
                            'transition cursor-pointer',
                            isHovering && 'bg-muted/30 border-border/80',
                            isDragging && 'bg-muted/50 border-border ring-1 ring-border/70'
                        )}
                        onMouseEnter={() => setIsHovering(true)}
                        onMouseLeave={() => setIsHovering(false)}
                        onDragEnter={handleDragEnter}
                        onDragLeave={handleDragLeave}
                        onDragOver={handleDragOver}
                        onDrop={handleDrop}
                        onClick={() => inputRef.current?.click()}
                        onKeyDown={(event) => {
                            if (event.key === 'Enter' || event.key === ' ') {
                                event.preventDefault()
                                inputRef.current?.click()
                            }
                        }}
                        role="button"
                        tabIndex={0}
                    >
                        <CardContent className="h-24 px-5 py-0">
                            <div className="relative flex h-full items-center justify-center overflow-hidden text-center">
                                <div
                                    className={clsx(
                                        'absolute inset-0 flex flex-col items-center justify-center gap-2',
                                        'ui-base transition-[opacity,transform]',
                                        selectedFileName
                                            ? 'pointer-events-none translate-y-1 opacity-0'
                                            : 'translate-y-0 opacity-100'
                                    )}
                                >
                                    <div className="text-sm text-tx/80">Drop a strategy file here</div>
                                    <div className="text-xs text-tx/50">or click to select a single .ts file</div>
                                </div>

                                <div
                                    className={clsx(
                                        'absolute inset-0 flex items-center justify-center',
                                        'ui-base transition-[opacity,transform]',
                                        selectedFileName
                                            ? 'translate-y-0 opacity-100'
                                            : 'pointer-events-none -translate-y-1 opacity-0'
                                    )}
                                >
                                    <div className="flex min-w-0 max-w-full items-center gap-2 rounded-full border border-border/60 bg-bg-field/60 px-3 py-2">
                                        <span className="truncate text-sm font-medium text-tx">{selectedFileName}</span>
                                        <span className="shrink-0 rounded-full bg-[var(--success-bg)] px-2 py-0.5 text-[11px] font-medium text-[var(--success-fg)]">
                                            Uploaded
                                        </span>
                                    </div>
                                </div>
                            </div>
                        </CardContent>
                    </Card>

                    <input
                        ref={inputRef}
                        type="file"
                        accept=".ts"
                        onChange={handleInputChange}
                        className="hidden"
                    />

                    <div className="">
                        <div className="flex min-h-9 items-center justify-between gap-3 rounded-full border border-border/60 bg-bg-field/60 px-4">
                            <div className="flex min-w-0 items-center gap-2">
                                <span className={clsx('h-2 w-2 rounded-full', statusDotClass(testStatus))} />
                                <span className="text-sm font-semibold text-tx select-none">Test Status</span>
                            </div>
                            {statusSummary ? (
                                <div className="shrink-0 text-xs text-tx/55">{statusSummary}</div>
                            ) : null}
                        </div>

                        {testStatus === 'failed' && (testResult?.diagnostics?.length || testResult?.errors?.length) ? (
                            <div className="mt-4 max-h-[220px] space-y-3 overflow-y-auto pr-1 text-[11px] text-tx/60 scrollbar-sidebar">
                                {testResult?.diagnostics?.map((diag, idx) => (
                                    <div key={`diag-${idx}`}>
                                        <div className="text-tx/80">[{diag.kind}] {diag.message}</div>
                                        {diag.file ? (
                                            <div className="text-[11px] text-tx/50">
                                                {diag.file}
                                                {diag.line ? `:${diag.line}` : ''}
                                                {diag.column ? `:${diag.column}` : ''}
                                            </div>
                                        ) : null}
                                        {diag.frame ? (
                                            <pre className="mt-1 whitespace-pre-wrap text-[11px] text-tx/50">{diag.frame}</pre>
                                        ) : null}
                                    </div>
                                ))}
                                {!testResult?.diagnostics?.length && testResult?.errors?.map((err, idx) => (
                                    <div key={`err-${idx}`} className="text-destructive">{err.message}</div>
                                ))}
                            </div>
                        ) : null}
                    </div>

                    {savedNotice ? (
                        <div className="flex items-center justify-between gap-3 rounded-xl border border-[var(--success-fg)]/15 bg-[var(--success-bg)]/70 px-4 py-3 text-sm text-[var(--success-fg)]">
                            <div className="min-w-0">
                                <div className="font-medium">Added to Personal</div>
                                <div className="text-xs text-[var(--success-fg)]/80 truncate">{savedNotice.name}</div>
                            </div>
                            <Button
                                size="sm"
                                variant="outline"
                                className="gap-2 border-[var(--success-fg)]/20 bg-transparent text-[var(--success-fg)] hover:bg-[var(--success-fg)]/8 cursor-pointer"
                                onClick={() => onOpenPersonal?.()}
                            >
                                Personal
                                <ArrowRight className="h-4 w-4" />
                            </Button>
                        </div>
                    ) : null}

                    <div>
                        <div className="flex items-center justify-between gap-3">
                            <div>
                                <div className="text-sm font-semibold text-tx/80">Documentation</div>
                            </div>
                            <Button
                                size="sm"
                                variant="outline"
                                className="gap-2 border-border/60 cursor-pointer"
                                onClick={() => setDocsOpen(true)}
                            >
                                <BookOpen className="h-4 w-4" />
                                Open
                            </Button>
                        </div>
                    </div>
                </div>
            </div>

            <Dialog open={docsOpen} onOpenChange={setDocsOpen}>
                <DialogContent className="max-w-3xl h-[70vh] flex flex-col">
                    <DialogHeader>
                        <DialogTitle>Strategy Template</DialogTitle>
                        <DialogDescription>
                            Download the template or copy it directly into a single TypeScript file.
                        </DialogDescription>
                    </DialogHeader>
                    <div className="flex items-center justify-end gap-2">
                        <Button
                            size="sm"
                            variant="outline"
                            className="cursor-pointer"
                            onClick={async () => {
                                await navigator.clipboard.writeText(STRATEGY_TEMPLATE_CODE)
                                toast.success('Copied')
                            }}
                        >
                            Copy
                        </Button>
                        <Button
                            size="sm"
                            variant="outline"
                            className="gap-2 cursor-pointer"
                            onClick={downloadStrategyTemplate}
                        >
                            <Download className="h-4 w-4" />
                            Download
                        </Button>
                    </div>
                    <div className="flex-1 min-h-0 overflow-hidden">
                        <pre className="mt-2 h-full overflow-auto rounded-md border border-border/60 bg-bg/60 p-3 text-[11px] text-tx/70 whitespace-pre-wrap break-words">
                            {STRATEGY_TEMPLATE_CODE}
                        </pre>
                    </div>
                </DialogContent>
            </Dialog>
        </section>
    )
}
