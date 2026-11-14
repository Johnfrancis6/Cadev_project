import * as React from 'react';
import { safeStorage } from '@/lib/utils';

export type ThemePreference = 'dark' | 'light' | 'system';
export type ResolvedTheme = 'dark' | 'light';

const STORAGE_KEY = 'devloop.theme'; // also read by public/theme.js before first paint

interface ThemeContextValue {
  /** What the user chose. */
  theme: ThemePreference;
  /** What is actually applied. */
  resolvedTheme: ResolvedTheme;
  setTheme: (theme: ThemePreference) => void;
}

const ThemeContext = React.createContext<ThemeContextValue | null>(null);

const systemDark = () => typeof window !== 'undefined' && window.matchMedia('(prefers-color-scheme: dark)').matches;

function readPreference(): ThemePreference {
  const stored = safeStorage.get(STORAGE_KEY);
  return stored === 'dark' || stored === 'light' || stored === 'system' ? stored : 'system';
}

function apply(resolved: ResolvedTheme) {
  const root = document.documentElement;
  root.setAttribute('data-theme', resolved);
  root.style.colorScheme = resolved;
  document.querySelector('meta[name="theme-color"]')?.setAttribute('content', resolved === 'dark' ? '#111310' : '#f5f4ec');
}

export function ThemeProvider({ children }: { children: React.ReactNode }) {
  const [theme, setThemeState] = React.useState<ThemePreference>(readPreference);
  const [system, setSystem] = React.useState<ResolvedTheme>(() => (systemDark() ? 'dark' : 'light'));
  const resolvedTheme: ResolvedTheme = theme === 'system' ? system : theme;

  React.useEffect(() => {
    const media = window.matchMedia('(prefers-color-scheme: dark)');
    const onChange = () => setSystem(media.matches ? 'dark' : 'light');
    media.addEventListener('change', onChange);
    return () => media.removeEventListener('change', onChange);
  }, []);

  React.useEffect(() => apply(resolvedTheme), [resolvedTheme]);

  const setTheme = React.useCallback((next: ThemePreference) => {
    safeStorage.set(STORAGE_KEY, next);
    setThemeState(next);
  }, []);

  const value = React.useMemo(() => ({ theme, resolvedTheme, setTheme }), [theme, resolvedTheme, setTheme]);
  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>;
}

export function useTheme(): ThemeContextValue {
  const ctx = React.useContext(ThemeContext);
  if (!ctx) throw new Error('useTheme must be used inside <ThemeProvider>');
  return ctx;
}
