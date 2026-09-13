import { render } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import { CommitRing } from '../src/CommitRing.js';

describe('CommitRing', () => {
  it('draws three attempt arcs and one committed arc at full size', () => {
    const { container } = render(<CommitRing size={64} />);
    expect(container.querySelectorAll('path[data-arc="attempt"]')).toHaveLength(3);
    expect(container.querySelectorAll('path[data-arc="committed"]')).toHaveLength(1);
  });

  it('carries hierarchy in stroke weight, not opacity', () => {
    const { container } = render(<CommitRing size={64} />);
    const attempt = container.querySelector('path[data-arc="attempt"]');
    const committed = container.querySelector('path[data-arc="committed"]');
    expect(attempt?.getAttribute('stroke-width')).toBe('4.6');
    expect(committed?.getAttribute('stroke-width')).toBe('6.4');
    for (const node of container.querySelectorAll('path, circle, rect')) {
      expect(node.getAttribute('opacity')).toBeNull();
    }
  });

  it('drops the attempt arcs and thickens the committed arc below 32px', () => {
    const { container } = render(<CommitRing size={24} />);
    expect(container.querySelectorAll('path[data-arc="attempt"]')).toHaveLength(0);
    expect(
      container.querySelector('path[data-arc="committed"]')?.getAttribute('stroke-width'),
    ).toBe('7.4');
    expect(container.querySelector('circle')?.getAttribute('r')).toBe('6.4');
  });

  it('is decorative unless given a title', () => {
    const { container, rerender } = render(<CommitRing size={32} />);
    expect(container.querySelector('svg')?.getAttribute('aria-hidden')).toBe('true');

    rerender(<CommitRing size={32} title="OneShot" />);
    const svg = container.querySelector('svg');
    expect(svg?.getAttribute('aria-hidden')).toBeNull();
    expect(svg?.getAttribute('role')).toBe('img');
    expect(svg?.querySelector('title')?.textContent).toBe('OneShot');
  });
});
