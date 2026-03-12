import clsx from 'clsx'
import type { DragEvent, MouseEvent } from 'react'
import { Loader2, X } from 'lucide-react'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/shared/ui/tooltip'
import { buildAssetVisual } from '../utils/assetVisual'
import type { AssetIngestionState, TurnAttachmentStatus } from '@contracts'

export type AssetChipIssue = {
    unsupported: boolean
    reason: string | null
}

export type AssetChipVariant = 'composer' | 'message' | 'memory'
export type AssetChipSize = 'md' | 'sm'
export type AssetChipLayout = 'chip' | 'row'

export type AssetChipItem = {
    id: string
    name: string
    mimeType: string
    ext?: string
    size: number
    kind?: 'image' | 'audio' | 'video' | 'document' | 'file'
    status?: TurnAttachmentStatus
    ingestionState?: AssetIngestionState
    errorMessage?: string
}

type AssetChipProps = {
    item: AssetChipItem
    variant: AssetChipVariant
    size?: AssetChipSize
    layout?: AssetChipLayout
    issue?: AssetChipIssue
    onRemove?: (id: string) => void
    showRemove?: boolean
    onClick?: (item: AssetChipItem) => void
    className?: string
    draggable?: boolean
    onDragStart?: (event: DragEvent<HTMLDivElement>, item: AssetChipItem) => void
    onDragOver?: (event: DragEvent<HTMLDivElement>, item: AssetChipItem) => void
    onDrop?: (event: DragEvent<HTMLDivElement>, item: AssetChipItem) => void
    onDragEnd?: (event: DragEvent<HTMLDivElement>, item: AssetChipItem) => void
}

function resolveKind(item: AssetChipItem): 'image' | 'audio' | 'video' | 'document' | 'file' {
    if (item.kind) return item.kind
    const mime = String(item.mimeType ?? '').toLowerCase()
    if (mime.startsWith('image/')) return 'image'
    if (mime.startsWith('audio/')) return 'audio'
    if (mime.startsWith('video/')) return 'video'
    return 'document'
}

