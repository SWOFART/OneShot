import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';

import { App } from '../src/App.js';

afterEach(() => {
  cleanup();
});

describe('public landing scope', () => {
  it('leads with the business guarantee and does not catalog chains', () => {
    render(<App route="/" />);
    expect(
      screen.getByRole('heading', { name: /One payment identity across every retry/u }),
    ).toBeTruthy();
    expect(screen.getByText(/chain-agnostic/u)).toBeTruthy();
    expect(screen.queryByRole('heading', { name: 'Rails a company can select' })).toBeNull();
    expect(screen.queryByRole('heading', { name: 'Arc Testnet' })).toBeNull();
    expect(screen.queryByRole('heading', { name: 'Base Sepolia' })).toBeNull();
    expect(screen.queryByText(/eip155:/u)).toBeNull();
  });
});
