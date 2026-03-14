export function isRetryableFileReferenceError(args: {
    errorCode?: string
    errorMessage?: string
    fallbackText?: string
}): boolean {
    const code = (args.errorCode ?? '').trim().toUpperCase()
    if (
        code === 'OPENAI_FILE_REFERENCE_INVALID'
        || code === 'INVALID_FILE'
        || code === 'INVALID_FILE_ID'
        || code === 'FILE_NOT_FOUND'
        || code === 'EXPIRED_FILE'
    ) return true
    const hay = `${args.errorMessage ?? ''}\n${args.fallbackText ?? ''}`.toLowerCase()
    const hasFileContext = hay.includes('file') || hay.includes('input_file') || hay.includes('file_id')
    if (!hasFileContext) return false
    if (hay.includes('openai_file_reference_invalid')) return true
    if (hay.includes('invalid_file')) return true
    if (hay.includes('invalid_file_id')) return true
    if (hay.includes('expired_file')) return true
    if (hay.includes('file_not_found')) return true
    if (hay.includes('file not found')) return true
    if (hay.includes('unknown file')) return true
    if (hay.includes('does not exist')) return true
    if (hay.includes('404')) return true
    return false
}
