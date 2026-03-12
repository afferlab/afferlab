import {
    DEFAULT_ATTACHMENT_LIMITS,
    EXT_TO_MIME_FALLBACK,
    GLOBAL_SUPPORTED_MIME_TYPES,
    PROVIDER_ATTACHMENT_CAPS_OVERRIDES,
} from '../electron/core/attachments/attachmentPolicy'

function uniqueSorted(values: string[]): string[] {
    return Array.from(new Set(values)).sort((a, b) => a.localeCompare(b))
}

function collectExtByMimePrefix(prefix: string): string[] {
    return uniqueSorted(
        Object.entries(EXT_TO_MIME_FALLBACK)
            .filter(([, mime]) => mime.startsWith(prefix))
            .map(([ext]) => ext),
    )
}

function collectExtByMimeExact(mime: string): string[] {
    return uniqueSorted(
        Object.entries(EXT_TO_MIME_FALLBACK)
            .filter(([, value]) => value === mime)
            .map(([ext]) => ext),
    )
}

const matrix = {
    limits: DEFAULT_ATTACHMENT_LIMITS,
    supportedMimeTypes: uniqueSorted(GLOBAL_SUPPORTED_MIME_TYPES),
    extensions: uniqueSorted(Object.keys(EXT_TO_MIME_FALLBACK)),
    categories: {
        image: collectExtByMimePrefix('image/'),
        audio: collectExtByMimePrefix('audio/'),
        video: collectExtByMimePrefix('video/'),
        document: uniqueSorted([
            ...collectExtByMimeExact('application/pdf'),
            ...collectExtByMimeExact('application/msword'),
            ...collectExtByMimeExact('application/vnd.openxmlformats-officedocument.wordprocessingml.document'),
        ]),
        spreadsheet: uniqueSorted([
            ...collectExtByMimeExact('application/vnd.ms-excel'),
            ...collectExtByMimeExact('application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'),
            ...collectExtByMimeExact('text/csv'),
        ]),
        text: uniqueSorted([
            ...collectExtByMimePrefix('text/'),
            ...collectExtByMimeExact('application/json'),
            ...collectExtByMimeExact('application/xml'),
        ]),
    },
    providerOverrides: PROVIDER_ATTACHMENT_CAPS_OVERRIDES,
}

console.log(JSON.stringify(matrix, null, 2))
