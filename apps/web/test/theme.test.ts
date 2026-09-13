import { afterEach, describe, expect, it, vi } from 'vitest';

import { applyTheme, readStoredTheme, THEME_STORAGE_KEY } from '../src/theme.js';

afterEach(() => {
  // Unstub FIRST. The last case replaces localStorage with an object that has
  // only getItem and setItem, so clearing before restoring would throw on a
  // missing `clear` — in the hook, where it looks like a failure of the test
  // that happened to run last.
  vi.unstubAllGlobals();
  window.localStorage.clear();
  document.documentElement.removeAttribute('data-theme');
});

describe('theme', () => {
  it('defaults to dark when nothing is stored', () => {
    expect(readStoredTheme()).toBe('dark');
  });

  it('reads a stored choice back', () => {
    window.localStorage.setItem(THEME_STORAGE_KEY, 'light');
    expect(readStoredTheme()).toBe('light');
  });

  it('ignores a stored value that is not a theme', () => {
    window.localStorage.setItem(THEME_STORAGE_KEY, 'neon');
    expect(readStoredTheme()).toBe('dark');
  });

  it('stamps the document and persists the choice', () => {
    applyTheme('light');
    expect(document.documentElement.getAttribute('data-theme')).toBe('light');
    expect(window.localStorage.getItem(THEME_STORAGE_KEY)).toBe('light');
  });

  it('still applies the theme when storage throws', () => {
    vi.stubGlobal('localStorage', {
      getItem() {
        throw new Error('site data blocked');
      },
      setItem() {
        throw new Error('site data blocked');
      },
    });
    expect(readStoredTheme()).toBe('dark');
    expect(() => applyTheme('light')).not.toThrow();
    expect(document.documentElement.getAttribute('data-theme')).toBe('light');
  });
});
