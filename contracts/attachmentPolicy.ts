import type { TurnAttachment, TurnAttachmentKind } from './attachment'

export type AttachmentPolicyLimits = {
    maxFilesPerTurn: number
    maxFileSizeMB: number
}

export type AttachmentIconName =
    | 'image'
    | 'audio'
    | 'video'
    | 'pdf'
    | 'doc'
    | 'sheet'
    | 'slide'
    | 'code'
    | 'text'
    | 'json'
    | 'archive'
    | 'file'

export type AttachmentUIDescriptor = {
    iconName: AttachmentIconName
    colorToken: 'red' | 'orange' | 'amber' | 'blue' | 'green' | 'gray' | 'neutral'
    label: string
}
export type { TurnAttachment, TurnAttachmentKind }
