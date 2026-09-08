// @vitest-environment jsdom

import { readFile } from 'node:fs/promises';
import { join } from 'node:path';

import { cleanup, render, screen, waitFor } from '@testing-library/react';
import { userEvent } from '@testing-library/user-event';
import axe from 'axe-core';
import { createElement } from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { parseRecoveryTimelinePage, type RecoveryActionReceipt } from '../src/contract.js';
import { RECOVERY_SCENARIOS, recoveryScenarioPages } from '../src/fixtures.js';
import { RecoveryTimeline } from '../src/RecoveryTimeline.js';

const receipt: RecoveryActionReceipt = {
  schemaVersion: 'recovery-action-receipt-v1',
  businessIntentId: 'intent_demo_018f',
  action: 'REFRESH_STATUS',
  accepted: true,
  message: 'Status refresh requested. No settlement action was created.',
};

afterEach(() => cleanup());

function renderScenario(scenario: keyof typeof recoveryScenarioPages, allPages = false) {
  const pages = recoveryScenarioPages[scenario];
  return render(
    createElement(RecoveryTimeline, {
      pages: allPages ? pages : [pages[0]!],
      onRefresh: vi.fn(async () => receipt),
      onEscalate: vi.fn(async () => ({ ...receipt, action: 'ESCALATE' as const })),
      onLoadMore: allPages ? null : vi.fn(async () => undefined),
    }),
  );
}

describe('RecoveryTimeline', () => {
  it.each([
    ['fresh-wait', 'WAIT'],
    ['fresh-reconcile', 'RECONCILE'],
    ['fresh-escalate', 'ESCALATE'],
    ['committed-return-existing', 'RETURN_EXISTING_RESULT'],
  ] as const)(
    'renders %s recommendation separately from the deterministic core',
    (scenario, action) => {
      renderScenario(scenario);
      expect(screen.getByText(action, { selector: '.decision-grid strong' })).toBeTruthy();
      expect(screen.getByText('Deterministic core', { selector: 'span' })).toBeTruthy();
      expect(screen.getByText('LLM recommendation', { selector: 'span' })).toBeTruthy();
    },
  );

  it.each([
    ['invalid-output', 'ADVISOR_BOUNDARY_REJECTED'],
    ['lagging', 'LAGGING'],
    ['unhealthy', 'UNHEALTHY'],
    ['unavailable', 'UNAVAILABLE'],
    ['contradictory', 'Contradictory evidence'],
    ['pending', 'SUBMITTING'],
    ['committed', 'COMMITTED'],
    ['failed-safe', 'FAILED_SAFE'],
    ['aged-unknown', 'UNKNOWN for 46 minutes'],
  ] as const)('renders safe %s state', (scenario, expected) => {
    renderScenario(scenario);
    expect(screen.getAllByText(new RegExp(expected, 'u')).length).toBeGreaterThan(0);
    expect(screen.getByText(/New settlement blocked/u)).toBeTruthy();
  });

  it('uses observed-through language for an empty Graph result', () => {
    renderScenario('empty');
    expect(screen.getByText(/Not observed through block 704/u)).toBeTruthy();
    expect(document.body.textContent?.toLowerCase()).not.toContain('not paid');
  });

  it('hides Subgraph MCP cleanly when fallback is selected', () => {
    renderScenario('fallback-disabled');
    expect(screen.queryByRole('heading', { name: 'Subgraph MCP' })).toBeNull();
  });

  it('offers no retry, force-pay, or settlement action', () => {
    renderScenario('aged-unknown');
    const buttonNames = screen
      .getAllByRole('button')
      .map((button) => button.textContent?.toLowerCase());
    expect(buttonNames).toEqual([
      'refresh status',
      'escalate to operator',
      'load earlier evidence',
    ]);
    expect(document.body.textContent).toContain('No payment action is available');
  });

  it('supports keyboard activation for safe actions', async () => {
    const user = userEvent.setup();
    const onRefresh = vi.fn(async () => receipt);
    render(
      createElement(RecoveryTimeline, {
        pages: [recoveryScenarioPages['fresh-wait'][0]!],
        onRefresh,
        onEscalate: vi.fn(async () => ({ ...receipt, action: 'ESCALATE' as const })),
        onLoadMore: null,
      }),
    );
    await user.tab();
    expect(document.activeElement).toBe(screen.getByRole('button', { name: 'Refresh status' }));
    await user.keyboard('{Enter}');
    await waitFor(() => expect(onRefresh).toHaveBeenCalledOnce());
    expect(await screen.findByText(/Status refresh requested/u)).toBeTruthy();
  });

  it('renders malicious evidence strings as inert text', () => {
    const original = structuredClone(recoveryScenarioPages['fresh-wait'][0]!);
    const fixture = {
      ...original,
      evidence: original.evidence.map((item, index) =>
        index === 0 ? { ...item, summary: '<img src=x onerror=alert(1)>' } : item,
      ),
    };
    const safe = parseRecoveryTimelinePage(fixture);
    render(
      createElement(RecoveryTimeline, {
        pages: [safe],
        onRefresh: vi.fn(async () => receipt),
        onEscalate: vi.fn(async () => ({ ...receipt, action: 'ESCALATE' as const })),
        onLoadMore: null,
      }),
    );
    expect(screen.getByText('<img src=x onerror=alert(1)>')).toBeTruthy();
    expect(document.querySelector('img')).toBeNull();
  });

  it('collapses duplicate observations and flags clock ambiguity after pagination', () => {
    renderScenario('fresh-wait', true);
    expect(screen.getByText(/Duplicate observation collapsed ×2/u)).toBeTruthy();
    expect(screen.getAllByText(/relative order is uncertain/u)).toHaveLength(2);
  });

  it('has no detectable automated accessibility violations', async () => {
    const { container } = renderScenario('contradictory', true);
    const results = await axe.run(container, { rules: { 'color-contrast': { enabled: false } } });
    expect(results.violations).toEqual([]);
  });

  it('ships narrow and medium responsive breakpoints', async () => {
    const repositoryRoot = process.cwd().endsWith('recovery-ui')
      ? process.cwd()
      : join(process.cwd(), 'packages', 'recovery-ui');
    const css = await readFile(join(repositoryRoot, 'src', 'styles.css'), 'utf8');
    expect(css).toContain('@media (max-width: 860px)');
    expect(css).toContain('@media (max-width: 620px)');
    expect(css).toContain('grid-template-columns: 1fr');
  });

  it('covers every required C05 fixture story', () => {
    expect(RECOVERY_SCENARIOS).toEqual(
      expect.arrayContaining([
        'fresh-wait',
        'fresh-reconcile',
        'fresh-escalate',
        'committed-return-existing',
        'invalid-output',
        'empty',
        'lagging',
        'unhealthy',
        'unavailable',
        'contradictory',
        'pending',
        'committed',
        'failed-safe',
        'aged-unknown',
      ]),
    );
  });
});
