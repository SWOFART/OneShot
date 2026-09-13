import { cleanup, render } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { Hero } from '../src/components/Hero.js';

/** jsdom reports zero for every layout box, so width is stubbed per case. */
function stubWidth(width: number): void {
  vi.spyOn(HTMLElement.prototype, 'clientWidth', 'get').mockReturnValue(width);
}

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

describe('Hero', () => {
  it('cuts the diagonal at desktop width', () => {
    stubWidth(1032);
    const { container } = render(
      <Hero>
        <h1>One job. Many retries. One settlement.</h1>
      </Hero>,
    );
    expect(container.querySelector('.hero-cut')).not.toBeNull();
    expect(container.querySelectorAll('clipPath')).toHaveLength(2);
    expect(container.querySelector('clipPath')?.getAttribute('clipPathUnits')).toBe(
      'userSpaceOnUse',
    );
  });

  it('falls back to a plain panel below the minimum width', () => {
    stubWidth(480);
    const { container } = render(
      <Hero>
        <h1>One job. Many retries. One settlement.</h1>
      </Hero>,
    );
    expect(container.querySelector('.hero-cut')).toBeNull();
    expect(container.querySelector('.hero-plain')).not.toBeNull();
  });

  it('renders its copy in both modes', () => {
    for (const width of [1032, 480]) {
      stubWidth(width);
      const { container, unmount } = render(
        <Hero>
          <h1>One job. Many retries. One settlement.</h1>
        </Hero>,
      );
      expect(container.textContent).toContain('One job. Many retries. One settlement.');
      unmount();
    }
  });

  it('gives each instance unique clip-path ids', () => {
    stubWidth(1032);
    const { container } = render(
      <>
        <Hero>
          <p>first</p>
        </Hero>
        <Hero>
          <p>second</p>
        </Hero>
      </>,
    );
    const ids = [...container.querySelectorAll('clipPath')].map((node) => node.id);
    expect(new Set(ids).size).toBe(ids.length);
  });
});
