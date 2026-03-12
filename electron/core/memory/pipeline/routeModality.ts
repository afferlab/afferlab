import type { Modality } from '../../../../contracts/index'

export function resolveMediaModality(mime: string, filename: string): Modality | null {
    const lowerMime = mime.toLowerCase()
    if (lowerMime.startsWith('image/')) return 'image'
    if (lowerMime.startsWith('audio/')) return 'audio'
    if (lowerMime.startsWith('video/')) return 'video'

    const lowerName = filename.toLowerCase()
    if (/\.(png|jpe?g|webp|gif|bmp|heic|heif|tiff?)$/.test(lowerName)) return 'image'
    if (/\.(mp3|wav|m4a|flac|aac|ogg|opus)$/.test(lowerName)) return 'audio'
    if (/\.(mp4|mov|webm|mkv|avi|m4v)$/.test(lowerName)) return 'video'
    return null
}
