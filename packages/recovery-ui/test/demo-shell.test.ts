// @vitest-environment jsdom

import { cleanup, render, screen } from '@testing-library/react';
import { userEvent } from '@testing-library/user-event';
import { createElement } from 'react';
import { afterEach, describe, expect, it } from 'vitest';

import { DemoShell } from '../src/DemoShell.js';

afterEach(() => cleanup());

describe('C06 public synthetic demo shell', () => {
  it('labels fixture evidence and switches scenarios without a network API', async () => {
    window.history.replaceState(null, '', '/?scenario=aged-unknown');
    const user = userEvent.setup();
    render(createElement(DemoShell, { initialScenario: 'aged-unknown' }));

    expect(screen.getByText('Synthetic review demo')).toBeTruthy();
    expect(screen.getByText(/not live sponsor or settlement evidence/u)).toBeTruthy();
    expect(await screen.findByText(/UNKNOWN for 46 minutes/u)).toBeTruthy();

    await user.selectOptions(screen.getByLabelText('Scenario'), 'unavailable');

    expect(await screen.findByText('Subgraph MCP unavailable.')).toBeTruthy();
    expect(window.location.search).toBe('?scenario=unavailable');
  });
});
