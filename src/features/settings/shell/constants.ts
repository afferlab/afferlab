// src/pages/settings/constants.ts
import * as React from "react"

import {
    Cloud,
    SlidersHorizontal,
    Cpu,
    Wrench,
    Settings,
    Shield,
} from "lucide-react"

export type SettingsCategoryId =
    | "model"
    | "model-settings"
    | "strategy"
    | "tools"
    | "general"
    | "privacy"

export type SettingsCategory = {
    type: "item"
    id: SettingsCategoryId
    label: string
    icon: React.ComponentType<{ className?: string }>
    path: string
}

export type SettingsDividerItem = {
    type: "divider"
    id: string
    label?: string
}

export type SettingsNavItem = SettingsCategory | SettingsDividerItem

export const CATEGORIES: SettingsNavItem[] = [
    { type: "item", id: "model", label: "Model", icon: Cloud, path: "/settings/model" },
    { type: "item", id: "model-settings", label: "Model Settings", icon: SlidersHorizontal, path: "/settings/model-settings" },

    // Insert a divider here (no title)
    { type: "divider", id: "div-1" },

    { type: "item", id: "strategy", label: "Strategy", icon: Cpu, path: "/settings/strategy" },
    { type: "item", id: "tools", label: "Web Search", icon: Wrench, path: "/settings/web-search-settings" },

    // Insert another divider here (no title)
    { type: "divider", id: "div-2"},

    { type: "item", id: "general", label: "General", icon: Settings, path: "/settings/general" },
    { type: "item", id: "privacy", label: "Data & Privacy", icon: Shield, path: "/settings/privacy" },
]
// ---------------- Providers (keep your current entries here) ----------------

export type ProviderId =
    | "ollama"
    | "lmstudio"
    | "openai"
    | "gemini"
    | "anthropic"
    | "deepseek"

export type ProviderOption = {
    id: ProviderId
    label: string
    subtitle?: string
}

export const PROVIDERS: ProviderOption[] = [
    { id: "ollama", label: "Ollama", subtitle: "Local runtime" },
    { id: "lmstudio", label: "LM Studio", subtitle: "Local runtime" },
    { id: "openai", label: "OpenAI", subtitle: "API-based" },
    { id: "gemini", label: "Google", subtitle: "Gemini API" },
    { id: "anthropic", label: "Anthropic", subtitle: "Claude API" },
    { id: "deepseek", label: "DeepSeek", subtitle: "OpenAI-compatible" },
]

export const DEFAULT_HOSTS: Record<string, string> = {
    ollama: "http://127.0.0.1:11434",
    lmstudio: "http://127.0.0.1:1234/v1",
    gemini: "https://generativelanguage.googleapis.com",
    openai: "https://api.openai.com/v1",
    anthropic: "https://api.anthropic.com",
    deepseek: "https://api.deepseek.com/v1",
}

export const PROVIDER_BADGES: Record<string, string> = {
    ollama: "O",
    lmstudio: "L",
    openai: "O",
    gemini: "G",
    anthropic: "A",
    deepseek: "D",
}
