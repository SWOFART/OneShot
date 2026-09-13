import { describe, expect, it } from 'vitest';
import { TeamReportSupplier } from '../src/index.js';

describe('TeamReportSupplier', () => {
  it('replays one non-chargeable order and result for the same task identity', async () => {
    const supplier = new TeamReportSupplier();
    const request = {
      task_key: 'report-acme',
      tool_id: 'team-report-v1' as const,
      report_subject: 'Acme',
      recipient: '0x1111111111111111111111111111111111111111',
      amount_atomic: '2500000',
    };

    const first = await supplier.createOrder(request, 'job_idempotency_1');
    const replay = await supplier.createOrder(request, 'job_idempotency_1');
    const result = await supplier.fulfillOrder(first.order_reference);

    expect(replay).toEqual(first);
    await expect(supplier.getResult(first.order_reference)).resolves.toEqual(result);
    await expect(supplier.fulfillOrder(first.order_reference)).resolves.toEqual(result);
  });

  it('rejects changed payment fields under the same task identity', async () => {
    const supplier = new TeamReportSupplier();
    const request = {
      task_key: 'report-acme',
      tool_id: 'team-report-v1' as const,
      report_subject: 'Acme',
      recipient: '0x1111111111111111111111111111111111111111',
      amount_atomic: '2500000',
    };
    await supplier.createOrder(request, 'job_idempotency_1');

    await expect(
      supplier.createOrder({ ...request, amount_atomic: '2500001' }, 'job_idempotency_1'),
    ).rejects.toThrow('conflicts');
  });

  it('uses the requested recipient and integer atomic quote', async () => {
    const supplier = new TeamReportSupplier();
    const order = await supplier.createOrder(
      {
        task_key: 'arc-demo',
        tool_id: 'team-report-v1',
        report_subject: 'Arc demo',
        recipient: '0x2222222222222222222222222222222222222222',
        amount_atomic: '10000',
      },
      'job_arc_demo',
    );

    expect(order.recipient).toBe('0x2222222222222222222222222222222222222222');
    expect(order.amount_atomic).toBe('10000');
  });

  it('rejects an invalid or zero requested quote', async () => {
    const supplier = new TeamReportSupplier();
    const base = {
      task_key: 'arc-demo',
      tool_id: 'team-report-v1' as const,
      report_subject: 'Arc demo',
      recipient: '0x2222222222222222222222222222222222222222',
      amount_atomic: '10000',
    };
    await expect(
      supplier.createOrder({ ...base, recipient: 'not-an-address' }, 'invalid'),
    ).rejects.toThrow('recipient');
    await expect(supplier.createOrder({ ...base, amount_atomic: '0' }, 'zero')).rejects.toThrow(
      'greater than zero',
    );
  });
});
