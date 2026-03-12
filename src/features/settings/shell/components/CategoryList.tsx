// src/pages/settings/components/CategoryList.tsx
import clsx from "clsx"
import { Link } from "react-router-dom"
import { ArrowLeft } from "lucide-react"
import { Squircle } from "corner-smoothing"
import type { SettingsNavItem } from "../constants"
import SettingsRow from "./SettingsRow"
import SettingsList from "./SettingsList"
import SettingsDivider from "./SettingsDivider"

type Props = {
    categories: SettingsNavItem[]
}

export default function CategoryList({ categories }: Props) {
    return (
        <Squircle
            cornerRadius={18}
            cornerSmoothing={0.8}
            className="h-full w-[248px] p-[1px] bg-[rgba(255,255,255,0.10)]"
            style={{ overflow: "hidden" }}
        >
            <Squircle
                cornerRadius={17}
                cornerSmoothing={0.8}
                className="h-full w-full"
                style={{ overflow: "hidden" }}
            >
                <aside className="h-full flex flex-col bg-bg-sidebar">
                    <div className="h-12 [-webkit-app-region:drag]" />

                    <SettingsList>
                        {categories.map((c) => {
                            if (c.type === "divider") {
                                return <SettingsDivider key={c.id} label={c.label} />
                            }

                            const Icon = c.icon
                            return (
                                <SettingsRow
                                    key={c.id}
                                    to={c.path}
                                    leading={<Icon className="h-5 w-5 opacity-80" />}
                                    label={c.label}
                                />
                            )
                        })}
                    </SettingsList>

                    <div className="px-3 py-3 border-t border-border">
                        <Link
                            to="/"
                            className={clsx(
                                "w-full flex select-none items-center gap-2",
                                "h-9 rounded-xl px-3",
                                "text-sm text-tx",
                                "hover:bg-bg-sidebar-button-hover active:scale-[0.99]",
                                "transition"
                            )}
                        >
                            <ArrowLeft className="w-4 h-4 opacity-80" />
                            <span>Back to chat</span>
                        </Link>
                    </div>
                </aside>
            </Squircle>
        </Squircle>
    )
}
