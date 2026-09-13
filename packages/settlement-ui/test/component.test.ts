// @vitest-environment jsdom

import { readFile } from 'node:fs/promises';
import { join } from 'node:path';

import { cleanup, render, screen, within } from '@testing-library/react';
import { userEvent } from '@testing-library/user-event';
import axe from 'axe-core';
import { createElement } from 'react';
import { afterEach, describe, expect, it } from 'vitest';
import type { IntentResponse } from '@oneshot/contracts';

import { toSettlementDetailsView } from '../src/contract.js';
import { FIXTURE_EXPLORER_HOSTS, SETTLEMENT_SCENARIOS } from '../src/fixtures.js';
import { SettlementDetailsPanel } from '../src/SettlementDetails.js';

afterEach(cleanup);

const SCENARIOS = Object.values(SETTLEMENT_SCENARIOS);

function renderScenario(name: string) {
  const scenario = SETTLEMENT_SCENARIOS[name];
  if (scenario === undefined) throw new Error(`Missing fixture: ${name}`);
  return render(
    createElement(SettlementDetailsPanel, {
      view: toSettlementDetailsView(scenario.intent, {
        allowedExplorerHosts: FIXTURE_EXPLORER_HOSTS,
      }),
    }),
  );
}

function renderIntent(intent: IntentResponse) {
  return render(
    createElement(SettlementDetailsPanel, {
      view: toSettlementDetailsView(intent, {
        allowedExplorerHosts: FIXTURE_EXPLORER_HOSTS,
      }),
    }),
  );
}

function packageRoot(): string {
  return process.cwd().endsWith('settlement-ui')
    ? process.cwd()
    : join(process.cwd(), 'packages', 'settlement-ui');
}

describe('every published scenario', () => {
  it.each(SCENARIOS.map((scenario) => scenario.scenario))('renders %s', (name) => {
    const { container } = renderScenario(name);
    expect(screen.getByRole('heading', { level: 2, name: 'Policy' })).toBeTruthy();
    expect(screen.getByRole('heading', { level: 2, name: 'Authorization' })).toBeTruthy();
    expect(screen.getByRole('heading', { level: 2, name: 'Settlement' })).toBeTruthy();
    expect(screen.getByRole('heading', { level: 2, name: 'Transaction' })).toBeTruthy();
    expect(container.querySelector('.settlement-details')).not.toBeNull();
  });

  it.each(SCENARIOS.map((scenario) => scenario.scenario))(
    'offers no settlement action in %s',
    (name) => {
      const { container } = renderScenario(name);
      expect(container.querySelectorAll('button')).toHaveLength(0);
      expect(container.querySelectorAll('form')).toHaveLength(0);
      expect(container.querySelectorAll('input')).toHaveLength(0);
      const text = container.textContent ?? '';
      for (const forbidden of ['Retry', 'Resend', 'Force', 'Submit again', 'Pay again']) {
        expect(text).not.toContain(forbidden);
      }
    },
  );

  it.each(SCENARIOS.map((scenario) => scenario.scenario))(
    'never renders a confirmation count in %s',
    (name) => {
      const { container } = renderScenario(name);
      expect(container.textContent ?? '').not.toMatch(/confirmation/iu);
    },
  );

  it.each(SCENARIOS.map((scenario) => scenario.scenario))(
    'passes an accessibility scan for %s',
    async (name) => {
      const { container } = renderScenario(name);
      const results = await axe.run(container, {
        rules: { 'color-contrast': { enabled: false } },
      });
      expect(results.violations).toEqual([]);
    },
  );
});

