import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import { WorkspaceLoading } from '../src/components/WorkspaceLoading.js';

describe('WorkspaceLoading', () => {
  it('renders an accessible centered workspace status', () => {
    render(<WorkspaceLoading />);

    expect(screen.getByRole('main', { name: 'OneShot workspace' }).getAttribute('aria-busy')).toBe(
      'true',
    );
    expect(screen.getByText('Opening workspace…').getAttribute('role')).toBe('status');
    expect(screen.queryByText('Loading the console…')).toBeNull();
  });
});
