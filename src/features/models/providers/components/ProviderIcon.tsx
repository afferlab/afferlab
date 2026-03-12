import clsx from 'clsx'
import { Bot } from 'lucide-react'
import { getProviderIconComponent } from '../utils/providerIconMap'

export function ProviderIcon({
    providerId,
    className,
    size = 20,
}: {
    providerId: string
    className?: string
    size?: number
}) {
    const Icon = getProviderIconComponent(providerId)
    const iconSize = typeof size === 'number' ? size : Number(size) || 20

    if (Icon?.Avatar) {
        return (
            <Icon.Avatar
                size={iconSize}
                className={className}
                title={providerId}
            />
        )
    }

    return (
        <div
            className={clsx(
                'grid place-items-center rounded-md bg-bg-field text-tx/70',
                className
            )}
            style={{ width: iconSize, height: iconSize }}
            title={providerId}
        >
            <Bot size={Math.round(iconSize * 0.7)} />
        </div>
    )
}
