import { create } from 'zustand';

type Theme = 'light' | 'dark' | 'system';

interface ThemeStore {
    theme: Theme;
    toggle: () => void;
    setTheme: (theme: Theme) => void;
}

function resolveInitialTheme(): Theme {
    const stored = localStorage.getItem('theme');
    if (stored === 'light' || stored === 'dark' || stored === 'system') return stored;
    return 'system';
}

export const useThemeStore = create<ThemeStore>((set) => ({
    theme: resolveInitialTheme(),
    toggle: () =>
        set((state) => {
            const next = state.theme === 'dark' ? 'light' : 'dark';
            localStorage.setItem('theme', next);
            return { theme: next };
        }),
    setTheme: (theme) => {
        localStorage.setItem('theme', theme);
        set({ theme });
    },
}));