describe('policy summary', () => {
  it('renders the sanitized policy facts', () => {
    renderScenario('authorized-committed');
    const policy = screen.getByRole('region', { name: 'Policy' });
    expect(within(policy).getByText('eip155:5042002')).toBeTruthy();
    expect(within(policy).getByText('Configured')).toBeTruthy();
    expect(within(policy).getByText('10.000000 USDC')).toBeTruthy();
    expect(within(policy).getByText('At or under the cap')).toBeTruthy();
  });

  it('shows an above-cap amount against the reported cap', () => {
    renderScenario('auth-cap-exceeded');
    const policy = screen.getByRole('region', { name: 'Policy' });
    expect(within(policy).getByText('Cap exceeded')).toBeTruthy();
    expect(within(policy).getByText('Above the cap')).toBeTruthy();
    expect(within(policy).getByText('50.000000')).toBeTruthy();
  });

  it('does not render allowlist indicators in policy summary', () => {
    renderScenario('auth-config-mismatch');
    const policy = screen.getByRole('region', { name: 'Policy' });
    expect(within(policy).queryByText('No allowlist reported')).toBeNull();
    expect(within(policy).queryByText('On the allowlist')).toBeNull();
  });

  it('explains that connected-wallet payments have no server policy', () => {
    const committed = SETTLEMENT_SCENARIOS['authorized-committed'];
    if (committed === undefined) throw new Error('Missing fixture: authorized-committed');
    renderIntent({ ...committed.intent, payment_mode: 'USER_WALLET' });
    const policy = screen.getByRole('region', { name: 'Policy' });
    expect(within(policy).getByText('Not applicable')).toBeTruthy();
    expect(within(policy).getByText(/paid directly by the connected wallet/u)).toBeTruthy();
  });
});

describe('authorization states', () => {
  it.each([
    ['auth-checking', 'Checking'],
    ['authorized-committed', 'Authorized'],
    ['auth-denied-recipient', 'Denied'],
    ['auth-unavailable', 'Unavailable'],
    ['auth-config-mismatch', 'Configuration mismatch'],
  ])('labels %s as %s', (name, label) => {
    renderScenario(name);
    const panel = screen.getByRole('region', { name: 'Authorization' });
    expect(within(panel).getByText(label)).toBeTruthy();
  });

  it('explains a denial without offering a way around it', () => {
    renderScenario('auth-denied-recipient');
    const panel = screen.getByRole('region', { name: 'Authorization' });
    expect(
      within(panel).getByText(/Privy refused this attempt\. No settlement was submitted/u),
    ).toBeTruthy();
    expect(within(panel).getByText(/this interface offers no bypass/u)).toBeTruthy();
    expect(
      within(panel).getByText(/Recipient 0x1111111111111111111111111111111111111111 is not on/u),
    ).toBeTruthy();
    expect(panel.querySelectorAll('button, a')).toHaveLength(0);
  });

  it('separates an unavailable authorization from a denial', () => {
    renderScenario('auth-unavailable');
    const panel = screen.getByRole('region', { name: 'Authorization' });
    expect(within(panel).getByText(/neither an approval nor a denial/u)).toBeTruthy();
    expect(within(panel).queryByText('Denied')).toBeNull();
  });
});

describe('settlement states', () => {
  it.each([
    ['auth-checking', 'Awaiting authorization'],
    ['ready-authorized', 'Ready'],
    ['submitting-in-flight', 'Submitting'],
    ['unknown-reconcile-only', 'Unknown'],
    ['authorized-committed', 'Committed'],
    ['final-revert', 'Failed safe'],
    ['auth-denied-recipient', 'Rejected'],
  ])('labels %s as %s', (name, label) => {
    renderScenario(name);
    const panel = screen.getByRole('region', { name: 'Settlement' });
    expect(within(panel).getByText(label)).toBeTruthy();
  });

  it('keeps UNKNOWN visibly non-terminal and free of actions', () => {
    const { container } = renderScenario('unknown-reconcile-only');
    const panel = screen.getByRole('region', { name: 'Settlement' });
    expect(within(panel).getByText('Not final')).toBeTruthy();
    expect(
      within(panel).getByText(/No new settlement action is available for an unknown outcome/u),
    ).toBeTruthy();
    expect(within(panel).getByText('Pending')).toBeTruthy();
    expect(container.querySelectorAll('button, a')).toHaveLength(0);
  });

  it('renders a lagging index observation without treating it as proof', () => {
    renderScenario('unknown-reconcile-only');
    const panel = screen.getByRole('region', { name: 'Settlement' });
    expect(within(panel).getByText('THE_GRAPH')).toBeTruthy();
    expect(within(panel).getByText('OBSERVATION')).toBeTruthy();
    expect(within(panel).getByText('LAGGING')).toBeTruthy();
    expect(
      within(panel).getByText(/absence of an index result is not proof that no payment happened/u),
    ).toBeTruthy();
  });

  it('states that unavailable evidence does not change authoritative state', () => {
    renderScenario('auth-checking');
    const panel = screen.getByRole('region', { name: 'Settlement' });
    expect(
      within(panel).getByText(/Missing evidence does not change the authoritative state/u),
    ).toBeTruthy();
  });
});

