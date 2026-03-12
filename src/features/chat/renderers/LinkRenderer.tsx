import { memo } from 'react'
import clsx from 'clsx'

type LinkRendererProps = React.AnchorHTMLAttributes<HTMLAnchorElement>

const LinkRenderer = memo(function LinkRenderer({
    className,
    children,
    href,
    ...props
}: LinkRendererProps) {
    return (
        <a
            {...props}
            href={href}
            target="_blank"
            rel="noreferrer"
            className={clsx(
                'underline underline-offset-4 decoration-border',
                'text-tx transition-colors hover:text-tx/80',
                className,
            )}
        >
            {children}
        </a>
    )
})

export default LinkRenderer
