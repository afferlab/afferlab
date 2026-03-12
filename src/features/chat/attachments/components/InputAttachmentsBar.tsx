import type { TurnAttachment } from '@contracts'
import AttachmentList, { type AttachmentIssue } from '@/features/chat/attachments/components/AttachmentList'

type InputAttachmentsBarProps = {
    attachments: TurnAttachment[]
    issues: Record<string, AttachmentIssue>
    onRemove: (id: string) => void
}

export type { AttachmentIssue }

export default function InputAttachmentsBar({
    attachments,
    issues,
    onRemove,
}: InputAttachmentsBarProps) {
    return (
        <AttachmentList
            attachments={attachments}
            issues={issues}
            onRemove={onRemove}
            variant="composer"
            showRemove
        />
    )
}
