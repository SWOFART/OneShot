import { cleanup, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it } from 'vitest';

import { App } from '../src/App.js';

afterEach(() => {
  cleanup();
  window.localStorage.clear();
  document.documentElement.removeAttribute('data-theme');
});

describe('branded shell', () => {
  it('names the mark in the navigation', () => {
    render(<App />);
    expect(screen.getAllByRole('img', { name: 'OneShot' }).length).toBeGreaterThan(0);
  });

  it('renders no placeholder logo image', () => {
    const { container } = render(<App />);
    expect(container.querySelector('img[src="/logo.png"]')).toBeNull();
  });

  it('switches the theme and remembers the choice', async () => {
    const user = userEvent.setup();
    render(<App />);
    const toggle = screen.getByRole('button', { name: /theme/iu });

    await user.click(toggle);
    expect(document.documentElement.getAttribute('data-theme')).toBe('light');
    expect(window.localStorage.getItem('oneshot.theme')).toBe('light');

    await user.click(toggle);
    expect(document.documentElement.getAttribute('data-theme')).toBe('dark');
  });
});
