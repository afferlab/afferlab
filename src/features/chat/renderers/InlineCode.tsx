import { memo } from 'react'
import clsx from 'clsx'

type InlineCodeProps = {
    children: React.ReactNode
    className?: string
}

const InlineCode = memo(function InlineCode({ children, className }: InlineCodeProps) {
    return (
        <code
            className={clsx(
                'rounded-md border border-border/70 bg-black/5 px-1.5 py-0.5',
                'font-mono text-[0.92em] text-tx',
                className,
            )}
        >
            {children}
        </code>
    )
})

export default InlineCode
