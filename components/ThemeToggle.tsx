import React from 'react';
import { Sun, Moon, Monitor } from 'lucide-react';
import { useTheme } from '../contexts/ThemeContext';

interface ThemeToggleProps {
    showLabel?: boolean;
    size?: 'sm' | 'md' | 'lg';
}

export const ThemeToggle: React.FC<ThemeToggleProps> = ({ showLabel = false, size = 'md' }) => {
    const { theme, setTheme, resolvedTheme, toggleTheme } = useTheme();

    const sizeClasses = {
        sm: 'p-1.5',
        md: 'p-2',
        lg: 'p-3',
    };

    const iconSizes = {
        sm: 'w-4 h-4',
        md: 'w-5 h-5',
        lg: 'w-6 h-6',
    };

    // Simple toggle between light and dark
    if (!showLabel) {
        return (
            <button
                onClick={toggleTheme}
                className={`${sizeClasses[size]} rounded-lg bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 text-slate-600 dark:text-slate-300 transition-all`}
                title={resolvedTheme === 'dark' ? 'Cambiar a modo claro' : 'Cambiar a modo oscuro'}
                aria-label="Toggle theme"
            >
                {resolvedTheme === 'dark' ? (
                    <Sun className={iconSizes[size]} />
                ) : (
                    <Moon className={iconSizes[size]} />
                )}
            </button>
        );
    }

    // Full dropdown with all options
    return (
        <div className="relative group">
            <button
                className={`${sizeClasses[size]} rounded-lg bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 text-slate-600 dark:text-slate-300 transition-all flex items-center gap-2`}
                title="Cambiar tema"
                aria-label="Theme options"
            >
                {theme === 'light' && <Sun className={iconSizes[size]} />}
                {theme === 'dark' && <Moon className={iconSizes[size]} />}
                {theme === 'system' && <Monitor className={iconSizes[size]} />}
                {showLabel && (
                    <span className="text-sm font-medium capitalize">
                        {theme === 'light' ? 'Claro' : theme === 'dark' ? 'Oscuro' : 'Sistema'}
                    </span>
                )}
            </button>

            {/* Dropdown */}
            <div className="absolute right-0 top-full mt-2 py-2 w-40 bg-white dark:bg-slate-800 rounded-xl shadow-lg border border-slate-200 dark:border-slate-700 opacity-0 invisible group-hover:opacity-100 group-hover:visible transition-all z-50">
                <button
                    onClick={() => setTheme('light')}
                    className={`w-full px-4 py-2 text-left text-sm flex items-center gap-3 hover:bg-slate-100 dark:hover:bg-slate-700 transition-colors ${theme === 'light'
                            ? 'text-blue-600 dark:text-blue-400 bg-blue-50 dark:bg-blue-900/20'
                            : 'text-slate-700 dark:text-slate-300'
                        }`}
                >
                    <Sun className="w-4 h-4" />
                    Claro
                </button>
                <button
                    onClick={() => setTheme('dark')}
                    className={`w-full px-4 py-2 text-left text-sm flex items-center gap-3 hover:bg-slate-100 dark:hover:bg-slate-700 transition-colors ${theme === 'dark'
                            ? 'text-blue-600 dark:text-blue-400 bg-blue-50 dark:bg-blue-900/20'
                            : 'text-slate-700 dark:text-slate-300'
                        }`}
                >
                    <Moon className="w-4 h-4" />
                    Oscuro
                </button>
                <button
                    onClick={() => setTheme('system')}
                    className={`w-full px-4 py-2 text-left text-sm flex items-center gap-3 hover:bg-slate-100 dark:hover:bg-slate-700 transition-colors ${theme === 'system'
                            ? 'text-blue-600 dark:text-blue-400 bg-blue-50 dark:bg-blue-900/20'
                            : 'text-slate-700 dark:text-slate-300'
                        }`}
                >
                    <Monitor className="w-4 h-4" />
                    Sistema
                </button>
            </div>
        </div>
    );
};

export default ThemeToggle;
