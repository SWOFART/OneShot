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

  it('uses an explicit team-operated recipient and integer atomic quote', async () => {
    const supplier = new TeamReportSupplier({
      recipient: '0x2222222222222222222222222222222222222222',
      amountAtomic: '10000',
    });
    const order = await supplier.createOrder(
      { task_key: 'arc-demo', tool_id: 'team-report-v1', report_subject: 'Arc demo' },
      'job_arc_demo',
    );

    expect(order.recipient).toBe('0x2222222222222222222222222222222222222222');
    expect(order.amount_atomic).toBe('10000');
  });

  it('rejects an invalid or zero configured quote', () => {
    expect(
      () => new TeamReportSupplier({ recipient: 'not-an-address', amountAtomic: '10000' }),
    ).toThrow('recipient');
    expect(
      () =>
        new TeamReportSupplier({
          recipient: '0x2222222222222222222222222222222222222222',
          amountAtomic: '0',
        }),
    ).toThrow('greater than zero');
  });
});
