// src/pages/settings/model/components/CapabilityStrip.tsx
import { useMemo } from 'react'
import type { LucideIcon } from 'lucide-react'
import { Brain, Eye, Globe, Wrench } from 'lucide-react'
import type { ModelCapabilities } from './ModelRow'
import CapabilityIcon from './CapabilityIcon'

type CapKey = 'vision' | 'tools' | 'reasoning' | 'search'

export default function CapabilityStrip({ capabilities }: { capabilities: ModelCapabilities }) {
    const caps = useMemo(() => {
        const vision = !!capabilities.vision
        const tools = !!capabilities.tools
        const reasoning = !!capabilities.reasoning
        const search = !!capabilities.nativeSearch

        const items: Array<{ key: CapKey; label: string; icon: LucideIcon; bg: string; fg: string }> = []
        if (vision) {
            items.push({
                key: 'vision',
                label: 'Vision',
                icon: Eye,
                bg: 'var(--color-capability-vision-bg)',
                fg: 'var(--color-capability-vision-fg)',
            })
        }
        if (tools) {
            items.push({
                key: 'tools',
                label: 'Tools',
                icon: Wrench,
                bg: 'var(--color-capability-tools-bg)',
                fg: 'var(--color-capability-tools-fg)',
            })
        }
        if (reasoning) {
            items.push({
                key: 'reasoning',
                label: 'Reasoning',
                icon: Brain,
                bg: 'var(--color-capability-reasoning-bg)',
                fg: 'var(--color-capability-reasoning-fg)',
            })
        }
        if (search) {
            items.push({
                key: 'search',
                label: 'Search',
                icon: Globe,
                bg: 'var(--color-capability-search-bg)',
                fg: 'var(--color-capability-search-fg)',
            })
        }

        return items
    }, [capabilities])

    // If there are no capabilities at all, render nothing to keep the row clean
    if (caps.length === 0) return null

    return (
        <div className="flex items-center gap-1">
            {caps.map((c) => (
                <CapabilityIcon key={c.key} icon={c.icon} label={c.label} bg={c.bg} fg={c.fg} />
            ))}
        </div>
    )
}
