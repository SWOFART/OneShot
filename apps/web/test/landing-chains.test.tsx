import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';

import { App } from '../src/App.js';

afterEach(() => {
  cleanup();
});

describe('public settlement chains', () => {
  it('shows Arc Testnet as the default rail and Base Sepolia as a selectable testnet', () => {
    render(<App route="/" />);
    expect(screen.getByRole('heading', { name: 'Settlement chains' })).toBeTruthy();
    expect(screen.getByRole('heading', { name: 'Arc Testnet' })).toBeTruthy();
    expect(screen.getByRole('heading', { name: 'Base Sepolia' })).toBeTruthy();
    expect(screen.getByText('Default rail')).toBeTruthy();
    expect(screen.getByText('Selectable testnet')).toBeTruthy();
    expect(screen.getByText('Unpublished')).toBeTruthy();
    expect(screen.getByRole('link', { name: 'Skip to content' }).getAttribute('href')).toBe(
      '#main-content',
    );
  });
});
