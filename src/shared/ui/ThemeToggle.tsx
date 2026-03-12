"use client"

import { Laptop, Moon, Sun } from "lucide-react"
import { useThemeStore } from "@/features/settings/general/state/themeStore"
import { cn } from "@/shared/lib/utils"

const order: Array<"system" | "light" | "dark"> = ["system", "light", "dark"]

function nextTheme(current: "system" | "light" | "dark") {
    const idx = order.indexOf(current)
    return order[(idx + 1) % order.length]
}

export default function ThemeToggle() {
    const { theme, setTheme } = useThemeStore()

    const icon =
        theme === "light" ? (
            <Sun className="h-4 w-4" strokeWidth={2.6} />
        ) : theme === "dark" ? (
            <Moon className="h-4 w-4" strokeWidth={2.6} />
        ) : (
            <Laptop className="h-4 w-4" strokeWidth={2.6} />
        )

    return (
        <button
            type="button"
            onClick={() => {
                const next = nextTheme(theme)
                setTheme(next)
                window.chatAPI.settings
                    .updateApp({ theme_mode: next })
                    .catch(() => undefined)
            }}
            className={cn(
                "flex h-9 w-9 cursor-pointer items-center justify-center rounded-3xl border border-border/60",
                "ui-fast ui-press bg-bg-inputarea text-tx transition-colors hover:bg-bg-sidebar-button-hover",
                "[-webkit-app-region:no-drag]"
            )}
            aria-label="Toggle theme"
            title={`Theme: ${theme}`}
        >
            {icon}
        </button>
    )
}
