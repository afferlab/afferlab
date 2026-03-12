// src/components/chat/ConversationMenu.tsx
import * as DropdownMenu from '@radix-ui/react-dropdown-menu'
import { DotsHorizontalIcon } from '@radix-ui/react-icons'
import clsx from 'clsx'

interface ConversationMenuProps {
    onRename: () => void
    onDelete?: () => void
    onManage?: () => void
    isDev?: boolean
}

export default function ConversationMenu({
    onRename,
    onDelete,
    onManage,
    isDev = false,
}: ConversationMenuProps) {
    return (
        <DropdownMenu.Root>
            <DropdownMenu.Trigger asChild>
                <button
                    type="button"
                    className={clsx(
                        'h-7 w-7 grid place-items-center rounded-md',
                        'text-tx/70 hover:text-tx cursor-pointer',
                        'hover:bg-bg-iconbutton-button-hover',
                        'ui-fast ui-press transition-colors'
                    )}
                    onClick={(e) => e.stopPropagation()}
                    aria-label="Conversation menu"
                    title="More"
                >
                    <DotsHorizontalIcon className="w-4 h-4" />
                </button>
            </DropdownMenu.Trigger>

            <DropdownMenu.Portal>
                <DropdownMenu.Content
                    forceMount
                    sideOffset={6}
                    className={clsx(
                        'ui-panel-motion',
                        'z-50 min-w-[160px] overflow-hidden rounded-xl',
                        'border border-border bg-bg-chatarea',
                        'shadow-lg'
                    )}
                >
                    <DropdownMenu.Item
                        onSelect={onRename}
                        className={clsx(
                            'ui-fast',
                            'px-3 py-2 text-[13px] font-semibold text-tx cursor-pointer outline-none',
                            'hover:bg-bg-sidebar-button-hover transition-colors'
                        )}
                    >
                        Rename
                    </DropdownMenu.Item>

                    {isDev ? (
                        <DropdownMenu.Item
                            onSelect={onManage}
                            className={clsx(
                                'ui-fast',
                                'px-3 py-2 text-[13px] font-semibold text-tx cursor-pointer outline-none',
                                'hover:bg-bg-sidebar-button-hover transition-colors'
                            )}
                        >
                            Manage Strategy…
                        </DropdownMenu.Item>
                    ) : (
                        <>
                            <DropdownMenu.Separator className="h-px bg-border" />
                            <DropdownMenu.Item
                                onSelect={onDelete}
                                className={clsx(
                                    'ui-fast',
                                    'px-3 py-2 text-[13px] font-semibold cursor-pointer outline-none',
                                    'text-rose-400 hover:bg-bg-sidebar-button-hover transition-colors'
                                )}
                            >
                                Delete
                            </DropdownMenu.Item>
                        </>
                    )}
                </DropdownMenu.Content>
            </DropdownMenu.Portal>
        </DropdownMenu.Root>
    )
}
