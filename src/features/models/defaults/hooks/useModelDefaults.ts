import { useCallback, useEffect, useState } from 'react'
import type { ModelDefaultParams } from '@contracts'

const FALLBACK_DEFAULTS: ModelDefaultParams = {
    temperature: 0.7,
    top_p: 1,
    maxTokensTier: 'max',
}

export function useModelDefaults(): {
    params: ModelDefaultParams
    updateLocal: (patch: Partial<ModelDefaultParams>) => void
    commitPatch: (patch: Partial<ModelDefaultParams>) => Promise<void>
    loading: boolean
} {
    const [params, setParams] = useState<ModelDefaultParams>(FALLBACK_DEFAULTS)
    const [loading, setLoading] = useState(true)

    useEffect(() => {
        let cancelled = false
        window.chatAPI.settings.getModelDefaultParams()
            .then((next) => {
                if (cancelled) return
                setParams(next)
                setLoading(false)
            })
            .catch(() => {
                if (cancelled) return
                setParams(FALLBACK_DEFAULTS)
                setLoading(false)
            })
        return () => { cancelled = true }
    }, [])

    const updateLocal = useCallback((patch: Partial<ModelDefaultParams>) => {
        setParams((prev) => ({ ...prev, ...patch }))
    }, [])

    const commitPatch = useCallback(async (patch: Partial<ModelDefaultParams>) => {
        const next = await window.chatAPI.settings.setModelDefaultParams(patch)
        setParams(next)
    }, [])

    return { params, updateLocal, commitPatch, loading }
}
