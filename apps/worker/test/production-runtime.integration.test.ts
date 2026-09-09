import { PostgreSqlContainer, type StartedPostgreSqlContainer } from '@testcontainers/postgresql';
import { loadSettlementConfig } from '@oneshot/arc-adapter';
import { buildApi, staticBearerAuthenticator } from '../../api/src/index.js';
import { IntentLedger, migrate } from '@oneshot/storage-postgres';
import { Pool } from 'pg';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { composeWorker } from '../src/composition.js';
import { startWorkerRuntime } from '../src/runtime.js';
import type { WorkerRuntimeConfig } from '../src/runtime-config.js';

const describePostgres = process.env.TEST_POSTGRES === '1' ? describe : describe.skip;

describePostgres('production worker API to adapter path', () => {
  let container: StartedPostgreSqlContainer;
  let pool: Pool;

  beforeAll(async () => {
    container = await new PostgreSqlContainer('postgres:16.4-alpine').start();
    pool = new Pool({ connectionString: container.getConnectionUri(), max: 20 });
    await migrate(pool);
  });

  afterAll(async () => {
    if (pool) await pool.end();
    if (container) await container.stop();
  });

  it('flows API create and replay through PostgreSQL and the continuous runner exactly once', async () => {
    let submissions = 0;
    const config: WorkerRuntimeConfig = {
      host: '127.0.0.1',
      port: 0,
      database: { connectionString: container.getConnectionUri() },
      settlement: loadSettlementConfig({
        ONESHOT_ARC_PROFILE: 'arc-testnet',
        ONESHOT_ARC_RPC_URL: 'https://rpc.example.invalid',
        ONESHOT_PRIVY_APP_ID: 'app-test',
        ONESHOT_PRIVY_WALLET_ID: 'wallet-test',
        ONESHOT_PRIVY_POLICY_ID: 'policy-test',
        ONESHOT_RECIPIENT_ALLOWLIST: '0x2222222222222222222222222222222222222222',
        ONESHOT_SETTLEMENT_CAP_ATOMIC: '1000000',
      }),
      privyAppSecret: 'test-secret',
      walletAddress: '0x1111111111111111111111111111111111111111',
      policyDigest: 'a'.repeat(64),
      recovery: {
        mcpEndpoint: 'https://mcp.example.invalid',
        fromBlock: '1',
        toBlock: '999999',
        policy: {
          serverName: 'subgraph-mcp',
          serverVersion: '1.0.0',
          deploymentId: `0x${'d'.repeat(64)}`,
          manifestCid: `Qm${'a'.repeat(44)}`,
          maxLagBlocks: '5',
          maxCandidates: 5,
          maxResultBytes: 65_536,
        },
        vertexProjectId: 'oneshot-project',
        vertexLocation: 'europe-west1',
        vertexModel: 'gemini-2.5-flash',
      },
      pollIntervalMs: 25,
      submissionLeaseMs: 1_000,
      maxJobsPerCycle: 10,
      submissionsDisabled: false,
    };
    const runtime = await startWorkerRuntime(config, {
      pool,
      compose: async (runtimePool, ledger) =>
        composeWorker(runtimePool, ledger, {
          profile: 'production',
          authorizationPort: { authorize: async () => ({ kind: 'AUTHORIZED' as const }) },
          settlementPort: {
            name: 'EndToEndSettlementAdapter',
            contractVersion: '1.0.0',
            network: 'eip155:5042002',
            async submit() {
              submissions += 1;
              return {
                kind: 'CONFIRMED' as const,
                provider_reference_id: 'provider-e2e-1',
                transaction_hash: `0x${'a'.repeat(64)}`,
                block_number: '100',
                transfer_log_index: 0,
              };
            },
          },
        }),
    });
    const api = buildApi({
      ledger: new IntentLedger(pool),
      authenticator: staticBearerAuthenticator('test-token'),
    });
    try {
      const payload = {
        business_intent_id: 'intent-production-runtime-e2e',
        recipient: '0x2222222222222222222222222222222222222222',
        amount_atomic: '250000',
        asset: 'USDC',
        network: 'eip155:5042002',
        purpose: 'Production runtime integration test',
      };
      const created = await api.inject({
        method: 'POST',
        url: '/v1/intents',
        headers: { authorization: 'Bearer test-token' },
        payload,
      });
      expect(created.statusCode).toBe(202);

      let state = '';
      for (let attempt = 0; attempt < 100 && state !== 'COMMITTED'; attempt += 1) {
        await new Promise((resolve) => setTimeout(resolve, 20));
        const status = await api.inject({
          method: 'GET',
          url: `/v1/intents/${payload.business_intent_id}`,
          headers: { authorization: 'Bearer test-token' },
        });
        state = status.json<{ state: string }>().state;
      }
      expect(state).toBe('COMMITTED');

      const replay = await api.inject({
        method: 'POST',
        url: '/v1/intents',
        headers: { authorization: 'Bearer test-token' },
        payload,
      });
      expect(replay.statusCode).toBe(200);
      expect(submissions).toBe(1);
      expect((await fetch(`${runtime.address}/health/ready`)).status).toBe(200);
    } finally {
      await api.close();
      await runtime.close();
    }
  });
});
