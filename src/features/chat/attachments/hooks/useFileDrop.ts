import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import type { DragEvent as ReactDragEvent, HTMLAttributes } from 'react'

type FileDropHandler = (files: File[]) => void | Promise<void>

type UseFileDropOptions = {
    enabled?: boolean
    onFiles: FileDropHandler
}

type DropZoneProps<T extends HTMLElement> = Pick<
    HTMLAttributes<T>,
    'onDragEnter' | 'onDragOver' | 'onDragLeave' | 'onDrop'
>

function hasFiles(event: ReactDragEvent<HTMLElement>): boolean {
    const types = event.dataTransfer?.types
    if (!types || types.length === 0) return false
    return Array.from(types).includes('Files')
}

export function useFileDrop<T extends HTMLElement = HTMLElement>(
    options: UseFileDropOptions,
): {
    isDraggingOver: boolean
    dropZoneProps: DropZoneProps<T>
} {
    const enabled = options.enabled ?? true
    const onFiles = options.onFiles
    const dragDepthRef = useRef(0)
    const [isDraggingOver, setIsDraggingOver] = useState(false)

    const reset = useCallback(() => {
        dragDepthRef.current = 0
        setIsDraggingOver(false)
    }, [])

    useEffect(() => {
        if (!isDraggingOver) return

        const resetOnWindowEvent = () => reset()

        window.addEventListener('dragend', resetOnWindowEvent)
        window.addEventListener('drop', resetOnWindowEvent)
        window.addEventListener('blur', resetOnWindowEvent)
        document.addEventListener('visibilitychange', resetOnWindowEvent)

        return () => {
            window.removeEventListener('dragend', resetOnWindowEvent)
            window.removeEventListener('drop', resetOnWindowEvent)
            window.removeEventListener('blur', resetOnWindowEvent)
            document.removeEventListener('visibilitychange', resetOnWindowEvent)
        }
    }, [isDraggingOver, reset])

    const onDragEnter = useCallback((event: ReactDragEvent<T>) => {
        if (event.defaultPrevented) return
        if (!enabled || !hasFiles(event as ReactDragEvent<HTMLElement>)) return
        event.preventDefault()
        dragDepthRef.current += 1
        setIsDraggingOver(true)
    }, [enabled])

    const onDragOver = useCallback((event: ReactDragEvent<T>) => {
        if (event.defaultPrevented) return
        if (!enabled || !hasFiles(event as ReactDragEvent<HTMLElement>)) return
        event.preventDefault()
        event.dataTransfer.dropEffect = 'copy'
        if (!isDraggingOver) setIsDraggingOver(true)
    }, [enabled, isDraggingOver])

    const onDragLeave = useCallback((event: ReactDragEvent<T>) => {
        if (!enabled || !hasFiles(event as ReactDragEvent<HTMLElement>)) return
        event.preventDefault()
        const related = event.relatedTarget as Node | null
        if (related && event.currentTarget.contains(related)) return
        dragDepthRef.current = Math.max(0, dragDepthRef.current - 1)
        if (dragDepthRef.current === 0) setIsDraggingOver(false)
    }, [enabled])

    const onDrop = useCallback((event: ReactDragEvent<T>) => {
        if (!enabled) {
            reset()
            return
        }
        if (event.defaultPrevented) {
            reset()
            return
        }
        if (!hasFiles(event as ReactDragEvent<HTMLElement>)) {
            reset()
            return
        }
        event.preventDefault()
        event.dataTransfer.dropEffect = 'copy'
        const files = Array.from(event.dataTransfer.files ?? [])
        reset()
        if (files.length === 0) return
        void onFiles(files)
    }, [enabled, onFiles, reset])

    const dropZoneProps = useMemo<DropZoneProps<T>>(() => ({
        onDragEnter,
        onDragOver,
        onDragLeave,
        onDrop,
    }), [onDragEnter, onDragLeave, onDragOver, onDrop])

    return {
        isDraggingOver,
        dropZoneProps,
    }
}
