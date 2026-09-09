import { expect, test, type Page, type Route } from '@playwright/test';

const RECIPIENT = '0x1111111111111111111111111111111111111111';
const TX_HASH = `0x${'a'.repeat(64)}`;

function intent(id: string) {
  const denied = id.includes('denied');
  const committed = id.includes('committed');
  const state = denied ? 'REJECTED' : committed ? 'COMMITTED' : 'UNKNOWN';
  return {
    business_intent_id: id,
    recipient: RECIPIENT,
    amount_atomic: '1000000',
    asset: 'USDC',
    network: 'eip155:5042002',
    purpose: 'P5 browser acceptance',
    payload_fingerprint: 'a'.repeat(64),
    state,
    version: 4,
    policy: {
      policy_id: 'policy-p5',
      status: denied ? 'EXCEEDED' : 'CONFIGURED',
      settlement_cap_atomic: '1000000',
      allowed_recipients: [RECIPIENT],
    },
    attempts: [
      {
        attempt_id: 'attempt-p5',
        stage: state,
        created_at: '2026-09-09T09:00:00.000Z',
        authorization_status: denied ? 'DENIED' : 'AUTHORIZED',
        ...(denied ? { sanitized_error: 'Settlement cap exceeded.' } : {}),
      },
    ],
    ...(committed
      ? {
          settlement: {
            provider_reference_id: 'privy-p5',
            transaction_hash: TX_HASH,
            block_number: '61116056',
            transfer_log_index: 23,
            token_contract: '0x3600000000000000000000000000000000000000',
            explorer_url: `https://testnet.arcscan.app/tx/${TX_HASH}`,
          },
        }
      : {}),
    evidence: committed
      ? [
          {
            source: 'ARC',
            authority_class: 'AUTHORITATIVE',
            retrieved_at: '2026-09-09T09:01:00.000Z',
            digest: 'arc-proof',
            block_number: '61116056',
          },
        ]
      : [],
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

async function mockApi(page: Page): Promise<void> {
  const created = new Map<string, string>();
  await page.route('**/health/ready', async (route) =>
    route.fulfill({ status: 200, contentType: 'application/json', body: '{"status":"ok"}' }),
  );
  await page.route('**/v1/**', async (route) => {
    const request = route.request();
    const url = new URL(request.url());
    if (request.method() === 'POST' && url.pathname === '/v1/intents') {
      const body = request.postData() ?? '';
      const parsed = JSON.parse(body) as { business_intent_id: string };
      const previous = created.get(parsed.business_intent_id);
      if (previous !== undefined && previous !== body) {
        await route.fulfill({
          status: 409,
          contentType: 'application/json',
          body: JSON.stringify({ code: 'INTENT_PAYLOAD_CONFLICT', message: 'Conflict' }),
        });
        return;
      }
      created.set(parsed.business_intent_id, body);
      await route.fulfill({
        status: previous === undefined ? 202 : 200,
        contentType: 'application/json',
        body: JSON.stringify(intent(parsed.business_intent_id)),
      });
      return;
    }
    const match = /^\/v1\/intents\/([^/]+)(\/recovery-view)?$/u.exec(url.pathname);
    const id = decodeURIComponent(match?.[1] ?? '');
    if (id.includes('service-unavailable')) {
      await route.fulfill({ status: 503, contentType: 'application/json', body: '{}' });
      return;
    }
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify(match?.[2] ? recoveryView(id) : intent(id)),
    });
  });
}

async function selectIntent(page: Page, id: string, tab: string): Promise<void> {
  await page.getByLabel('Active Business Intent ID').fill(id);
  await page.getByRole('button', { name: tab }).click();
}

test.beforeEach(async ({ page }) => {
  await mockApi(page);
  await page.goto('/');
});

test('create, replay, and conflict preserve one Business Intent ID', async ({ page }) => {
  const id = 'intent-browser-create';
  await page.getByLabel('Business Intent ID', { exact: true }).fill(id);
  await page.getByLabel('Recipient').fill(RECIPIENT);
  await page.getByRole('button', { name: 'Submit Intent (or Replay)' }).click();
  await expect(page.getByText('ACCEPTED — new intent')).toBeVisible();
  await page.getByRole('button', { name: 'Submit Intent (or Replay)' }).click();
  await expect(page.getByText('REPLAYED — identical payload')).toBeVisible();
  await page.getByLabel('Amount in USDC').fill('2');
  await page.getByRole('button', { name: 'Submit Intent (or Replay)' }).click();
  await expect(page.getByText('PAYLOAD CONFLICT')).toBeVisible();
  await expect(page.getByLabel('Business Intent ID', { exact: true })).toHaveValue(id);
});

test('policy denial and committed settlement render through B05', async ({ page }) => {
  await selectIntent(page, 'intent-denied', 'Settlement details');
  await expect(page.getByText('Denied', { exact: true })).toBeVisible();
  await selectIntent(page, 'intent-committed', 'Settlement details');
  await expect(page.getByText('Committed', { exact: true })).toBeVisible();
  await expect(page.getByRole('link', { name: /View on the Arc explorer/u })).toBeVisible();
});

test('UNKNOWN and Graph discovery degradation render through C05', async ({ page }) => {
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
  await expect(page.getByRole('button', { name: /force|pay|submit settlement/iu })).toHaveCount(0);
});

test('service-unavailable, keyboard, responsive, and token-memory checks fail safe', async ({
  page,
}) => {
  const seenHeaders: string[] = [];
  await page.unroute('**/v1/**');
  await page.route('**/v1/**', async (route: Route) => {
    seenHeaders.push((await route.request().allHeaders()).authorization ?? '');
    await route.fulfill({ status: 503, contentType: 'application/json', body: '{}' });
  });
  await page.getByLabel('Demo service token').fill('browser-memory-token');
  await selectIntent(page, 'intent-service-unavailable', 'Recovery evidence');
  await expect(page.getByRole('alert')).toContainText('Evidence unavailable');
  expect(seenHeaders).toContain('Bearer browser-memory-token');
  expect(await page.evaluate(() => [localStorage.length, sessionStorage.length])).toEqual([0, 0]);
  expect(await page.locator('body').innerText()).not.toContain('browser-memory-token');

  await page.setViewportSize({ width: 390, height: 844 });
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= document.documentElement.clientWidth,
    ),
  ).toBe(true);
  await page.getByRole('button', { name: 'Create or replay' }).focus();
  await page.keyboard.press('Tab');
  await expect(page.getByRole('button', { name: 'Authoritative status' })).toBeFocused();
});
