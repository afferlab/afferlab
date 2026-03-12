export function toError(err: unknown): Error {
    if (err instanceof Error) return err
    return new Error(typeof err === 'string' ? err : JSON.stringify(err))
}

export async function withErrorHandling<T>(fn: () => Promise<T>): Promise<T> {
    try {
        return await fn()
    } catch (err) {
        throw toError(err)
    }
}
