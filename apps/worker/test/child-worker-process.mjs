import { Pool } from 'pg';
import { IntentLedger } from '@oneshot/storage-postgres';
import { executeSubmitSettlement } from '../dist/index.js';

process.on('message', async (message) => {
  const { connectionString, intentId, workerId } = message;
  const pool = new Pool({ connectionString, max: 2 });
  let calledPort = false;

  const ledger = new IntentLedger(pool, {
    now: () => new Date('2026-09-07T12:00:00.000Z'),
    nextAttemptId: () => `attempt-proc-${workerId}-${Date.now()}`,
  });

  const settlementPort = {
    async submit() {
      calledPort = true;
      // Simulate real latency to increase contention window
      await new Promise((resolve) => setTimeout(resolve, 80));
      return {
        kind: 'CONFIRMED',
        provider_reference_id: `provider-proc-${workerId}`,
        transaction_hash: `0x${'e'.repeat(64)}`,
        block_number: '77777',
        transfer_log_index: 0,
      };
    },
  };

  try {
    await executeSubmitSettlement(intentId, {
      pool,
      ledger,
      settlementPort,
    });
    process.send({
      workerId,
      calledPort,
      success: true,
    });
  } catch (error) {
    process.send({
      workerId,
      calledPort,
      success: false,
      error: error instanceof Error ? error.message : String(error),
    });
  } finally {
    await pool.end();
  }
});
