export type AttachmentRegistryKind =
    | 'document'
    | 'image'
    | 'audio'
    | 'video'
    | 'text'
    | 'code'
    | 'archive'
    | 'generic'

export type AttachmentRegistryEntry = {
    id: string
    kind: AttachmentRegistryKind
    label: string
    mimePatterns: string[]
    extensions: string[]
}
