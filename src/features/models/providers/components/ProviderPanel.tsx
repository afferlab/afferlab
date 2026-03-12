// src/pages/settings/model/components/ProviderPanel.tsx
import ApiHostSection from './ApiHostSection'
import ApiKeySection from './ApiKeySection'
import ModelsSection from './ModelsSection'
import type { ProviderItem } from '../utils/providers'
import { ExternalLink } from 'lucide-react'
import { ProviderIcon } from './ProviderIcon'

export default function ProviderPanel({ provider }: { provider: ProviderItem }) {
    const isLocalProvider = provider.id === 'ollama' || provider.id === 'lmstudio'
    const website = provider.website ?? null

    return (
        <section className="min-h-0 h-full flex-1 overflow-y-auto scrollbar-hidden">
            <div className="px-5">
                {/* Header */}
                <div className="flex items-center gap-3 pt-3 pb-2">
                    <ProviderIcon providerId={provider.id} size={32} className="shrink-0" />

                    {/* Title */}
                    <div className="text-xl text-tx font-semibold select-none">{provider.label}</div>

                    {website && (
                        <button
                            type="button"
                            className="text-tx/70 hover:text-tx [-webkit-app-region:no-drag] cursor-pointer transition inline-flex items-center"
                            title="Open provider website"
                            onClick={() => {
                                void window.chatAPI.openExternal(website)
                            }}
                        >
                            <ExternalLink className="w-4 h-4" />
                        </button>
                    )}
                </div>

                {/* Sections */}
                <div className="mt-5 space-y-6 mb-3">
                    <ApiKeySection providerId={provider.id} optional={isLocalProvider} />
                    <ApiHostSection key={provider.id} providerId={provider.id} />
                    <ModelsSection providerId={provider.id} />
                </div>
            </div>
        </section>
    )
}
