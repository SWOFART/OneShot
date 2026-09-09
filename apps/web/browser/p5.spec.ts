import { expect, test, type Page, type Route } from '@playwright/test';

const RECIPIENT = '0x1111111111111111111111111111111111111111';

type CreateMode = 'ACCEPTED' | 'REPLAYED' | 'CONFLICT' | 'DENIED' | 'UNAVAILABLE';

function intent(state: 'READY' | 'COMMITTED' | 'UNKNOWN', id: string) {
  return {
    business_intent_id: id,
    payload_fingerprint: 'a'.repeat(64),
    recipient: RECIPIENT,
    amount_atomic: '1250000',
    asset: 'USDC',
    network: 'eip155:5042002',
    purpose: 'Browser P5 acceptance',
    state,
    version: 2,
    policy: {
      policy_id: 'privy-policy-arc-prod',
      status: 'CONFIGURED',
      settlement_cap_atomic: '10000000',
      allowed_recipients: [RECIPIENT],
    },
    attempts: [
      {
        attempt_id: 'attempt-browser-001',
        stage: state === 'UNKNOWN' ? 'SUBMITTING' : state,
        created_at: '2026-09-09T08:00:00.000Z',
        authorization_status: 'AUTHORIZED',
      },
    ],
    evidence: [
      {
        source: state === 'UNKNOWN' ? 'THE_GRAPH' : 'ARC',
        authority_class: state === 'UNKNOWN' ? 'OBSERVATION' : 'AUTHORITATIVE',
        retrieved_at: '2026-09-09T08:00:01.000Z',
        digest: 'digest-browser-001',
        ...(state === 'UNKNOWN' ? { freshness: 'LAGGING' } : { block_number: '100' }),
      },
    ],
    ...(state === 'COMMITTED'
      ? {
          settlement: {
            provider_reference_id: 'arc-browser-001',
            transaction_hash: `0x${'b'.repeat(64)}`,
            block_number: '100',
            transfer_log_index: 0,
            token_contract: `0x${'c'.repeat(40)}`,
            explorer_url: `https://testnet.arcscan.app/tx/0x${'b'.repeat(64)}`,
          },
        }
      : {}),
  };
}

function recoveryView(id: string) {
  const freshness = id.includes('lag') ? 'LAGGING' : id.includes('error') ? 'UNAVAILABLE' : 'FRESH';
  const count = id.includes('multiple') ? 2 : 1;
  const diagnostics = id.includes('multiple') ? ['MULTIPLE_CANDIDATES'] : [];
  return {
    business_intent_id: id,
    authoritative_state: 'UNKNOWN',
    recommended_action: freshness === 'FRESH' ? 'RECONCILE' : 'WAIT',
    recommendation_source: 'RECOVERY_AGENT',
    core_disposition: freshness === 'FRESH' ? 'READ_ONLY_LOOKUP' : 'HOLD_UNKNOWN',
    settlement_permission: 'NEVER',
    agent_decision: {
      accepted: true,
      reason: 'Agent selected a bounded recovery action from sanitized evidence.',
      model_name: 'gemini',
      model_version: '2.5-flash',
      prompt_version: 'recovery-v1',
      evidence_references: ['graph-1'],
    },
    core_decision: {
      disposition: freshness === 'FRESH' ? 'READ_ONLY_LOOKUP' : 'HOLD_UNKNOWN',
      target_state: 'UNKNOWN',
      reason: 'No authoritative Arc proof permits a terminal transition.',
      authoritative_proof_present: false,
      evidence_references: [],
    },
    graph_observation: {
      server_name: 'subgraph-mcp',
      server_version: '1.0.0',
      tool_name: 'execute_query_by_deployment_id',
      deployment_id: 'QmP5Deployment',
      manifest_cid: 'QmP5Manifest',
      observed_through_block: '61153492',
      observed_through_time: '2026-09-09T09:01:00.000Z',
      health: freshness,
      available: freshness !== 'UNAVAILABLE',
      candidate_count: count,
      diagnostics,
      candidates: Array.from({ length: count }, (_, index) => ({
        candidate_id: `candidate-${index + 1}`,
        transaction_hash: `0x${String(index + 1).repeat(64)}`,
        block_number: String(61153492 + index),
        binding_status: 'MATCH',
        contradiction_codes: [],
      })),
    },
    contradiction: id.includes('multiple'),
    contradiction_codes: id.includes('multiple') ? ['MULTIPLE_DISTINCT_CANDIDATES'] : [],
    diagnostics,
    evidence: Array.from({ length: count }, (_, index) => ({
      source: 'THE_GRAPH',
      authority_class: 'OBSERVATION',
      retrieved_at: `2026-09-09T09:0${index + 1}:00.000Z`,
      digest: `graph-${index + 1}`,
      block_number: String(61153492 + index),
      freshness,
    })),
  };
}

