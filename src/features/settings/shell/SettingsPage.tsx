// src/pages/settings/SettingsPage.tsx
import CategoryList from './components/CategoryList'
import { Outlet } from 'react-router-dom'
import { CATEGORIES } from './constants'
import { Squircle } from "corner-smoothing"

export default function SettingsPage() {
    return (
        <div className="h-screen w-screen bg-transparent">
            <Squircle
                cornerRadius={20}
                cornerSmoothing={0.8}
                className="flex h-full w-full"
            >
                <div className="flex h-full w-full pt-2 pb-2 pl-2 overflow-hidden bg-bg-chatarea">
                    {/* Left side: shared sidebar style */}
                    <CategoryList categories={CATEGORIES} />

                    {/* Right side: render different content by route */}
                    <div className="flex-1 min-w-0 min-h-0">
                        <div className="h-full bg-bg-sidebar">
                            <Outlet />
                        </div>
                    </div>
                </div>
            </Squircle>
        </div>
    )
}
