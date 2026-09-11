import { expect, test, type Page, type Route } from '@playwright/test';

const JOB_ID = `job_${'a'.repeat(64)}`;
const INTENT_ID = `intent_${'b'.repeat(64)}`;

function job(deliveryState: 'RETRIEVAL_FAILED' | 'AVAILABLE' = 'RETRIEVAL_FAILED') {
  return {
    job_id: JOB_ID,
    task_key: 'report-browser-acme',
    tool_id: 'team-report-v1',
    business_intent_id: INTENT_ID,
    supplier: {
      supplier_id: 'team-report-v1',
      order_reference: 'team_report_order_browser',
      recipient: '0x1111111111111111111111111111111111111111',
      amount_atomic: '2500000',
      asset: 'USDC',
      network: 'eip155:5042002',
      expires_at: '2026-09-10T12:00:00.000Z',
    },
    payment_state: 'COMMITTED',
    delivery_state: deliveryState,
    settlement: {
      provider_reference_id: 'provider_browser',
      transaction_hash: `0x${'c'.repeat(64)}`,
      block_number: '99',
      transfer_log_index: 0,
      explorer_url: `https://testnet.arcscan.app/tx/0x${'c'.repeat(64)}`,
    },
    ...(deliveryState === 'AVAILABLE'
      ? {
          result: {
            order_reference: 'team_report_order_browser',
            result_reference: 'team_report_result_browser',
            report: 'Recovered original supplier report.',
          },
        }
      : {}),
    created_at: '2026-09-10T10:00:00.000Z',
    updated_at: '2026-09-10T10:01:00.000Z',
  };
}

async function json(route: Route, status: number, body: unknown): Promise<void> {
  await route.fulfill({ status, contentType: 'application/json', body: JSON.stringify(body) });
}

async function mockJobApi(page: Page): Promise<string[]> {
  const calls: string[] = [];
  let current = job();
  await page.route('**/health/ready', (route) => json(route, 200, { status: 'ok' }));
  await page.route('**/v1/**', async (route) => {
    const request = route.request();
    const pathname = new URL(request.url()).pathname;
    calls.push(`${request.method()} ${pathname}`);
    if (pathname === '/v1/jobs' && request.method() === 'GET')
      return json(route, 200, { jobs: [current] });
    if (pathname === '/v1/jobs/quote' && request.method() === 'POST')
      return json(route, 200, current.supplier);
    if (pathname === '/v1/jobs' && request.method() === 'POST') return json(route, 202, current);
    if (pathname === `/v1/jobs/${JOB_ID}/resume` && request.method() === 'POST') {
      current = job('AVAILABLE');
      return json(route, 202, current);
    }
    if (pathname === '/v1/activity' && request.method() === 'GET') {
      return json(route, 200, {
        recorded_settlement_count: 1,
        uncertain_job_count: 0,
        unmatched_transfer_count: 0,
        transfers: [],
      });
    }
    if (pathname === '/v1/activity/refresh' && request.method() === 'POST') {
      return json(route, 202, {
        observation: { freshness: 'FRESH', coverage_note: 'Indexed through block 99.' },
        recorded_settlement_count: 1,
        uncertain_job_count: 0,
        unmatched_transfer_count: 0,
        transfers: [],
      });
    }
    return json(route, 404, {});
  });
  return calls;
}

async function unlockWorkspace(page: Page): Promise<void> {
  await page.getByText('Machine token (advanced)').click();
  await page.getByLabel('Machine token').fill('browser-memory-token');
  await expect(page.getByRole('tab', { name: 'Tools' })).toBeVisible();
}

test.describe('resumable job workspace', () => {
  test('keeps the public landing separate from the authenticated cabinet', async ({ page }) => {
    await page.goto('/');
    await expect(
      page.getByRole('heading', { name: 'Resume the job, not the payment.' }),
    ).toBeVisible();
    await expect(page.getByRole('link', { name: 'Open workspace' }).first()).toHaveAttribute(
      'href',
      '/app',
    );

    await page.goto('/app');
    await unlockWorkspace(page);
    await expect(page.getByRole('heading', { name: 'Jobs and results' })).toBeVisible();
  });

  test('starts one job and resumes only its original supplier delivery', async ({ page }) => {
    const calls = await mockJobApi(page);
    await page.goto('/app');
    await unlockWorkspace(page);
    await page.getByRole('tab', { name: 'Tools' }).click();
    await page.getByLabel('Company or domain').fill('acme.com');
    await page.getByLabel('Recipient wallet').fill('0x1111111111111111111111111111111111111111');
    await page.getByLabel('Amount (USDC)').fill('2.5');
    await expect(page.getByLabel('Task key for retries')).toHaveValue(/report-acme-com-/u);
    await page.getByRole('button', { name: 'Get live quote' }).click();
    await expect.poll(() => calls.filter((call) => call === 'POST /v1/jobs/quote')).toHaveLength(1);
    expect(calls).not.toContain('POST /v1/jobs');
    await expect(page.getByRole('heading', { name: 'Review quote before approval' })).toBeVisible();
    await expect(page.getByText('Nothing has been paid yet.')).toBeVisible();
    await page.getByRole('button', { name: 'Approve payment and start job' }).click();
    await expect.poll(() => calls.filter((call) => call === 'POST /v1/jobs')).toHaveLength(1);
    await expect(page.getByRole('status')).toContainText('Payment authorization is queued');
    await expect(page.getByRole('heading', { name: 'Approved payment' })).toBeVisible();
    await expect(
      page.getByRole('region', { name: 'Approved payment' }).getByText('2.500000 USDC'),
    ).toBeVisible();
    await expect(page.getByText('team_report_order_browser')).toBeVisible();
    await page.getByRole('tab', { name: 'Jobs' }).click();
    await expect(page.getByRole('link', { name: 'View the ArcScan transaction' })).toHaveAttribute(
      'href',
      `https://testnet.arcscan.app/tx/0x${'c'.repeat(64)}`,
    );
    await page.getByRole('button', { name: 'Resume delivery (never pays)' }).click();
    await expect(page.getByText('Recovered original supplier report.')).toBeVisible();
  });

  test('shows activity as read-only evidence and keeps the cabinet responsive', async ({
    page,
  }) => {
    await mockJobApi(page);
    await page.goto('/app');
    await unlockWorkspace(page);
    await page.getByRole('tab', { name: 'Recovery & activity' }).click();
    await page.getByRole('button', { name: 'Refresh activity' }).click();
    await expect(page.locator('p[role="status"]')).toContainText('FRESH');
    await expect(page.getByText(/never change payment authority/u)).toBeVisible();
    await page.setViewportSize({ width: 390, height: 844 });
    expect(
      await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth),
    ).toBe(true);
  });
});
