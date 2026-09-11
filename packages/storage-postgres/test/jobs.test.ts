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
  it('rejects malformed activity before writing an observation', async () => {
    let writes = 0;
    const ledger = new JobLedger(
      {
        query: async () => {
          writes += 1;
          return { rows: [] };
        },
      } as never,
      { now: () => new Date('2026-09-07T12:01:00.000Z'), nextAttemptId: () => 'unused' },
    );

    await expect(
      ledger.recordActivityObservation({
        workspaceId: 'workspace-unit',
        freshness: 'FRESH',
        coverageNote: 'indexed',
        payload: { transfers: [{ transaction_hash: 'not-a-hash' }] },
      }),
    ).rejects.toThrow('Stored Graph activity observation failed validation');
    expect(writes).toBe(0);
  });

  it('matches indexed transfers to workspace settlements and surfaces unmatched activity', async () => {
    const recordedHash = `0x${'a'.repeat(64)}`;
    const unmatchedHash = `0x${'b'.repeat(64)}`;
    const pool = {
      async query(sql: string) {
        if (sql.includes('FROM wallet_activity_observations')) {
          return {
            rows: [
              {
                freshness: 'FRESH',
                coverage_note: 'indexed through block 100',
                observed_at: new Date('2026-09-07T12:00:00.000Z'),
                payload: {
                  deployment: 'studio-deployment',
                  transfers: [
                    {
                      transaction_hash: recordedHash,
                      log_index: 2,
                      recipient: failedJob.supplier_quote.recipient,
                      amount_atomic: failedJob.supplier_quote.amount_atomic,
                    },
                    {
                      transaction_hash: unmatchedHash,
                      log_index: 4,
                      recipient: failedJob.supplier_quote.recipient,
                      amount_atomic: failedJob.supplier_quote.amount_atomic,
                    },
                  ],
                },
              },
            ],
          };
        }
        if (sql.includes('FROM settlements s')) {
          return {
            rows: [
              { transaction_hash: recordedHash, transfer_log_index: 2, job_id: failedJob.job_id },
            ],
          };
        }
        if (sql.includes('SELECT count(*)::text AS count FROM (') && sql.includes('recorded')) {
          return { rows: [{ count: '1' }] };
        }
        if (sql.includes("i.state = 'UNKNOWN'")) return { rows: [{ count: '0' }] };
        return { rows: [] };
      },
    };
    const ledger = new JobLedger(pool as never, {
      now: () => new Date('2026-09-07T12:01:00.000Z'),
      nextAttemptId: () => 'unused',
    });

    await expect(ledger.activity('workspace-unit')).resolves.toMatchObject({
      recorded_settlement_count: 1,
      uncertain_job_count: 0,
      unmatched_transfer_count: 1,
      transfers: [
        {
          transaction_hash: recordedHash,
          log_index: 2,
          match: 'RECORDED_SETTLEMENT',
          job_id: failedJob.job_id,
        },
        { transaction_hash: unmatchedHash, log_index: 4, match: 'UNMATCHED' },
      ],
    });
  });

  it('projects committed settlement evidence with the Arc Testnet explorer link', async () => {
    const settledJob = {
      ...failedJob,
      settlement_provider_reference_id: 'privy_provider_1',
      settlement_transaction_hash: `0x${'c'.repeat(64)}`,
      settlement_block_number: '99',
      settlement_transfer_log_index: 0,
    };
    const client = {
      async query(sql: string) {
        if (sql.includes('WHERE j.workspace_id')) return { rows: [settledJob] };
        return { rows: [] };
      },
      release() {},
    };
    const ledger = new JobLedger({ connect: async () => client } as never, {
      now: () => new Date('2026-09-07T12:02:00.000Z'),
      nextAttemptId: () => 'unused',
    });

    await expect(ledger.get('workspace-unit', failedJob.job_id)).resolves.toMatchObject({
      settlement: {
        provider_reference_id: 'privy_provider_1',
        transaction_hash: `0x${'c'.repeat(64)}`,
        explorer_url: `https://testnet.arcscan.app/tx/0x${'c'.repeat(64)}`,
      },
    });
  });

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