export default function AssetChip({
    item,
    variant,
    size = 'md',
    layout = 'chip',
    issue,
    onRemove,
    showRemove,
    onClick,
    className,
    draggable,
    onDragStart,
    onDragOver,
    onDrop,
    onDragEnd,
}: AssetChipProps) {
    const style = buildAssetVisual({
        mimeType: item.mimeType,
        ext: item.ext,
        name: item.name,
        kind: resolveKind(item),
    })

    const uploading =
        item.ingestionState === 'picking'
        || item.ingestionState === 'uploading'
        || item.status === 'uploading'

    const hasError =
        item.ingestionState === 'failed'
        || item.status === 'error'
        || issue?.unsupported

    const tooltip = issue?.reason || item.errorMessage || null
    const allowRemove = Boolean((showRemove ?? variant === 'composer') && onRemove)
    const isSmall = size === 'sm'
    const isRow = layout === 'row'
    const isMemory = variant === 'memory'
    const iconWrapClass = isMemory
        ? 'h-4 w-4 rounded-sm'
        : isSmall
        ? 'h-5 w-5 rounded-lg'
        : 'h-10 w-10 rounded-lg'
    const iconClass = isMemory ? 'h-3 w-3' : isSmall ? 'h-3 w-3' : 'h-5 w-5'
    const cardSizeClass = isRow
        ? clsx(
            isMemory ? 'h-7 px-2.5' : isSmall ? 'h-8 w-full p-1' : 'h-14 w-full px-2',
            allowRemove ? (isMemory ? 'pr-2.5' : 'pr-8') : 'pr-3',
        )
        : clsx(
            isMemory ? 'h-7 px-2.5' : isSmall ? 'h-8 w-[182px] p-1' : 'h-14 w-[280px] px-2',
            allowRemove ? (isMemory ? 'pr-2.5' : 'pr-8') : 'pr-3',
        )

    const textPrimary = isMemory
        ? 'text-xs leading-none font-bold'
        : isSmall
            ? 'text-[11px] leading-3.5 font-bold'
            : 'text-[14px] leading-4 font-bold'
    const textSecondary = isSmall ? 'text-[10px] leading-3 font-bold' : 'text-[12px] leading-4 font-bold'
    const iconOverlayClass = isSmall ? 'h-3 w-3' : 'h-4 w-4'

    const variantClass = hasError
        ? 'border-[var(--error-fg)]/45 bg-[var(--error-bg)]/30'
        : variant === 'composer'
            ? 'border-border/70 bg-bg-chatarea hover:border-border/90'
            : variant === 'message'
                ? 'border-transparent bg-bg-messagebubble-user'
                : 'border-0 bg-bg-messagebubble-user hover:bg-bg-messagebubble-user'
    const removePositionClass = 'right-1.5 top-1/2 -translate-y-1/2'
    const removeVisibilityClass = variant === 'memory'
        ? 'ui-fast opacity-0 group-hover:opacity-100'
        : 'opacity-100'

    const card = (
        <div
            role="listitem"
            className={clsx(
                'ui-fast group relative flex shrink-0 select-none items-center gap-2 border transition-colors',
                isMemory ? 'gap-1.5 rounded-3xl' : 'rounded-xl',
                cardSizeClass,
                variantClass,
                (onClick || isMemory) ? 'ui-press cursor-pointer' : undefined,
                className,
            )}
            title={item.name}
            onClick={() => onClick?.(item)}
            draggable={draggable}
            onDragStart={(event) => onDragStart?.(event, item)}
            onDragOver={(event) => onDragOver?.(event, item)}
            onDrop={(event) => onDrop?.(event, item)}
            onDragEnd={(event) => onDragEnd?.(event, item)}
        >
            <div
                className={clsx('relative grid shrink-0 place-items-center text-white', iconWrapClass)}
                style={{ backgroundColor: style.colorHex }}
            >
                <style.icon className={clsx(iconClass, 'text-white')} />
                {uploading ? (
                    <div className={clsx(
                        'absolute inset-0 grid place-items-center bg-black/25',
                        'rounded-lg',
                    )}
                    >
                        <Loader2 className={clsx(iconOverlayClass, 'animate-spin text-white/90')} />
                    </div>
                ) : null}
            </div>

            <div className={clsx("min-w-0", isMemory ? "shrink-0" : "flex-1")}>
                <div className={clsx(isMemory ? 'whitespace-nowrap text-tx' : 'truncate text-tx/95', textPrimary)}>
                    {item.name}
                </div>
                {isMemory ? null : (
                    <div className={clsx(
                        'truncate',
                        textSecondary,
                        hasError ? 'text-[var(--error-fg)]' : 'text-tx/65',
                    )}
                    >
                        {uploading ? 'Uploading...' : hasError ? 'Failed' : style.label}
                    </div>
                )}
            </div>

            {allowRemove ? (
                <button
                    type="button"
                    aria-label={`Remove ${item.name}`}
                    onClick={(event: MouseEvent<HTMLButtonElement>) => {
                        event.stopPropagation()
                        onRemove?.(item.id)
                    }}
                    className={clsx(
                        isMemory
                            ? 'ui-fast ui-press grid h-4 w-4 shrink-0 place-items-center rounded-md cursor-pointer text-tx hover:bg-bg-iconbutton-button-hover'
                            : clsx(
                                'ui-fast ui-press absolute grid place-items-center rounded-md transition-opacity',
                                removePositionClass,
                                isSmall ? 'h-4 w-4' : 'h-5 w-5',
                                'cursor-pointer text-tx/55 hover:bg-bg-iconbutton-button-hover hover:text-tx',
                                removeVisibilityClass,
                            ),
                    )}
                >
                    <X className={clsx(isSmall ? 'h-2.5 w-2.5' : 'h-3 w-3')} />
                </button>
            ) : null}
        </div>
    )

    if (!tooltip) return card
    return (
        <Tooltip>
            <TooltipTrigger asChild>{card}</TooltipTrigger>
            <TooltipContent side="top" sideOffset={6}>
                {tooltip}
            </TooltipContent>
        </Tooltip>
    )
}
