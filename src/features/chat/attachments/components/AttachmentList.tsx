import clsx from 'clsx'
import AssetChip, {
    type AssetChipItem,
    type AssetChipVariant,
    type AssetChipIssue,
} from './AssetChip'

type AttachmentListProps = {
    attachments: AssetChipItem[]
    variant: AssetChipVariant
    issues?: Record<string, AssetChipIssue>
    onRemove?: (id: string) => void
    showRemove?: boolean
    className?: string
    listClassName?: string
    cardClassName?: string
    size?: 'md' | 'sm'
}

export type {
    AssetChipItem as AttachmentCardItem,
    AssetChipVariant as AttachmentCardVariant,
    AssetChipIssue as AttachmentIssue,
}

export default function AttachmentList({
    attachments,
    variant,
    issues = {},
    onRemove,
    showRemove,
    className,
    listClassName,
    cardClassName,
    size = 'md',
}: AttachmentListProps) {
    if (!attachments.length) return null

    return (
        <div
            className={clsx(
                variant === 'composer'
                    ? 'mb-2 overflow-x-auto pl-1 pr-4 pb-1'
                    : 'mb-2',
                className,
            )}
        >
            <div
                role="list"
                aria-label={variant === 'composer' ? 'Selected attachments' : 'Message attachments'}
                className={clsx(
                    variant === 'composer'
                        ? 'flex w-max gap-2'
                        : 'flex flex-col gap-2',
                    listClassName,
                )}
            >
                {attachments.map((attachment) => (
                    <AssetChip
                        key={attachment.id}
                        item={attachment}
                        variant={variant}
                        issue={issues[attachment.id]}
                        onRemove={onRemove}
                        showRemove={showRemove}
                        className={cardClassName}
                        size={size}
                    />
                ))}
            </div>
        </div>
    )
}
