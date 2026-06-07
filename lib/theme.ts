export const THEME_STORAGE_KEY = 'bookstore-theme';

export type ThemeMode = 'light' | 'dark' | 'system';
export type ResolvedTheme = 'light' | 'dark';

export function parseThemeMode(value: string | null | undefined): ThemeMode {
  return value === 'light' || value === 'dark' || value === 'system' ? value : 'dark';
}

export function resolveTheme(mode: ThemeMode, systemPrefersDark: boolean): ResolvedTheme {
  if (mode === 'system') {
    return systemPrefersDark ? 'dark' : 'light';
  }
  return mode;
}

export function loadThemeMode(): ThemeMode {
  if (typeof window === 'undefined') return 'dark';
  return parseThemeMode(window.localStorage.getItem(THEME_STORAGE_KEY));
}

export function saveThemeMode(mode: ThemeMode): void {
  if (typeof window === 'undefined') return;
  window.localStorage.setItem(THEME_STORAGE_KEY, mode);
}

export function applyThemeMode(mode: ThemeMode): ResolvedTheme {
  const prefersDark =
    typeof window !== 'undefined' &&
    window.matchMedia('(prefers-color-scheme: dark)').matches;
  const resolved = resolveTheme(mode, prefersDark);

  if (typeof document !== 'undefined') {
    document.documentElement.classList.remove('light', 'dark');
    document.documentElement.classList.add(resolved);
    document.documentElement.style.colorScheme = resolved;
  }

  return resolved;
}

export function subscribeToSystemTheme(
  mode: ThemeMode,
  callback?: (theme: ResolvedTheme) => void,
): () => void {
  if (typeof window === 'undefined' || mode !== 'system') {
    return () => {};
  }

  const media = window.matchMedia('(prefers-color-scheme: dark)');
  const handleChange = () => callback?.(applyThemeMode('system'));
  media.addEventListener('change', handleChange);
  return () => media.removeEventListener('change', handleChange);
}
