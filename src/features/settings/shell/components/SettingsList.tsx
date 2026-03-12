// src/pages/settings/components/SettingsList.tsx
import clsx from "clsx"
import type { ReactNode } from "react"

export default function SettingsList({
                                         children,
                                         className,
                                         contentClassName,
                                     }: {
    children: ReactNode
    className?: string
    contentClassName?: string
}) {
    return (
        <div className={clsx("flex-1 overflow-y-auto scrollbar", className)}>
            <div className={clsx("px-3 py-3 flex flex-col gap-2", contentClassName)}>
                {children}
            </div>
        </div>
    )
}