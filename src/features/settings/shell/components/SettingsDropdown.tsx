import clsx from "clsx"
import { ChevronDown } from "lucide-react"
import * as DropdownMenu from "@radix-ui/react-dropdown-menu"

import {
    settingsSelectContentClass,
    settingsSelectItemClass,
    settingsSelectTriggerClass,
} from "./selectMenuStyles"

type SettingsDropdownOption = {
    value: string
    label: string
    disabled?: boolean
}

type SettingsDropdownProps = {
    value: string
    options: SettingsDropdownOption[]
    onChange?: (value: string) => void
    placeholder?: string
    disabled?: boolean
    triggerClassName?: string
    contentClassName?: string
    align?: "start" | "center" | "end"
    side?: "top" | "right" | "bottom" | "left"
}

export default function SettingsDropdown({
    value,
    options,
    onChange,
    placeholder,
    disabled = false,
    triggerClassName,
    contentClassName,
    align = "start",
    side = "bottom",
}: SettingsDropdownProps) {
    const current = options.find((option) => option.value === value)
    const label = current?.label ?? placeholder ?? value
    const triggerDisabled = disabled || options.length === 0

    return (
        <DropdownMenu.Root>
            <DropdownMenu.Trigger asChild disabled={triggerDisabled}>
                <button
                    type="button"
                    disabled={triggerDisabled}
                    className={clsx(
                        settingsSelectTriggerClass,
                        "w-full select-none flex items-center justify-between gap-2",
                        triggerClassName
                    )}
                    title={label}
                >
                    <span className="min-w-0 flex-1 truncate text-left">{label}</span>
                    <span className="shrink-0 grid place-items-center">
                        <ChevronDown className="h-4 w-4 opacity-70" />
                    </span>
                </button>
            </DropdownMenu.Trigger>

            <DropdownMenu.Portal>
                <DropdownMenu.Content
                    forceMount
                    side={side}
                    align={align}
                    sideOffset={8}
                    className={clsx(settingsSelectContentClass, contentClassName)}
                >
                    {options.map((option) => (
                        <DropdownMenu.Item
                            key={option.value}
                            disabled={option.disabled}
                            onSelect={() => {
                                if (!option.disabled) onChange?.(option.value)
                            }}
                            className={clsx(settingsSelectItemClass, "select-none")}
                        >
                            {option.label}
                        </DropdownMenu.Item>
                    ))}
                </DropdownMenu.Content>
            </DropdownMenu.Portal>
        </DropdownMenu.Root>
    )
}
