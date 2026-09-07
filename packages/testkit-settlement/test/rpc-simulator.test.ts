import { describe, expect, it } from 'vitest';
import { loadSettlementConfig, probeReadiness, type RawEnv } from '@oneshot/arc-adapter';
import { simulateRpc, type RpcScenario } from '../src/rpc-simulator.js';

const ENV: RawEnv = {
  ONESHOT_ARC_PROFILE: 'arc-testnet',
  ONESHOT_ARC_RPC_URL: 'https://rpc.example.invalid',
  ONESHOT_PRIVY_APP_ID: 'app_1234567890',
  ONESHOT_PRIVY_WALLET_ID: 'wallet_1234567890',
  ONESHOT_PRIVY_POLICY_ID: 'policy_1234567890',
  ONESHOT_RECIPIENT_ALLOWLIST: '0x1111111111111111111111111111111111111111',
  ONESHOT_SETTLEMENT_CAP_ATOMIC: '1000000',
};

const config = loadSettlementConfig(ENV);

describe('readiness against every simulated scenario', () => {
  it('is ready only on the healthy endpoint', async () => {
    const report = await probeReadiness(config, simulateRpc('healthy'));
    expect(report.ready).toBe(true);
    expect(report.hasMismatch).toBe(false);
  });

  it.each<[RpcScenario, string]>([
    ['wrong-chain', 'a different chain is a permanent misconfiguration'],
    ['token-missing-bytecode', 'no code at the token address'],
    ['token-null-code', 'a null code answer is still no code'],
  ])('flags %s as a mismatch that must not be retried', async (scenario) => {
    const report = await probeReadiness(config, simulateRpc(scenario));
    expect(report.ready).toBe(false);
    expect(report.hasMismatch).toBe(true);
  });

  it.each<RpcScenario>(['unreachable', 'chain-ok-token-unreachable', 'oversized-error'])(
    'treats %s as unavailable rather than a mismatch',
    async (scenario) => {
      // These may resolve on their own. Classifying them as MISMATCH would
      // send an operator hunting a configuration bug that does not exist.
      const report = await probeReadiness(config, simulateRpc(scenario));
      expect(report.ready).toBe(false);
      expect(report.hasMismatch).toBe(false);
    },
  );

  it('never lets a provider error grow the report unboundedly', async () => {
    const report = await probeReadiness(config, simulateRpc('oversized-error'));
    for (const check of report.checks) {
      expect(check.detail.length).toBeLessThan(300);
    }
  });

  it('reports a mismatch when the endpoint serves the wrong chain id', async () => {
    // Same simulator, different expected chain: proves the probe compares
    // against the profile rather than trusting whatever the endpoint says.
    const report = await probeReadiness(config, simulateRpc('healthy', { chainId: 999 }));
    expect(report.hasMismatch).toBe(true);
  });
});

describe('simulator discipline', () => {
  it('refuses an unknown scenario instead of defaulting to healthy', () => {
    // Policy: a simulator never silently defaults an unknown enum to a
    // successful or retryable result.
    expect(() => simulateRpc('not-a-scenario' as RpcScenario)).toThrow(/Unknown RPC scenario/);
  });
});
