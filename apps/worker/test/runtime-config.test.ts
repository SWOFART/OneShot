import { describe, expect, it } from 'vitest';
import { loadWorkerRuntimeConfig } from '../src/runtime-config.js';

function environment(): NodeJS.ProcessEnv {
  return {
    DATABASE_URL: 'postgresql://oneshot:oneshot@localhost:5432/oneshot',
    ONESHOT_ARC_PROFILE: 'arc-testnet',
    ONESHOT_ARC_RPC_URL: 'https://rpc.example.invalid',
    ONESHOT_PRIVY_APP_ID: 'app-test',
    ONESHOT_PRIVY_APP_SECRET: 'secret-from-runtime-store',
    ONESHOT_PRIVY_WALLET_ID: 'wallet-test',
    ONESHOT_PRIVY_WALLET_ADDRESS: '0x1111111111111111111111111111111111111111',
    ONESHOT_PRIVY_POLICY_ID: 'policy-test',
    ONESHOT_PRIVY_POLICY_DIGEST: 'a'.repeat(64),
    ONESHOT_RECIPIENT_ALLOWLIST: '0x2222222222222222222222222222222222222222',
    ONESHOT_SETTLEMENT_CAP_ATOMIC: '1000000',
    ONESHOT_SUBGRAPH_MCP_ENDPOINT: 'https://mcp.example.invalid',
    ONESHOT_SUBGRAPH_MCP_SERVER_VERSION: '1.0.0',
    ONESHOT_SUBGRAPH_DEPLOYMENT_ID: `0x${'d'.repeat(64)}`,
    ONESHOT_SUBGRAPH_MANIFEST_CID: `Qm${'a'.repeat(44)}`,
    ONESHOT_SUBGRAPH_MAX_LAG_BLOCKS: '5',
    ONESHOT_RECOVERY_FROM_BLOCK: '1',
    ONESHOT_RECOVERY_TO_BLOCK: '999999999',
    ONESHOT_VERTEX_PROJECT_ID: 'oneshot-project',
  };
}

describe('production worker configuration', () => {
  it('loads all effect and recovery identities without exposing secret defaults', () => {
    const config = loadWorkerRuntimeConfig(environment());
    expect(config.settlement.profile.chainId).toBe(5042002);
    expect(config.recovery.policy.serverName).toBe('subgraph-mcp');
    expect(config.recovery.vertexModel).toBe('gemini-2.5-flash');
    expect(config.pollIntervalMs).toBe(1000);
  });

  it('fails closed when the production MCP endpoint is absent', () => {
    const env = environment();
    delete env.ONESHOT_SUBGRAPH_MCP_ENDPOINT;
    expect(() => loadWorkerRuntimeConfig(env)).toThrow('ONESHOT_SUBGRAPH_MCP_ENDPOINT');
  });

  it('fails closed when the Privy secret is absent', () => {
    const env = environment();
    delete env.ONESHOT_PRIVY_APP_SECRET;
    expect(() => loadWorkerRuntimeConfig(env)).toThrow('ONESHOT_PRIVY_APP_SECRET');
  });

  it('rejects an inverted recovery block window', () => {
    const env = environment();
    env.ONESHOT_RECOVERY_FROM_BLOCK = '10';
    env.ONESHOT_RECOVERY_TO_BLOCK = '9';
    expect(() => loadWorkerRuntimeConfig(env)).toThrow('must not exceed');
  });

  it('rejects a database pool too small for an outbox claim plus ledger action', () => {
    const env = environment();
    env.DB_POOL_MAX = '1';
    expect(() => loadWorkerRuntimeConfig(env)).toThrow('DB_POOL_MAX');
  });
});
