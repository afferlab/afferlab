"use client";

import { useEffect } from "react";
import { useThemeStore } from "@/features/settings/general/state/themeStore";

export default function ThemeProvider({
                                          children,
                                      }: {
    children: React.ReactNode;
}) {
    const { theme } = useThemeStore(); // "light" | "dark"

    useEffect(() => {
        const root = document.documentElement;
        const media = window.matchMedia("(prefers-color-scheme: dark)");

        const applyTheme = (next: "light" | "dark") => {
            root.classList.toggle("dark", next === "dark");
            root.style.colorScheme = next;
        };

        const resolve = () => (theme === "system" ? (media.matches ? "dark" : "light") : theme);

        applyTheme(resolve());
        void window.electronAPI?.setTheme(theme).catch(() => undefined);

        if (theme !== "system") return;

        const handleChange = (event: MediaQueryListEvent) => {
            applyTheme(event.matches ? "dark" : "light");
        };

        if (media.addEventListener) {
            media.addEventListener("change", handleChange);
            return () => media.removeEventListener("change", handleChange);
        }
        media.addListener(handleChange);
        return () => media.removeListener(handleChange);
    }, [theme]);

    return <>{children}</>;
}
