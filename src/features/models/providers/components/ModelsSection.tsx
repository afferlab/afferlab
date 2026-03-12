// src/pages/settings/model/components/ModelsSection.tsx
import { useCallback, useEffect, useState } from 'react'
import { RefreshCw } from 'lucide-react'
import { toast } from 'sonner'
import {
    Dialog,
    DialogContent,
    DialogFooter,
    DialogHeader,
    DialogTitle,
} from '@/shared/ui/dialog'
import type { ProviderId } from '../utils/providers'
import { DEFAULT_HOSTS } from '../utils/providers'
import ModelRow from './ModelRow'
import type { LLMModelConfig } from '@contracts'

export default function ModelsSection({ providerId }: { providerId: ProviderId }) {
    const [models, setModels] = useState<LLMModelConfig[]>([])
    const [favoriteByModel, setFavoriteByModel] = useState<Record<string, boolean>>({})
    const [requirementsByModel, setRequirementsByModel] = useState<Record<string, Record<string, unknown>>>({})
    const [refreshing, setRefreshing] = useState(false)
    const [addDialogOpen, setAddDialogOpen] = useState(false)
    const [draftModelId, setDraftModelId] = useState('')
    const [draftModelName, setDraftModelName] = useState('')
    const [editDialogOpen, setEditDialogOpen] = useState(false)
    const [editingModel, setEditingModel] = useState<LLMModelConfig | null>(null)
    const [editDraftModelId, setEditDraftModelId] = useState('')
    const [editDraftModelName, setEditDraftModelName] = useState('')

    const isLocalProvider = providerId === 'ollama' || providerId === 'lmstudio'

    const sortProviderModels = useCallback((items: LLMModelConfig[]) => {
        return [...items].sort((left, right) => {
            const leftCustom = left.icon === 'custom-model'
            const rightCustom = right.icon === 'custom-model'
            if (leftCustom !== rightCustom) return leftCustom ? -1 : 1
            return 0
        })
    }, [])

    const loadModels = useCallback(async () => {
        const all = await window.chatAPI.listModels()
        setModels(sortProviderModels(all.filter((m) => m.provider === providerId)))
    }, [providerId, sortProviderModels])

    const checkOllamaReachable = useCallback(async () => {
        if (providerId !== 'ollama') return true
        const cfg = await window.chatAPI.getProvidersConfig()
        const host = (cfg.ollama?.apiHost ?? DEFAULT_HOSTS.ollama ?? '').trim().replace(/\/+$/, '')
        if (!host) return false
        const controller = new AbortController()
        const timeoutId = window.setTimeout(() => controller.abort(), 1000)
        try {
            const res = await fetch(`${host}/api/tags`, {
                method: 'GET',
                signal: controller.signal,
            })
            return res.ok
        } catch {
            return false
        } finally {
            window.clearTimeout(timeoutId)
        }
    }, [providerId])

    const refreshProviderModels = useCallback(async () => {
        if (!isLocalProvider) {
            await loadModels()
            return
        }
        setRefreshing(true)
        try {
            const refreshed = await window.chatAPI.refreshProviderModels(providerId)
            setModels(sortProviderModels(refreshed.filter((m) => m.provider === providerId)))
        } finally {
            setRefreshing(false)
        }
    }, [isLocalProvider, loadModels, providerId, sortProviderModels])

    const loadModelOverrides = useCallback(async () => {
        const snapshot = await window.chatAPI.settings.get()
        const nextFavorite: Record<string, boolean> = {}
        const nextRequirements: Record<string, Record<string, unknown>> = {}
        for (const row of snapshot.modelOverrides ?? []) {
            let requirements: Record<string, unknown> = {}
            try {
                const parsed = JSON.parse(row.requirements_json) as unknown
                if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
                    requirements = parsed as Record<string, unknown>
                }
            } catch {
                requirements = {}
            }
            nextRequirements[row.model_id] = requirements
            nextFavorite[row.model_id] = requirements.favorite === true
        }
        setFavoriteByModel(nextFavorite)
        setRequirementsByModel(nextRequirements)
    }, [])

    useEffect(() => {
        void loadModels()
        void loadModelOverrides()
    }, [loadModels, loadModelOverrides])

    useEffect(() => {
        if (!isLocalProvider) return
        void refreshProviderModels()
    }, [isLocalProvider, refreshProviderModels])

    const handleManualRefresh = useCallback(async () => {
        if (refreshing) return
        if (providerId === 'ollama') {
            const reachable = await checkOllamaReachable()
            if (!reachable) {
                toast.error('Ollama server not running — please start Ollama (ollama serve)', {
                    duration: 1000,
                    position: 'top-right',
                })
                return
            }
        }
        await refreshProviderModels()
    }, [checkOllamaReachable, providerId, refreshProviderModels, refreshing])

    const toggleModelEnabled = useCallback(async (modelId: string) => {
        const current = favoriteByModel[modelId] === true
        const nextEnabled = !current
        const nextRequirements = {
            ...(requirementsByModel[modelId] ?? {}),
            favorite: nextEnabled,
        }
        await window.chatAPI.settings.upsertModelOverride({
            modelId,
            requirements: nextRequirements,
        })
        setFavoriteByModel((prev) => ({ ...prev, [modelId]: nextEnabled }))
        setRequirementsByModel((prev) => ({ ...prev, [modelId]: nextRequirements }))
    }, [favoriteByModel, requirementsByModel])

    const resetAddModelDialog = useCallback(() => {
        setDraftModelId('')
        setDraftModelName('')
        setAddDialogOpen(false)
    }, [])

    const resetEditModelDialog = useCallback(() => {
        setEditingModel(null)
        setEditDraftModelId('')
        setEditDraftModelName('')
        setEditDialogOpen(false)
    }, [])

    const handleAddModel = useCallback(async () => {
        const modelId = draftModelId.trim()
        const modelName = draftModelName.trim()
        if (!modelId) {
            toast.error('Model ID is required', {
                duration: 1000,
                position: 'top-right',
            })
            return
        }

        try {
            const all = await window.chatAPI.addProviderModel({
                providerId,
                modelId,
                modelName: modelName || undefined,
            })
            setModels(sortProviderModels(all.filter((model) => model.provider === providerId)))
            resetAddModelDialog()
        } catch (error) {
            const message = error instanceof Error ? error.message : String(error)
            toast.error(message || 'Failed to add model', {
                duration: 1500,
                position: 'top-right',
            })
        }
    }, [draftModelId, draftModelName, providerId, resetAddModelDialog, sortProviderModels])

    const openEditDialog = useCallback((model: LLMModelConfig) => {
        setEditingModel(model)
        setEditDraftModelId(model.id)
        setEditDraftModelName(model.name ?? model.label ?? '')
        setEditDialogOpen(true)
    }, [])

    const handleSaveModelSettings = useCallback(async () => {
        if (!editingModel) return
        const nextModelId = editDraftModelId.trim()
        const modelName = editDraftModelName.trim()
        if (!nextModelId) {
            toast.error('Model ID is required', {
                duration: 1000,
                position: 'top-right',
            })
            return
        }
        try {
            const all = await window.chatAPI.updateProviderModel({
                providerId,
                modelId: editingModel.id,
                nextModelId,
                modelName: modelName || undefined,
            })
            setModels(sortProviderModels(all.filter((model) => model.provider === providerId)))
            resetEditModelDialog()
        } catch (error) {
            const message = error instanceof Error ? error.message : String(error)
            toast.error(message || 'Failed to update model', {
                duration: 1500,
                position: 'top-right',
            })
        }
    }, [editDraftModelId, editDraftModelName, editingModel, providerId, resetEditModelDialog, sortProviderModels])

    const handleDeleteModel = useCallback(async () => {
        if (!editingModel) return
        try {
            const all = await window.chatAPI.deleteProviderModel({
                providerId,
                modelId: editingModel.id,
            })
            setModels(sortProviderModels(all.filter((model) => model.provider === providerId)))
            resetEditModelDialog()
        } catch (error) {
            const message = error instanceof Error ? error.message : String(error)
            toast.error(message || 'Failed to delete model', {
                duration: 1500,
                position: 'top-right',
            })
        }
    }, [editingModel, providerId, resetEditModelDialog, sortProviderModels])

    return (
        <>
            <div>
                {/* Header */}
                <div className="flex items-center justify-between">
                    <div className="flex items-center gap-3">
                        <div className="text-tx text-sm font-extrabold select-none">Models</div>

                        <div className="w-5 h-5 select-none flex items-center justify-center text-xs text-tx/55 bg-bg-sidebar-button-hover/50 border border-border/60 rounded-full">
                            {models.length}
                        </div>

                        {isLocalProvider && (
                            <button
                                type="button"
                                onClick={() => void handleManualRefresh()}
                                disabled={refreshing}
                                title="Refresh local models"
                                className={(
                                    'h-6 w-6 inline-flex items-center justify-center rounded-md border border-transparent ' +
                                    'text-tx/60 hover:text-tx cursor-pointer disabled:opacity-50 disabled:cursor-wait'
                                )}
                            >
                                <RefreshCw className={refreshing ? 'h-3.5 w-3.5 animate-spin' : 'h-3.5 w-3.5'} />
                            </button>
                        )}
                    </div>
                </div>

                <div className="mt-3 overflow-hidden rounded-xl border border-border bg-bg-field">
                    {models.length > 0 ? (
                        <div>
                            {models.map((m) => {
                                const label = m.name ?? m.label ?? m.id
                                return (
                                    <ModelRow
                                        key={m.id}
                                        modelId={m.id}
                                        label={label}
                                        providerId={m.provider}
                                    modelIcon={m.icon}
                                    enabled={favoriteByModel[m.id] === true}
                                    capabilities={m.capabilities ?? {}}
                                    onToggleEnabled={() => toggleModelEnabled(m.id)}
                                    onOpenSettings={() => openEditDialog(m)}
                                />
                            )
                        })}
                        </div>
                    ) : (
                        <div className="px-4 py-4 text-sm text-tx/55">
                            No models found.
                        </div>
                    )}
                </div>

                <div className="mt-3 flex justify-start">
                    <button
                        type="button"
                        onClick={() => setAddDialogOpen(true)}
                        className="inline-flex h-8 items-center rounded-lg bg-black px-3 text-sm font-medium text-white transition hover:opacity-90 cursor-pointer select-none dark:bg-white dark:text-black"
                    >
                        + Add
                    </button>
                </div>
            </div>

            <Dialog open={addDialogOpen} onOpenChange={setAddDialogOpen}>
                <DialogContent className="max-w-sm border-0 bg-bg-chatarea p-0 text-tx shadow-2xl overflow-hidden">
                    <DialogHeader className="px-5 pt-5 pb-3">
                        <DialogTitle className="text-base font-semibold select-none">Add Model</DialogTitle>
                    </DialogHeader>

                    <div className="space-y-3 px-5 pb-5">
                        <label className="grid grid-cols-[96px_minmax(0,1fr)] items-center gap-3">
                            <span className="inline-flex items-center gap-1 text-sm font-medium text-tx select-none">
                                Model ID
                                <span className="text-red-500">*</span>
                            </span>
                            <input
                                type="text"
                                value={draftModelId}
                                onChange={(event) => setDraftModelId(event.target.value)}
                                placeholder="Required"
                                spellCheck={false}
                                className="h-9 w-full rounded-lg border-0 bg-bg-field px-3 text-sm text-tx outline-none placeholder:text-tx/35"
                            />
                        </label>

                        <label className="grid grid-cols-[96px_minmax(0,1fr)] items-center gap-3">
                            <span className="text-sm font-medium text-tx select-none">Model Name</span>
                            <input
                                type="text"
                                value={draftModelName}
                                onChange={(event) => setDraftModelName(event.target.value)}
                                placeholder="Optional"
                                spellCheck={false}
                                className="h-9 w-full rounded-lg border-0 bg-bg-field px-3 text-sm text-tx outline-none placeholder:text-tx/35"
                            />
                        </label>
                    </div>

                    <DialogFooter className="px-5 pb-5 sm:justify-end">
                        <button
                            type="button"
                            onClick={() => void handleAddModel()}
                            className="inline-flex h-9 items-center justify-center rounded-lg bg-black px-4 text-sm font-medium text-white transition hover:opacity-90 cursor-pointer select-none dark:bg-white dark:text-black"
                        >
                            Add Model
                        </button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>

            <Dialog open={editDialogOpen} onOpenChange={setEditDialogOpen}>
                <DialogContent className="max-w-sm border-0 bg-bg-chatarea p-0 text-tx shadow-2xl overflow-hidden">
                    <DialogHeader className="px-5 pt-5 pb-3">
                        <DialogTitle className="text-base font-semibold select-none">Model Settings</DialogTitle>
                    </DialogHeader>

                    <div className="space-y-3 px-5 pb-5">
                        <label className="grid grid-cols-[96px_minmax(0,1fr)] items-center gap-3">
                            <span className="inline-flex items-center gap-1 text-sm font-medium text-tx select-none">
                                Model ID
                                <span className="text-red-500">*</span>
                            </span>
                            <input
                                type="text"
                                value={editDraftModelId}
                                onChange={(event) => setEditDraftModelId(event.target.value)}
                                placeholder="Required"
                                spellCheck={false}
                                className="h-9 w-full rounded-lg border-0 bg-bg-field px-3 text-sm text-tx outline-none placeholder:text-tx/35"
                            />
                        </label>

                        <label className="grid grid-cols-[96px_minmax(0,1fr)] items-center gap-3">
                            <span className="text-sm font-medium text-tx select-none">Model Name</span>
                            <input
                                type="text"
                                value={editDraftModelName}
                                onChange={(event) => setEditDraftModelName(event.target.value)}
                                placeholder="Optional"
                                spellCheck={false}
                                className="h-9 w-full rounded-lg border-0 bg-bg-field px-3 text-sm text-tx outline-none placeholder:text-tx/35"
                            />
                        </label>
                    </div>

                    <DialogFooter className="px-5 pb-5 sm:justify-between">
                        <button
                            type="button"
                            onClick={() => void handleDeleteModel()}
                            className="inline-flex h-9 items-center justify-center rounded-lg bg-[var(--error-bg)] px-4 text-sm font-medium text-[var(--error-fg)] transition hover:bg-[var(--error-bg)]/90 cursor-pointer select-none"
                        >
                            Delete
                        </button>

                        <button
                            type="button"
                            onClick={() => void handleSaveModelSettings()}
                            className="inline-flex h-9 items-center justify-center rounded-lg bg-black px-4 text-sm font-medium text-white transition hover:opacity-90 cursor-pointer select-none dark:bg-white dark:text-black"
                        >
                            Save
                        </button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>
        </>
    )
}
