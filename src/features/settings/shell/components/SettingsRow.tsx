import type { ReactNode } from "react"
import clsx from "clsx"
import { NavLink } from "react-router-dom"

type SettingsRowProps = {
    to?: string
    onClick?: () => void
    active?: boolean
    disabled?: boolean

    /** Pass content only; do not include sizing/background/radius because SettingsRow controls the shared appearance. */
    leading?: ReactNode

    label: ReactNode
    rightSlot?: ReactNode
    className?: string
}

function rowClass({
                      active,
                      disabled,
                      className,
                  }: {
    active: boolean
    disabled: boolean
    className?: string
}) {
    return clsx(
        // layout
        "w-full h-9 px-3 flex items-center gap-2 text-left",
        // shape + interaction
        "rounded-[100px] transition cursor-pointer select-none",
        // surface
        "active:bg-bg-sidebar-button-active",
        active ? "bg-bg-sidebar-button-active " : "hover:bg-bg-sidebar-button-hover",
        "active:scale-[0.99]",
        // border only when active (use shadow = 1px border without messing squircle corners)
        active && "shadow-[0_0_0_1px_var(--color-border)]",
        // disabled
        disabled && "opacity-50 cursor-not-allowed pointer-events-none",
        className
    )
}

function LeadingBox({ children }: { children?: ReactNode }) {
    if (!children) return null
    return (
        <span className="h-8 w-8 shrink-0 rounded-md grid place-items-center">
      {children}
    </span>
    )
}

export default function SettingsRow({
                                        to,
                                        onClick,
                                        active = false,
                                        disabled = false,
                                        leading,
                                        label,
                                        rightSlot,
                                        className,
                                    }: SettingsRowProps) {
    const content = (
        <>
            <LeadingBox>{leading}</LeadingBox>

            <div className="min-w-0 flex-1">
                <div className="truncate text-sm text-tx font-semibold">{label}</div>
            </div>

            {rightSlot ? <span className="shrink-0">{rightSlot}</span> : null}
        </>
    )

    if (to) {
        return (
            <NavLink
                to={to}
                className={({ isActive }) =>
                    rowClass({ active: isActive, disabled, className })
                }
            >
                {content}
            </NavLink>
        )
    }

    return (
        <button
            type="button"
            onClick={onClick}
            disabled={disabled}
            className={rowClass({ active, disabled, className })}
        >
            {content}
        </button>
    )
}
