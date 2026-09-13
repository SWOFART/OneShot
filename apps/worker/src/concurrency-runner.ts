import type { WorkerOptions } from './types.js';
import { executeSubmitSettlement } from './worker.js';

export interface ConcurrencyRunResult {
  readonly intentId: string;
  readonly totalWorkers: number;
  readonly finalState: string;
  readonly externalSubmissionCalls: number;
  readonly committedSettlementCount: number;
  readonly attemptCount: number;
  readonly success: boolean;
}

export async function runConcurrencyTest(
  intentId: string,
  options: WorkerOptions,
  workerCount = 10,
): Promise<ConcurrencyRunResult> {
  let externalCalls = 0;
  const wrappedPort: WorkerOptions['settlementPort'] = {
    async submit(intent, metadata) {
      externalCalls += 1;
      return options.settlementPort.submit(intent, metadata);
    },
  };
  const wrappedOptions: WorkerOptions = {
    ...options,
    settlementPort: wrappedPort,
  };

  // Fire N parallel workers attempting to execute submission concurrently
  await Promise.all(
    Array.from({ length: workerCount }, () => executeSubmitSettlement(intentId, wrappedOptions)),
  );

  const intent = await options.ledger.getIntent(intentId);
  const client = await options.pool.connect();
  let settlementCount: number;
  try {
    const res = await client.query<{ count: string }>(
      'SELECT count(*)::text AS count FROM settlements WHERE business_intent_id = $1',
      [intentId],
    );
    settlementCount = Number(res.rows[0]?.count ?? '0');
  } finally {
    client.release();
  }

  return {
    intentId,
    totalWorkers: workerCount,
    finalState: intent?.state ?? 'UNKNOWN',
    externalSubmissionCalls: externalCalls,
    committedSettlementCount: settlementCount,
    attemptCount: intent?.attempts.length ?? 0,
    success: settlementCount <= 1,
  };
}
