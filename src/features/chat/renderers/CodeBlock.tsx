import { memo, useEffect, useMemo, useRef, useState } from 'react'
import { Check, Copy } from 'lucide-react'
import clsx from 'clsx'
import { bundledLanguages, getSingletonHighlighter } from 'shiki'

const SHIKI_THEME = 'dark-plus'
const FALLBACK_LANGUAGE = 'text'
const PRELOADED_LANGUAGES = [
    'text',
    'plaintext',
    'bash',
    'shell',
    'sh',
    'zsh',
    'json',
    'javascript',
    'typescript',
    'jsx',
    'tsx',
    'python',
    'markdown',
    'html',
    'css',
    'yaml',
    'sql',
    'go',
    'rust',
] as const

let highlighterPromise: Promise<Awaited<ReturnType<typeof getSingletonHighlighter>>> | null = null

function getCodeHighlighter() {
    if (!highlighterPromise) {
        highlighterPromise = getSingletonHighlighter({
            themes: [SHIKI_THEME],
            langs: [...PRELOADED_LANGUAGES],
        })
    }
    return highlighterPromise
}

function normalizeLanguage(input?: string | null): string {
    const value = (input ?? '').trim().toLowerCase()
    if (!value) return FALLBACK_LANGUAGE
    if (value === 'shell') return 'bash'
    if (value === 'plaintext') return 'text'
    return value
}

async function renderHighlightedHtml(code: string, language?: string | null): Promise<string> {
    const highlighter = await getCodeHighlighter()
    const normalized = normalizeLanguage(language)
    const resolved = highlighter.resolveLangAlias(normalized) ?? normalized

    if (!highlighter.getLanguage(resolved)) {
        const bundled = bundledLanguages[resolved as keyof typeof bundledLanguages]
        if (bundled) {
            try {
                await highlighter.loadLanguage(bundled)
            } catch {
                // Fall through to plain text rendering below.
            }
        }
    }

    const finalLanguage = highlighter.getLanguage(resolved) ? resolved : FALLBACK_LANGUAGE
    return highlighter.codeToHtml(code, {
        lang: finalLanguage,
        theme: SHIKI_THEME,
    })
}

type CodeBlockProps = {
    code: string
    language?: string | null
    closed?: boolean
    className?: string
}

const CodeBlock = memo(function CodeBlock({
    code,
    language,
    closed = true,
    className,
}: CodeBlockProps) {
    const [copied, setCopied] = useState(false)
    const [highlightedHtml, setHighlightedHtml] = useState<string | null>(null)
    const timeoutRef = useRef<number | null>(null)

    const normalizedLanguage = useMemo(
        () => normalizeLanguage(language),
        [language],
    )

    useEffect(() => {
        let cancelled = false

        if (!closed) {
            setHighlightedHtml(null)
            return () => {
                cancelled = true
            }
        }

        void renderHighlightedHtml(code, normalizedLanguage)
            .then((html) => {
                if (cancelled) return
                setHighlightedHtml(html)
            })
            .catch(() => {
                if (cancelled) return
                setHighlightedHtml(null)
            })

        return () => {
            cancelled = true
        }
    }, [closed, code, normalizedLanguage])

    useEffect(() => {
        return () => {
            if (timeoutRef.current != null) {
                window.clearTimeout(timeoutRef.current)
            }
        }
    }, [])

    const handleCopy = async () => {
        try {
            await navigator.clipboard.writeText(code)
            setCopied(true)
            if (timeoutRef.current != null) {
                window.clearTimeout(timeoutRef.current)
            }
            timeoutRef.current = window.setTimeout(() => {
                setCopied(false)
                timeoutRef.current = null
            }, 2000)
        } catch {
            setCopied(false)
        }
    }

    return (
        <div
            className={clsx(
                'my-3 overflow-hidden rounded-xl border border-white/10 bg-[#0d1117] text-slate-100',
                className,
            )}
        >
            <div className="flex items-center justify-between gap-3 border-b border-white/10 bg-white/[0.03] px-3 py-2">
                <span className="truncate text-[11px] font-semibold uppercase tracking-[0.14em] text-slate-400">
                    {normalizedLanguage}
                </span>

                <button
                    type="button"
                    onClick={handleCopy}
                    className={clsx(
                        'ui-fast inline-flex items-center gap-1.5 rounded-md px-2 py-1',
                        'cursor-pointer text-xs font-medium text-slate-300 transition-colors',
                        'hover:bg-white/8 hover:text-white',
                    )}
                    aria-label={copied ? 'Code copied' : 'Copy code'}
                    title={copied ? 'Copied' : 'Copy'}
                >
                    {copied ? <Check size={14} strokeWidth={2} /> : <Copy size={14} strokeWidth={1.9} />}
                    <span>{copied ? 'Copied' : 'Copy'}</span>
                </button>
            </div>

            <div className="overflow-x-auto px-4 py-3">
                {highlightedHtml && closed ? (
                    <div
                        className={clsx(
                            'text-[13px] leading-6',
                            '[&_.shiki]:!bg-transparent [&_.shiki]:m-0 [&_.shiki]:p-0',
                            '[&_.shiki]:text-[13px] [&_.shiki]:leading-6',
                            '[&_.shiki_code]:font-mono [&_.shiki_code]:whitespace-pre',
                        )}
                        dangerouslySetInnerHTML={{ __html: highlightedHtml }}
                    />
                ) : (
                    <pre className="m-0 overflow-x-auto bg-transparent p-0 font-mono text-[13px] leading-6 text-slate-100">
                        <code>{code}</code>
                    </pre>
                )}
            </div>
        </div>
    )
})

export default CodeBlock
