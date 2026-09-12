import axe from 'axe-core';

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
  await expect(page.getByRole('tab', { name: 'API services' })).toBeVisible();
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
    await page.getByRole('tab', { name: 'Requests' }).click();
    await expect(page.getByRole('heading', { name: 'Requests and results' })).toBeVisible();
    await expect(page.getByText('Payment evidence', { exact: true })).toHaveCount(0);
  });

  test('starts one job and resumes only its original supplier delivery', async ({ page }) => {
    const calls = await mockJobApi(page);
    await page.goto('/app');
    await unlockWorkspace(page);
    await page.getByRole('tab', { name: 'API services' }).click();
    await page.getByLabel('Company or domain').fill('acme.com');
    await page
      .getByLabel('Service destination wallet')
      .fill('0x1111111111111111111111111111111111111111');
    await page.getByLabel('Amount (USDC)').fill('2.5');
    await page.getByText('Request key (advanced)').click();
    await expect(page.locator('#generated-task-key')).toHaveValue(/report-acme-com-/u);
    await page
      .getByRole('region', { name: 'Company research service' })
      .getByRole('button', { name: 'Review payment details' })
      .click();
    await expect.poll(() => calls.filter((call) => call === 'POST /v1/jobs/quote')).toHaveLength(1);
    expect(calls).not.toContain('POST /v1/jobs');
    await expect(page.getByRole('heading', { name: 'Review before approval' })).toBeVisible();
    await expect(page.getByText('Nothing has been paid yet.')).toBeVisible();
    await page.getByRole('button', { name: 'Approve and run service' }).click();
    await expect.poll(() => calls.filter((call) => call === 'POST /v1/jobs')).toHaveLength(1);
    await expect(page.getByRole('status')).toContainText('Payment authorization is queued');
    await expect(page.getByRole('heading', { name: 'Request accepted' })).toBeVisible();
    await expect(page.getByText('2.500000 USDC')).toBeVisible();
    await page.getByText('Show supplier details').click();
    await expect(page.getByText('team_report_order_browser')).toBeVisible();
    await page.getByRole('tab', { name: 'Requests' }).click();
    await expect(page.getByRole('link', { name: 'View the ArcScan transaction' })).toHaveAttribute(
      'href',
      `https://testnet.arcscan.app/tx/0x${'c'.repeat(64)}`,
    );
    await page.getByRole('button', { name: 'Resume result (no new payment)' }).click();
    await expect(page.getByText('Recovered original supplier report.')).toBeVisible();
  });

  test('shows activity as read-only evidence and keeps the cabinet responsive', async ({
    page,
  }) => {
    await mockJobApi(page);
    await page.goto('/app');
    await unlockWorkspace(page);
    await page.getByRole('tab', { name: 'Payment protection' }).click();
    await page.getByRole('button', { name: 'Check payment activity' }).click();
    await expect(page.locator('.workspace-status')).toContainText('FRESH');
    await expect(page.getByText(/payment records unchanged/u)).toBeVisible();
    await page.setViewportSize({ width: 390, height: 844 });
    expect(
      await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth),
    ).toBe(true);
  });
});

for (const theme of ['light', 'dark'] as const) {
  for (const width of [390, 1440]) {
    test(`readable ${theme} surfaces and aligned cabinet at ${width}px`, async ({ page }) => {
      test.setTimeout(60_000);
      await page.setViewportSize({ width, height: 1000 });
      await page.addInitScript((value) => localStorage.setItem('oneshot.theme', value), theme);
      await mockJobApi(page);
      const checkContrast = async () => {
        await page.addScriptTag({ content: axe.source });
        const violations = await page.evaluate(async () => {
          const checker = (window as unknown as { axe: typeof axe }).axe;
          const result = await checker.run(document, { runOnly: ['color-contrast'] });
          return result.violations.map((item) => ({
            id: item.id,
            nodes: item.nodes.map((node) => ({
              target: node.target,
              failure: node.failureSummary,
            })),
          }));
        });
        expect(violations).toEqual([]);
        expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(
          true,
        );
      };
      await page.goto('/');
      await expect(page.locator('html')).toHaveAttribute('data-theme', theme);
      await checkContrast();
      const hero = await page.locator('.hero-plain').boundingBox();
      for (const selector of ['h1', '.hero-actions']) {
        const content = await page.locator(`.hero-plain ${selector}`).boundingBox();
        expect(content!.y).toBeGreaterThanOrEqual(hero!.y);
        expect(content!.y + content!.height).toBeLessThanOrEqual(hero!.y + hero!.height);
      }
      await page.screenshot({
        path: test.info().outputPath(`landing-${theme}-${width}.png`),
        fullPage: true,
      });
      await page.goto('/app');
      await unlockWorkspace(page);
      const identity = await page.locator('.operator-identity').boundingBox();
      const header = await page.locator('.cabinet-header .hero-plain').boundingBox();
      expect(identity).not.toBeNull();
      expect(header?.x).toBeCloseTo(identity!.x, 0);
      expect(header?.width).toBeCloseTo(identity!.width, 0);
      for (const label of [
        'Overview',
        'API services',
        'Requests',
        'Payment protection',
        'Spending rules',
        'Team & access',
      ]) {
        await page.getByRole('tab', { name: label, exact: true }).click();
        await page.getByRole('tab', { name: label, exact: true }).hover();
        await page.getByRole('tab', { name: label, exact: true }).focus();
        if (label === 'API services') {
          await page.getByText('Request key (advanced)').click();
          await page.getByLabel('Company or domain').fill('acme.com');
          await page
            .getByLabel('Service destination wallet')
            .fill('0x1111111111111111111111111111111111111111');
          await page.getByLabel('Amount (USDC)').fill('2.5');
          await page
            .getByRole('region', { name: 'Company research service' })
            .getByRole('button', { name: 'Review payment details' })
            .click();
          await expect(page.getByRole('heading', { name: 'Review before approval' })).toBeVisible();
        }
        if (label === 'Requests') {
          await page.getByRole('button', { name: 'Resume result (no new payment)' }).click();
          await expect(page.getByText('Recovered original supplier report.')).toBeVisible();
          const results = await page
            .getByRole('region', { name: 'Requests and results' })
            .boundingBox();
          expect(results?.x).toBeCloseTo(identity!.x, 0);
          expect(results?.width).toBeCloseTo(identity!.width, 0);
        }
        await checkContrast();
      }
      await page.screenshot({
        path: test.info().outputPath(`cabinet-${theme}-${width}.png`),
        fullPage: true,
      });
    });
  }
}
