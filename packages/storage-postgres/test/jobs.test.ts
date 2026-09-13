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
    const foreignHash = `0x${'d'.repeat(64)}`;
    const workspaceWallet = '0x2222222222222222222222222222222222222222';
    const foreignWallet = '0x3333333333333333333333333333333333333333';
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
                      sender: workspaceWallet,
                      recipient: failedJob.supplier_quote.recipient,
                      amount_atomic: failedJob.supplier_quote.amount_atomic,
                    },
                    {
                      transaction_hash: foreignHash,
                      log_index: 9,
                      sender: foreignWallet,
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
        if (sql.includes('AS payer_wallet')) return { rows: [{ payer_wallet: workspaceWallet }] };
        if (sql.includes('workspace_transaction_hashes')) {
          return { rows: [{ transaction_hash: recordedHash }] };
        }
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

  it('excludes shared server wallet transfers that belong to another workspace', async () => {
    const foreignHash = `0x${'e'.repeat(64)}`;
    const serverWallet = '0x4444444444444444444444444444444444444444';
    const pool = {
      async query(sql: string) {
        if (sql.includes('FROM wallet_activity_observations')) {
          return {
            rows: [
              {
                freshness: 'FRESH',
                coverage_note: 'indexed',
                observed_at: new Date('2026-09-07T12:00:00.000Z'),
                payload: {
                  transfers: [
                    {
                      transaction_hash: foreignHash,
                      log_index: 1,
                      sender: serverWallet,
                      recipient: failedJob.supplier_quote.recipient,
                      amount_atomic: failedJob.supplier_quote.amount_atomic,
                    },
                  ],
                },
              },
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
      unmatched_transfer_count: 0,
      transfers: [],
    });
  });

  it('projects every site outcome with its Graph match status', async () => {
    const indexedHash = `0x${'c'.repeat(64)}`;
    const rejectedJob = {
      job_id: 'job-rejected-site',
      business_intent_id: 'intent-rejected-site',
      payment_state: 'REJECTED' as const,
      payment_mode: 'USER_WALLET' as const,
      transaction_hash: null,
      recipient: failedJob.supplier_quote.recipient,
      amount_atomic: failedJob.supplier_quote.amount_atomic,
      transfer_log_index: null,
    };
    const failedJobActivity = {
      job_id: 'job-failed-site',
      business_intent_id: 'intent-failed-site',
      payment_state: 'FAILED_SAFE' as const,
      payment_mode: 'USER_WALLET' as const,
      transaction_hash: indexedHash,
      recipient: failedJob.supplier_quote.recipient,
      amount_atomic: failedJob.supplier_quote.amount_atomic,
      transfer_log_index: null,
    };
    const pool = {
      async query(sql: string) {
        if (sql.includes('FROM wallet_activity_observations')) {
          return {
            rows: [
              {
                freshness: 'FRESH',
                coverage_note: 'indexed',
                observed_at: new Date('2026-09-07T12:00:00.000Z'),
                payload: {
                  transfers: [
                    {
                      transaction_hash: indexedHash,
                      log_index: 7,
                      recipient: failedJob.supplier_quote.recipient,
                      amount_atomic: failedJob.supplier_quote.amount_atomic,
                      block_number: '123',
                    },
                  ],
                },
              },
            ],
          };
        }
        if (sql.includes('FROM settlements s')) return { rows: [] };
        if (sql.includes("i.state = 'UNKNOWN'")) return { rows: [{ count: '0' }] };
        if (sql.includes('workspace_transaction_hashes')) {
          return { rows: [{ transaction_hash: indexedHash }] };
        }
        if (sql.includes('SELECT j.job_id, j.business_intent_id')) {
          return { rows: [failedJobActivity, rejectedJob] };
        }
        if (sql.includes('recorded')) return { rows: [{ count: '0' }] };
        return { rows: [] };
      },
    };
    const ledger = new JobLedger(pool as never, {
      now: () => new Date('2026-09-07T12:01:00.000Z'),
      nextAttemptId: () => 'unused',
    });

    await expect(ledger.activity('workspace-unit')).resolves.toMatchObject({
      transactions: [
        {
          business_intent_id: 'intent-failed-site',
          payment_state: 'FAILED_SAFE',
          graph_status: 'INDEXED_TRANSFER',
          graph_block_number: '123',
          graph_log_index: 7,
        },
        {
          business_intent_id: 'intent-rejected-site',
          payment_state: 'REJECTED',
          graph_status: 'NO_TRANSACTION_HASH',
        },
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
    const outbox = calls.find((call) => call.sql.includes('INSERT INTO outbox_jobs'));
    expect(outbox?.values?.[1]).toBe(`fulfill:${failedJob.job_id}:team_report_order_unit:2`);
    expect(outbox?.values?.[2]).toBe(
      JSON.stringify({ job_id: failedJob.job_id, delivery_attempt: 2 }),
    );
    expect(calls.some((call) => call.sql.includes('submit_settlement'))).toBe(false);
    expect(calls.some((call) => call.sql.includes('attempts'))).toBe(false);
  });

  it('does not enqueue a duplicate delivery while an attempt is already queued', async () => {
    const calls: string[] = [];
    const pendingJob = { ...failedJob, delivery_state: 'PENDING' as const };
    const client = {
      async query(sql: string) {
        calls.push(sql);
        if (sql.includes('FOR UPDATE OF j') || sql.includes('WHERE j.workspace_id')) {
          return { rows: [pendingJob] };
        }
        // The fulfilment row is still queued, or a worker is holding it: either
        // way something will still move this delivery.
        if (sql.includes('FROM outbox_jobs')) return { rows: [{ '?column?': 1 }], rowCount: 1 };
        return { rows: [], rowCount: 0 };
      },
      release() {},
    };
    const ledger = new JobLedger({ connect: async () => client } as never, {
      now: () => new Date('2026-09-07T12:02:00.000Z'),
      nextAttemptId: () => 'unused',
    });

    await ledger.resumeDelivery('workspace-unit', pendingJob.job_id);

    expect(calls.some((sql) => sql.includes('RETURNING delivery_attempt'))).toBe(false);
    expect(calls.some((sql) => sql.includes('INSERT INTO outbox_jobs'))).toBe(false);
  });

  /**
   * The payment is committed and the result was never retrieved, but nothing is
   * queued to retrieve it: the worker no-ops a payload whose delivery_attempt no
   * longer matches and then marks the row DELIVERED. PENDING was not resumable,
   * so such a job could never move again.
   */
  it('re-queues a pending delivery that has no fulfilment work left', async () => {
    const calls: Array<{ sql: string; values?: readonly unknown[] }> = [];
    const strandedJob = { ...failedJob, delivery_state: 'PENDING' as const };
    const client = {
      async query(sql: string, values?: readonly unknown[]) {
        calls.push({ sql, values });
        if (sql.includes('FOR UPDATE OF j')) return { rows: [strandedJob], rowCount: 1 };
        if (sql.includes('RETURNING delivery_attempt')) {
          return { rows: [{ delivery_attempt: 2 }], rowCount: 1 };
        }
        if (sql.includes('WHERE j.workspace_id')) {
          return { rows: [{ ...strandedJob, delivery_attempt: 2 }], rowCount: 1 };
        }
        // Nothing queued and nothing in flight.
        return { rows: [], rowCount: 0 };
      },
      release() {},
    };
    const ledger = new JobLedger({ connect: async () => client } as never, {
      now: () => new Date('2026-09-07T12:02:00.000Z'),
      nextAttemptId: () => 'unused',
    });

    await ledger.resumeDelivery('workspace-unit', strandedJob.job_id);

    // Claimed against the state read under the row lock, so two concurrent
    // resumes cannot both take it.
    const claim = calls.find((call) => call.sql.includes('RETURNING delivery_attempt'));
    expect(claim?.values?.[2]).toBe('PENDING');
    // A fresh attempt fences the retrieval, and no payment work is created.
    const outbox = calls.find((call) => call.sql.includes('INSERT INTO outbox_jobs'));
    expect(outbox?.values?.[1]).toBe(`fulfill:${strandedJob.job_id}:team_report_order_unit:2`);
    expect(outbox?.values?.[2]).toBe(
      JSON.stringify({ job_id: strandedJob.job_id, delivery_attempt: 2 }),
    );
    expect(calls.some((call) => call.sql.includes('submit_settlement'))).toBe(false);
    expect(calls.some((call) => call.sql.includes('attempts'))).toBe(false);
  });
});