async function json(route: Route, status: number, body: unknown): Promise<void> {
  await route.fulfill({
    status,
    contentType: 'application/json',
    body: JSON.stringify(body),
  });
}

async function stubReadiness(page: Page): Promise<void> {
  await page.route('**/health/ready', (route) => json(route, 200, { status: 'ok' }));
}

async function fillIntentForm(page: Page): Promise<void> {
  await page.getByLabel('Recipient').fill(RECIPIENT);
  await page.getByLabel('Amount in USDC').fill('1.25');
}

async function selectIntent(page: Page, id: string, tab: string): Promise<void> {
  await page.getByLabel('Active Business Intent ID').fill(id);
  await page.getByRole('tab', { name: tab }).click();
}

test.describe('P5 composed operator experience', () => {
  test('covers create, replay, conflict, denial, and service-unavailable flows', async ({
    page,
  }) => {
    let mode: CreateMode = 'ACCEPTED';
    const responseStatuses: number[] = [];
    await stubReadiness(page);
    await page.route('**/v1/intents', async (route) => {
      if (route.request().method() !== 'POST') return route.continue();
      if (mode === 'CONFLICT') {
        return json(route, 409, {
          code: 'INTENT_PAYLOAD_CONFLICT',
          message: 'The immutable payload differs for this Business Intent ID.',
        });
      }
      if (mode === 'DENIED') {
        return json(route, 403, {
          code: 'POLICY_DENIED',
          message: 'Recipient is not on the configured allowlist.',
        });
      }
      if (mode === 'UNAVAILABLE') return json(route, 503, { message: 'Service unavailable.' });
      const body = route.request().postDataJSON() as { business_intent_id: string };
      return json(route, mode === 'REPLAYED' ? 200 : 202, intent('READY', body.business_intent_id));
    });
    page.on('response', (response) => {
      if (response.url().endsWith('/v1/intents') && response.request().method() === 'POST') {
        responseStatuses.push(response.status());
      }
    });
    await page.route('**/v1/intents/**', async (route) => {
      const id = decodeURIComponent(
        new URL(route.request().url()).pathname.split('/').at(-1) ?? '',
      );
      return json(route, 200, intent('READY', id));
    });

    await page.goto('/');
    await expect(page.getByRole('tab', { name: 'Create or replay' })).toBeVisible();
    await fillIntentForm(page);
    await page.getByRole('button', { name: /Submit Intent/u }).click();
    await expect(page.getByRole('tab', { name: 'Authoritative status' })).toHaveAttribute(
      'aria-selected',
      'true',
    );
    await expect(page.locator('.state-card > div:first-child > strong')).toHaveText('READY');

    await page.getByRole('tab', { name: 'Create or replay' }).click();
    await fillIntentForm(page);
    mode = 'REPLAYED';
    await page.getByRole('button', { name: /Submit Intent/u }).click();
    await expect(page.getByRole('tab', { name: 'Authoritative status' })).toHaveAttribute(
      'aria-selected',
      'true',
    );

    await page.getByRole('tab', { name: 'Create or replay' }).click();
    await fillIntentForm(page);
    mode = 'CONFLICT';
    await page.getByRole('button', { name: /Submit Intent/u }).click();
    await expect(page.getByText(/PAYLOAD CONFLICT/u)).toBeVisible();

    await page.getByRole('tab', { name: 'Create or replay' }).click();
    await fillIntentForm(page);
    mode = 'DENIED';
    await page.getByRole('button', { name: /Submit Intent/u }).click();
    await expect(page.getByText(/AUTHORIZATION DENIED/u)).toBeVisible();

    await page.getByRole('tab', { name: 'Create or replay' }).click();
    await fillIntentForm(page);
    mode = 'UNAVAILABLE';
    await page.getByRole('button', { name: /Submit Intent/u }).click();
    await expect(page.getByText(/SERVICE UNAVAILABLE/u)).toBeVisible();
    expect(responseStatuses).toEqual([202, 200, 409, 403, 503]);
  });

  test('covers committed, UNKNOWN, and read-only settlement evidence', async ({ page }) => {
    let state: 'COMMITTED' | 'UNKNOWN' = 'COMMITTED';
    await stubReadiness(page);
    await page.route('**/v1/intents', async (route) => {
      const body = route.request().postDataJSON() as { business_intent_id: string };
      return json(route, 202, intent('READY', body.business_intent_id));
    });
    await page.route('**/v1/intents/**', async (route) => {
      const id = decodeURIComponent(
        new URL(route.request().url()).pathname.split('/').at(-1) ?? '',
      );
      return json(route, 200, intent(state, id));
    });

    await page.goto('/');
    await fillIntentForm(page);
    await page.getByRole('button', { name: /Submit Intent/u }).click();
    await expect(page.locator('.state-card > div:first-child > strong')).toHaveText('COMMITTED');

    await page.getByRole('tab', { name: 'Authoritative status' }).click();
    await expect(page.locator('.state-card > div:first-child > strong')).toHaveText('COMMITTED');

    state = 'UNKNOWN';
    await page.getByLabel('Business Intent ID').last().fill('intent-browser-unknown');
    await page.getByRole('button', { name: 'Lookup' }).click();
    await expect(page.locator('.state-card > div:first-child > strong')).toHaveText('UNKNOWN');
    await expect(page.getByRole('button', { name: 'Enqueue Reconciliation' })).toBeVisible();
    await expect(page.getByRole('button', { name: /pay|retry|resend|force/iu })).toHaveCount(0);

    state = 'COMMITTED';
    await page.getByRole('tab', { name: 'Settlement evidence' }).click();
    await expect(page.getByRole('heading', { name: 'Transaction' })).toBeVisible();
    await expect(page.locator('main[role="tabpanel"] button')).toHaveCount(0);
    await expect(page.getByRole('link', { name: 'View on the Arc explorer' })).toHaveAttribute(
      'href',
      /arcscan\.app/u,
    );
  });

  test('covers Graph discovery, lag, error, unavailable, and multiple-candidate states', async ({
    page,
  }) => {
    await stubReadiness(page);
    await page.route('**/v1/intents/**', async (route) => {
      const url = new URL(route.request().url());
      const match = /^\/v1\/intents\/([^/]+)(\/recovery-view)?$/u.exec(url.pathname);
      const id = decodeURIComponent(match?.[1] ?? '');
      await json(route, 200, match?.[2] ? recoveryView(id) : intent('UNKNOWN', id));
    });
    await page.goto('/');
    for (const [id, expected] of [
      ['intent-graph-discovery', 'FRESH'],
      ['intent-graph-lag', 'LAGGING'],
      ['intent-graph-error', 'Subgraph MCP unavailable.'],
      ['intent-graph-multiple', 'Multiple candidate observations require review.'],
    ] as const) {
      await selectIntent(page, id, 'Recovery evidence');
      await expect(
        page.getByText(expected, { exact: expected === 'FRESH' || expected === 'LAGGING' }),
      ).toBeVisible();
    }
    await expect(page.getByRole('heading', { name: 'UNKNOWN' })).toBeVisible();
    await expect(page.getByText(/gemini 2.5-flash/u)).toBeVisible();
    await expect(page.getByText('Settlement permission: NEVER')).toBeVisible();
    await expect(page.getByRole('button', { name: /force|pay|submit settlement/iu })).toHaveCount(
      0,
    );
  });

  test('covers keyboard tab navigation and responsive layout', async ({ page }) => {
    await stubReadiness(page);
    await page.goto('/');
    const createTab = page.getByRole('tab', { name: 'Create or replay' });
    await createTab.focus();
    await page.keyboard.press('ArrowRight');
    const statusTab = page.getByRole('tab', { name: 'Authoritative status' });
    await expect(statusTab).toHaveAttribute('aria-selected', 'true');
    await expect(statusTab).toBeFocused();

    for (const width of [390, 1280]) {
      await page.setViewportSize({ width, height: 844 });
      expect(
        await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth),
      ).toBe(true);
    }
  });
});
