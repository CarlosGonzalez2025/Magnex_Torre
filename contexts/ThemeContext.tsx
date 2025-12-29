import React, { createContext, useContext, useState, useEffect, ReactNode } from 'react';

// =====================================================
// TYPES
// =====================================================

type Theme = 'light' | 'dark' | 'system';

interface ThemeContextType {
    theme: Theme;
    resolvedTheme: 'light' | 'dark';
    setTheme: (theme: Theme) => void;
    toggleTheme: () => void;
}

// =====================================================
// CONTEXT
// =====================================================

const ThemeContext = createContext<ThemeContextType | undefined>(undefined);

// =====================================================
// PROVIDER
// =====================================================

interface ThemeProviderProps {
    children: ReactNode;
    defaultTheme?: Theme;
    storageKey?: string;
}

export const ThemeProvider: React.FC<ThemeProviderProps> = ({
    children,
    defaultTheme = 'system',
    storageKey = 'torre_control_theme',
}) => {
    const [theme, setThemeState] = useState<Theme>(() => {
        // Get saved theme from localStorage
        if (typeof window !== 'undefined') {
            const saved = localStorage.getItem(storageKey) as Theme | null;
            return saved || defaultTheme;
        }
        return defaultTheme;
    });

    const [resolvedTheme, setResolvedTheme] = useState<'light' | 'dark'>('light');

    // Listen for system theme changes
    useEffect(() => {
        const mediaQuery = window.matchMedia('(prefers-color-scheme: dark)');

        const handleChange = () => {
            if (theme === 'system') {
                setResolvedTheme(mediaQuery.matches ? 'dark' : 'light');
            }
        };

        // Set initial resolved theme
        if (theme === 'system') {
            setResolvedTheme(mediaQuery.matches ? 'dark' : 'light');
        } else {
            setResolvedTheme(theme);
        }

        mediaQuery.addEventListener('change', handleChange);
        return () => mediaQuery.removeEventListener('change', handleChange);
    }, [theme]);

    // Apply theme class to document
    useEffect(() => {
        const root = window.document.documentElement;

        // Remove both classes
        root.classList.remove('light', 'dark');

        // Add the resolved theme class
        root.classList.add(resolvedTheme);

        // Set color-scheme for native elements
        root.style.colorScheme = resolvedTheme;
    }, [resolvedTheme]);

    const setTheme = (newTheme: Theme) => {
        setThemeState(newTheme);
        localStorage.setItem(storageKey, newTheme);
    };

    const toggleTheme = () => {
        const nextTheme = resolvedTheme === 'light' ? 'dark' : 'light';
        setTheme(nextTheme);
    };

    const value: ThemeContextType = {
        theme,
        resolvedTheme,
        setTheme,
        toggleTheme,
    };

    return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>;
};

// =====================================================
// HOOK
// =====================================================

export const useTheme = (): ThemeContextType => {
    const context = useContext(ThemeContext);
    if (context === undefined) {
        throw new Error('useTheme must be used within a ThemeProvider');
    }
    return context;
};

export default ThemeContext;
