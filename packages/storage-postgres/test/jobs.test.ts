import { describe, expect, it } from 'vitest';
import { JobLedger } from '../src/index.js';

const failedJob = {
  job_id: `job_${'a'.repeat(64)}`,
  request_fingerprint: 'b'.repeat(64),
  task_key: 'report-acme',
  tool_id: 'team-report-v1' as const,
  business_intent_id: 'intent-job-unit',
  supplier_order_reference: 'team_report_order_unit',
  supplier_quote: {
    supplier_id: 'team-report-v1' as const,
    order_reference: 'team_report_order_unit',
    recipient: '0x1111111111111111111111111111111111111111',
    amount_atomic: '2500000',
    asset: 'USDC' as const,
    network: 'eip155:5042002' as const,
    expires_at: '2026-09-08T12:00:00.000Z',
    supplier_payload_fingerprint: 'b'.repeat(64),
  },
  delivery_state: 'RETRIEVAL_FAILED' as const,
  delivery_attempt: 1,
  result_reference: null,
  result_payload: null,
  created_at: new Date('2026-09-07T12:00:00.000Z'),
  updated_at: new Date('2026-09-07T12:01:00.000Z'),
  payment_state: 'COMMITTED' as const,
};

describe('JobLedger delivery recovery', () => {
  it('fences a resumed retrieval with a fresh outbox key and never creates payment work', async () => {
    const calls: Array<{ sql: string; values?: readonly unknown[] }> = [];
    const client = {
      async query(sql: string, values?: readonly unknown[]) {
        calls.push({ sql, values });
        if (sql.includes('FOR UPDATE OF j')) return { rows: [failedJob] };
        if (sql.includes('RETURNING delivery_attempt')) return { rows: [{ delivery_attempt: 2 }] };
        if (sql.includes('WHERE j.workspace_id')) {
          return { rows: [{ ...failedJob, delivery_state: 'PENDING', delivery_attempt: 2 }] };
        }
        return { rows: [] };
      },
      release() {},
    };
    const ledger = new JobLedger({ connect: async () => client } as never, {
      now: () => new Date('2026-09-07T12:02:00.000Z'),
      nextAttemptId: () => 'unused',
    });

    const resumed = await ledger.resumeDelivery('workspace-unit', failedJob.job_id);

    expect(resumed).toMatchObject({ delivery_state: 'PENDING', payment_state: 'COMMITTED' });
    const outbox = calls.find((call) => call.sql.includes("'fulfill_supplier_order'"));
    expect(outbox?.values?.[1]).toBe(`fulfill:${failedJob.job_id}:team_report_order_unit:2`);
    expect(outbox?.values?.[2]).toBe(
      JSON.stringify({ job_id: failedJob.job_id, delivery_attempt: 2 }),
    );
    expect(calls.some((call) => call.sql.includes('submit_settlement'))).toBe(false);
    expect(calls.some((call) => call.sql.includes('attempts'))).toBe(false);
  });

  it('does not enqueue a duplicate delivery while an attempt is already pending', async () => {
    const calls: string[] = [];
    const pendingJob = { ...failedJob, delivery_state: 'PENDING' as const };
    const client = {
      async query(sql: string) {
        calls.push(sql);
        if (sql.includes('FOR UPDATE OF j') || sql.includes('WHERE j.workspace_id')) {
          return { rows: [pendingJob] };
        }
        return { rows: [] };
      },
      release() {},
    };
    const ledger = new JobLedger({ connect: async () => client } as never, {
      now: () => new Date('2026-09-07T12:02:00.000Z'),
      nextAttemptId: () => 'unused',
    });

    await ledger.resumeDelivery('workspace-unit', pendingJob.job_id);

    expect(calls.some((sql) => sql.includes('RETURNING delivery_attempt'))).toBe(false);
    expect(calls.some((sql) => sql.includes("'fulfill_supplier_order'"))).toBe(false);
  });
});
