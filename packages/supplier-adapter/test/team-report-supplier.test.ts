import { describe, expect, it } from 'vitest';
import { TeamReportSupplier } from '../src/index.js';

describe('TeamReportSupplier', () => {
  it('replays one non-chargeable order and result for the same task identity', async () => {
    const supplier = new TeamReportSupplier();
    const request = {
      task_key: 'report-acme',
      tool_id: 'team-report-v1' as const,
      report_subject: 'Acme',
    };

    const first = await supplier.createOrder(request, 'job_idempotency_1');
    const replay = await supplier.createOrder(request, 'job_idempotency_1');
    const result = await supplier.fulfillOrder(first.order_reference);

    expect(replay).toEqual(first);
    await expect(supplier.getResult(first.order_reference)).resolves.toEqual(result);
    await expect(supplier.fulfillOrder(first.order_reference)).resolves.toEqual(result);
  });
});
