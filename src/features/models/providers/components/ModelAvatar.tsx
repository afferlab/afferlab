// src/pages/settings/model/components/ModelAvatar.tsx
import { ModelIcon } from '@lobehub/icons'

type ModelAvatarProps = {
    modelId?: string
    label: string
    providerId: string
    modelIcon?: string
    size?: number
}

export default function ModelAvatar({ modelId, label, providerId, modelIcon, size }: ModelAvatarProps) {
    const sizePx = size ?? 36
    const candidate = modelId ?? modelIcon ?? label ?? providerId
    const initial = (label ?? modelId ?? providerId).trim().charAt(0).toUpperCase() || '?'

    if (modelIcon === 'custom-model') {
        return (
            <div
                className="grid shrink-0 place-items-center rounded-full bg-black/8 text-black/70 dark:bg-white/12 dark:text-white/70"
                style={{ width: sizePx, height: sizePx }}
            >
                <span className="select-none text-[11px] font-semibold">{initial}</span>
            </div>
        )
    }

    return (
        <ModelIcon
            model={candidate}
            type="avatar"
            shape="circle"
            size={sizePx}
            className="shrink-0"
        />
    )
}
