import { expect, test, type Page, type Route } from '@playwright/test';

async function json(route: Route, status: number, body: unknown): Promise<void> {
  await route.fulfill({ status, contentType: 'application/json', body: JSON.stringify(body) });
}

async function unlockWorkspace(page: Page): Promise<void> {
  await page.getByText('Machine token (advanced)').click();
  await page.getByLabel('Machine token').fill('browser-memory-token');
  await expect(page.getByRole('tab', { name: 'Overview' })).toBeVisible();
}

test('cabinet activity refresh is authenticated, read-only, and does not persist the machine token', async ({
  page,
}) => {
  const headers: string[] = [];
  await page.route('**/health/ready', (route) => json(route, 200, { status: 'ok' }));
  await page.route('**/v1/**', async (route: Route) => {
    headers.push((await route.request().allHeaders()).authorization ?? '');
    const pathname = new URL(route.request().url()).pathname;
    if (pathname === '/v1/activity/refresh') {
      return json(route, 202, {
        observation: { freshness: 'LAGGING', coverage_note: 'Newest 100 indexed transfers only.' },
        recorded_settlement_count: 1,
        uncertain_job_count: 0,
        unmatched_transfer_count: 0,
        transfers: [],
      });
    }
    if (pathname === '/v1/activity') {
      return json(route, 200, {
        recorded_settlement_count: 1,
        uncertain_job_count: 0,
        unmatched_transfer_count: 0,
        transfers: [],
      });
    }
    return json(route, 200, { jobs: [] });
  });

  await page.goto('/app');
  await unlockWorkspace(page);
  await page.getByRole('tab', { name: 'Payment protection' }).click();
  await page.getByRole('button', { name: 'Check payment activity' }).click();
  await expect(page.locator('.workspace-status')).toContainText('LAGGING');
  expect(headers).toContain('Bearer browser-memory-token');
  expect(await page.evaluate(() => [localStorage.length, sessionStorage.length])).toEqual([0, 0]);
  expect(await page.locator('body').innerText()).not.toContain('browser-memory-token');
  await expect(
    page.getByRole('button', { name: /^(?:pay|force|submit settlement)$/iu }),
  ).toHaveCount(0);
});
