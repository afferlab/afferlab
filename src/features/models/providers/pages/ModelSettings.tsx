// src/pages/settings/model/ModelSettings.tsx
import { useCallback, useEffect, useMemo, useState } from 'react'
import ProviderSidebar from '../components/ProviderSidebar'
import ProviderPanel from '../components/ProviderPanel'
import { PROVIDERS, type ProviderId } from '../utils/providers'

export default function ModelSettings() {
    const [activeProviderId, setActiveProviderId] = useState<ProviderId>(
        PROVIDERS[0]?.id ?? 'ollama'
    )
    const [loadedByProvider, setLoadedByProvider] = useState<Partial<Record<ProviderId, boolean>>>({})

    const activeProvider = useMemo(() => {
        return PROVIDERS.find((p) => p.id === activeProviderId) ?? PROVIDERS[0]
    }, [activeProviderId])

    const refreshLoadedByProvider = useCallback(async () => {
        const [models, settings] = await Promise.all([
            window.chatAPI.listModels(),
            window.chatAPI.settings.get(),
        ])
        const knownProviders = new Set<ProviderId>(PROVIDERS.map((provider) => provider.id))
        const providerByModelId = new Map<string, ProviderId>()
        for (const model of models) {
            const providerId = model.provider as ProviderId
            if (!knownProviders.has(providerId)) continue
            providerByModelId.set(model.id, providerId)
        }

        const nextLoadedByProvider: Partial<Record<ProviderId, boolean>> = {}
        for (const row of settings.modelOverrides ?? []) {
            let requirements: Record<string, unknown> = {}
            try {
                const parsed = JSON.parse(row.requirements_json) as unknown
                if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
                    requirements = parsed as Record<string, unknown>
                }
            } catch {
                requirements = {}
            }
            if (requirements.favorite !== true) continue
            const providerId = providerByModelId.get(row.model_id)
            if (providerId) nextLoadedByProvider[providerId] = true
        }

        setLoadedByProvider(nextLoadedByProvider)
    }, [])

    useEffect(() => {
        void refreshLoadedByProvider()
    }, [refreshLoadedByProvider])

    useEffect(() => {
        const onUpdate = () => {
            void refreshLoadedByProvider()
        }
        window.chatAPI.onModelsUpdated(() => onUpdate())
        return () => {
            window.chatAPI.removeModelsUpdatedListener()
        }
    }, [refreshLoadedByProvider])

    return (
        <div className="h-full min-h-0 flex flex-col bg-bg-chatarea">
            {/* Header + Divider in same padded container */}
            <div className="px-5">
                <div className="h-12 [-webkit-app-region:drag] pt-4">
                    <div className="text-xl text-tx font-semibold select-none">Model</div>
                </div>
                <div className="mt-1 border-b border-border" />
            </div>

            {/* Content */}
            <div className="min-h-0 flex-1 flex">
                <ProviderSidebar
                    providers={PROVIDERS}
                    activeId={activeProviderId}
                    onSelect={setActiveProviderId}
                    loadedByProvider={loadedByProvider}
                />
                <div className="min-h-0 flex-1 overflow-hidden">
                    <ProviderPanel provider={activeProvider} />
                </div>
            </div>
        </div>
    )
}
