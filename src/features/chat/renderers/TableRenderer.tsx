import { memo } from 'react'
import clsx from 'clsx'

type TableRendererProps = React.TableHTMLAttributes<HTMLTableElement>

const TableRenderer = memo(function TableRenderer({
    className,
    children,
    ...props
}: TableRendererProps) {
    return (
        <div className="my-4 overflow-x-auto rounded-xl border border-border/70">
            <table
                {...props}
                className={clsx(
                    'w-full border-collapse text-left text-sm text-tx',
                    className,
                )}
            >
                {children}
            </table>
        </div>
    )
})

export default TableRenderer
