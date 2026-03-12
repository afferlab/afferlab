// src/components/chat/ConversationItem.tsx
import { useState, useRef, useEffect } from 'react'
import ConversationMenu from './ConversationMenu'
import type { Conversation } from '@contracts'
import clsx from 'clsx'
import { motion } from 'framer-motion'
import { Wrench } from 'lucide-react'

interface Props {
    conversation: Conversation
    isHovered: boolean
    isSelected: boolean
    isDev?: boolean
    onHover: (id: string | null) => void
    onSelect: () => void
    onRename: (newTitle: string) => void
    onDelete: () => void
    onManage?: () => void
}

const itemLayoutTransition = {
    layout: {
        type: 'spring' as const,
        stiffness: 500,
        damping: 35,
    },
}

function stripDevSuffix(title: string): string {
    return title.replace(/\s*\(Dev\)$/, "")
}

export default function ConversationItem({
                                             conversation,
                                             isSelected,
                                             isDev = false,
                                             onHover,
                                             onSelect,
                                             onRename,
                                             onDelete,
                                             onManage,
                                         }: Props) {
    const [isEditing, setIsEditing] = useState(false)
    const [titleInput, setTitleInput] = useState(conversation.title)
    const [displayTitle, setDisplayTitle] = useState(conversation.title)
    const inputRef = useRef<HTMLInputElement>(null)
    const prevTitleRef = useRef(conversation.title)
    const animTokenRef = useRef(0)

    const sleep = (ms: number) => new Promise((res) => setTimeout(res, ms))

    useEffect(() => {
        if (isEditing && inputRef.current) {
            inputRef.current.focus()
            inputRef.current.select()
        }
    }, [isEditing])

    useEffect(() => {
        setTitleInput(conversation.title)
    }, [conversation.title])

    useEffect(() => {
        if (isEditing) {
            setDisplayTitle(conversation.title)
            prevTitleRef.current = conversation.title
            return
        }

        const prev = prevTitleRef.current
        const next = conversation.title
        const shouldAnimate =
            conversation.title_source === 'auto' &&
            prev === 'New conversation' &&
            next !== prev

        prevTitleRef.current = next

        if (!shouldAnimate) {
            setDisplayTitle(next)
            return
        }

        const token = ++animTokenRef.current
        const run = async () => {
            for (let i = prev.length; i >= 0; i--) {
                if (token !== animTokenRef.current) return
                setDisplayTitle(prev.slice(0, i))
                await sleep(18)
            }
            for (let i = 0; i <= next.length; i++) {
                if (token !== animTokenRef.current) return
                setDisplayTitle(next.slice(0, i))
                await sleep(18)
            }
        }
        void run()
        return () => {
            animTokenRef.current += 1
        }
    }, [conversation.title, conversation.title_source, isEditing])

    const save = () => {
        const next = titleInput?.trim() ?? ''
        if (next && next !== conversation.title) onRename(next)
        setIsEditing(false)
    }

    const visibleTitle = isDev ? stripDevSuffix(displayTitle) : displayTitle

    return (
        <motion.div
            layout
            transition={itemLayoutTransition}
            className={clsx(
                'group flex items-center gap-2',
                'h-9 rounded-[10px] px-3 text-sm',
                'cursor-pointer select-none',
                'ui-fast ui-press transition-colors',
                isSelected ? 'bg-bg-sidebar-button-active' : 'hover:bg-bg-sidebar-button-hover'
            )}
            onMouseEnter={() => onHover(conversation.id)}
            onMouseLeave={() => onHover(null)}
            onClick={onSelect}
        >
            <div className="min-w-0 flex-1">
                {isEditing ? (
                    <input
                        ref={inputRef}
                        value={titleInput ?? ''}
                        onChange={(e) => setTitleInput(e.target.value)}
                        onKeyDown={(e) => {
                            if (e.key === 'Enter') save()
                            if (e.key === 'Escape') setIsEditing(false)
                        }}
                        onBlur={save}
                        onClick={(e) => e.stopPropagation()}
                        className={clsx(
                            'w-full',
                            'bg-bg-sidebar-button-hover',
                            'border border-border',
                            'rounded-lg px-2 py-1',
                            'text-tx outline-none',
                            'placeholder:opacity-50'
                        )}
                        placeholder="Untitled"
                    />
                ) : (
                    <div className="truncate text-tx leading-5">
                        {visibleTitle || 'Untitled'}
                    </div>
                )}
            </div>

            {isDev ? (
                <span
                    className="shrink-0 grid h-5 w-5 place-items-center text-tx/70"
                    aria-label="Dev conversation"
                    title="Dev conversation"
                >
                    <Wrench className="h-3.5 w-3.5" />
                </span>
            ) : null}

            <div
                className={clsx(
                    'shrink-0',
                    'opacity-0 translate-x-1',
                    'group-hover:opacity-100 group-hover:translate-x-0',
                    'ui-base transition-[opacity,transform]'
                )}
                onClick={(e) => e.stopPropagation()}
            >
                <ConversationMenu
                    onRename={() => setIsEditing(true)}
                    onDelete={onDelete}
                    onManage={onManage}
                    isDev={isDev}
                />
            </div>
        </motion.div>
    )
}
