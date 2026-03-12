// src/pages/settings/model/components/ModelRow.tsx
import clsx from 'clsx'
import { Settings } from 'lucide-react'
import { Switch } from '@/shared/ui/switch'
import CapabilityStrip from './CapabilityStrip'
import ModelAvatar from './ModelAvatar'

export type ModelCapabilities = {
    vision?: boolean
    tools?: boolean
    reasoning?: boolean
    nativeSearch?: boolean
}

export default function ModelRow({
    modelId,
    label,
    providerId,
    modelIcon,
    enabled,
    onToggleEnabled,
    onOpenSettings,
    capabilities,
}: {
    modelId: string
    label: string
    providerId: string
    modelIcon?: string
    enabled: boolean
    onToggleEnabled: () => void
    onOpenSettings: () => void
    capabilities: ModelCapabilities
}) {
    return (
        <div
            className={clsx(
                'h-10 flex items-center justify-between gap-4 px-3 transition-colors',
                'hover:bg-bg-sidebar-button-hover/40',
                enabled ? 'text-tx' : 'text-tx/55'
            )}
        >
            <div className="min-w-0 flex items-center gap-3">
                <ModelAvatar modelId={modelId} label={label} providerId={providerId} modelIcon={modelIcon} size={24} />

                <div className="min-w-0 flex items-center gap-3">
                    <div className="min-w-0 truncate text-xs text-tx">{label}</div>
                    <div className="shrink-0">
                        <CapabilityStrip capabilities={capabilities} />
                    </div>
                </div>
            </div>

            <div className="shrink-0 flex items-center gap-2">
                <button
                    type="button"
                    onClick={onOpenSettings}
                    aria-label={`Open settings for ${label}`}
                    className="h-7 w-7 grid place-items-center text-tx/55 hover:text-tx transition cursor-pointer select-none"
                >
                    <Settings className="h-4 w-4" />
                </button>

                <Switch
                    className="cursor-pointer"
                    checked={enabled}
                    onCheckedChange={() => onToggleEnabled()}
                    aria-label={enabled ? 'Disable model' : 'Enable model'}
                />
            </div>
        </div>
    )
}
