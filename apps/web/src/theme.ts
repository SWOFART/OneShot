/**
 * Theme selection.
 *
 * Dark is the default. The choice is stamped on <html> as `data-theme`, which
 * is what the brand token stylesheet switches on, and mirrored into
 * localStorage so it survives a reload. A private window or blocked site data
 * makes both storage calls throw; the theme must still apply, so every access
 * is guarded and falls back to the default.
 *
 * The inline guard in index.html performs the same read before first paint.
 * Keep the two in step: a divergence shows up as a flash of the wrong palette.
 */

export type Theme = 'light' | 'dark';

export const THEME_STORAGE_KEY = 'oneshot.theme';

const DEFAULT_THEME: Theme = 'dark';

function isTheme(value: string | null): value is Theme {
  return value === 'light' || value === 'dark';
}

export function readStoredTheme(): Theme {
  try {
    const stored = window.localStorage.getItem(THEME_STORAGE_KEY);
    return isTheme(stored) ? stored : DEFAULT_THEME;
  } catch {
    return DEFAULT_THEME;
  }
}

export function applyTheme(theme: Theme): void {
  document.documentElement.setAttribute('data-theme', theme);
  try {
    window.localStorage.setItem(THEME_STORAGE_KEY, theme);
  } catch {
    // Site data is unavailable. The theme still applies for this page view.
  }
}