describe('verified transaction details', () => {
  it('renders the full transfer identity for a verified settlement', () => {
    renderScenario('authorized-committed');
    const panel = screen.getByRole('region', { name: 'Transaction' });
    expect(within(panel).getByText('Verified')).toBeTruthy();
    expect(
      within(panel).getByText('0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa'),
    ).toBeTruthy();
    expect(within(panel).getByText('100')).toBeTruthy();
    expect(within(panel).getByText('0x3600000000000000000000000000000000000000')).toBeTruthy();
    expect(within(panel).getByText('0x1111111111111111111111111111111111111111')).toBeTruthy();
    expect(within(panel).getByText('1.250000')).toBeTruthy();
    expect(within(panel).getByText('log index 0')).toBeTruthy();
  });

  it('links to the Arc explorer through a validated href', () => {
    renderScenario('authorized-committed');
    const link = screen.getByRole('link', { name: 'View on the Arc explorer' });
    expect(link.getAttribute('href')).toBe(
      'https://testnet.arcscan.io/tx/0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa',
    );
    expect(link.getAttribute('rel')).toContain('noopener');
  });

  it('reaches the explorer link by keyboard', async () => {
    const user = userEvent.setup();
    renderScenario('authorized-committed');
    const link = screen.getByRole('link', { name: 'View on the Arc explorer' });
    await user.tab();
    expect(document.activeElement).toBe(link);
  });

  it('drops an unsafe explorer link and explains why', () => {
    renderScenario('hostile-explorer-link');
    expect(screen.queryByRole('link')).toBeNull();
    const panel = screen.getByRole('region', { name: 'Transaction' });
    expect(within(panel).getByText('Explorer link must use https.')).toBeTruthy();
    expect(panel.innerHTML).not.toContain('javascript:');
  });

  it('drops a link whose host is off the deployment allowlist', () => {
    const scenario = SETTLEMENT_SCENARIOS['authorized-committed'];
    if (scenario === undefined) throw new Error('Missing fixture: authorized-committed');
    render(
      createElement(SettlementDetailsPanel, {
        view: toSettlementDetailsView(scenario.intent),
      }),
    );
    expect(screen.queryByRole('link')).toBeNull();
    const panel = screen.getByRole('region', { name: 'Transaction' });
    expect(within(panel).getByText('Explorer host is not on the allowlist.')).toBeTruthy();
  });

  it('escapes a hostile string rather than injecting markup', () => {
    const { container } = renderScenario('hostile-explorer-link');
    expect(container.querySelector('script')).toBeNull();
    expect(container.textContent ?? '').toContain('<script>alert(1)</script>');
  });

  it('withholds details when the settlement is not verified', () => {
    renderScenario('committed-without-arc-evidence');
    const panel = screen.getByRole('region', { name: 'Transaction' });
    expect(within(panel).getByText('Unverified')).toBeTruthy();
    expect(panel.textContent ?? '').not.toContain(
      '0xdddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddd',
    );
  });

  it('reports no transaction when none is recorded', () => {
    renderScenario('auth-checking');
    const panel = screen.getByRole('region', { name: 'Transaction' });
    expect(within(panel).getByText('None recorded')).toBeTruthy();
  });
});

describe('redaction', () => {
  it.each(SCENARIOS.map((scenario) => scenario.scenario))(
    'renders no secret-shaped markup for %s',
    (name) => {
      const { container } = renderScenario(name);
      const markup = container.innerHTML.toLowerCase();
      for (const forbidden of [
        'secret',
        'private key',
        'seed phrase',
        'mnemonic',
        'bearer ',
        'signature',
      ]) {
        expect(markup).not.toContain(forbidden);
      }
    },
  );
});

describe('responsive layout', () => {
  it('ships narrow and medium breakpoints', async () => {
    const css = await readFile(join(packageRoot(), 'src', 'styles.css'), 'utf8');
    expect(css).toContain('@media (max-width: 860px)');
    expect(css).toContain('@media (max-width: 620px)');
    expect(css).toContain('grid-template-columns: 1fr');
  });
});
