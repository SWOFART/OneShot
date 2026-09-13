import { describe, expect, it } from 'vitest';
import {
  CONFIG_VARIABLES,
  ConfigError,
  SECRET_VARIABLE_NAMES,
  loadSettlementConfig,
  renderEnvExample,
  type RawEnv,
} from '../src/config.js';

const VALID: RawEnv = {
  ONESHOT_ARC_PROFILE: 'arc-testnet',
  ONESHOT_ARC_RPC_URL: 'https://rpc.example.invalid',
  ONESHOT_PRIVY_APP_ID: 'app_1234567890',
  ONESHOT_PRIVY_APP_SECRET: 'unused-by-this-module',
  ONESHOT_PRIVY_WALLET_ID: 'wallet_1234567890',
  ONESHOT_PRIVY_POLICY_ID: 'policy_1234567890',
  ONESHOT_SETTLEMENT_CAP_ATOMIC: '1000000',
};

function withEnv(overrides: RawEnv): RawEnv {
  return { ...VALID, ...overrides };
}

describe('loadSettlementConfig', () => {
  it('loads a valid testnet configuration', () => {
    const config = loadSettlementConfig(VALID);
    expect(config.profile.chainId).toBe(5042002);
    expect(config.settlementCapAtomic).toBe('1000000');
    expect(config.rpcTimeoutMs).toBe(10_000);
  });

  it.each([
    'ONESHOT_ARC_PROFILE',
    'ONESHOT_ARC_RPC_URL',
    'ONESHOT_PRIVY_APP_ID',
    'ONESHOT_PRIVY_WALLET_ID',
    'ONESHOT_PRIVY_POLICY_ID',
    'ONESHOT_SETTLEMENT_CAP_ATOMIC',
  ])('fails closed when %s is missing', (name) => {
    expect(() => loadSettlementConfig(withEnv({ [name]: undefined }))).toThrow(ConfigError);
  });

  it('rejects an unknown profile instead of defaulting', () => {
    expect(() => loadSettlementConfig(withEnv({ ONESHOT_ARC_PROFILE: 'arc-testnett' }))).toThrow(
      expect.objectContaining({ code: 'UNKNOWN_PROFILE' }),
    );
  });

  it('refuses the mainnet profile because it carries no pinned values', () => {
    expect(() => loadSettlementConfig(withEnv({ ONESHOT_ARC_PROFILE: 'arc-mainnet' }))).toThrow(
      expect.objectContaining({ code: 'PROFILE_UNPUBLISHED' }),
    );
  });

  it('refuses the mainnet profile even when activation is authorized', () => {
    // Human authorization alone is not enough. Without pinned values there is
    // nothing safe to authorize.
    expect(() =>
      loadSettlementConfig(
        withEnv({
          ONESHOT_ARC_PROFILE: 'arc-mainnet',
          ONESHOT_ALLOW_MAINNET_ACTIVATION: 'true',
        }),
      ),
    ).toThrow(expect.objectContaining({ code: 'PROFILE_UNPUBLISHED' }));
  });
});

describe('URL validation', () => {
  it('rejects cleartext http to a real host', () => {
    expect(() =>
      loadSettlementConfig(withEnv({ ONESHOT_ARC_RPC_URL: 'http://rpc.example.invalid' })),
    ).toThrow(expect.objectContaining({ code: 'INVALID_URL' }));
  });

  it('allows http on loopback so the offline simulator works', () => {
    const config = loadSettlementConfig(
      withEnv({ ONESHOT_ARC_RPC_URL: 'http://127.0.0.1:8545' }),
    );
    expect(config.rpcUrl).toMatch(/^http:\/\/127\.0\.0\.1:8545/);
  });

  it('rejects a malformed URL', () => {
    expect(() => loadSettlementConfig(withEnv({ ONESHOT_ARC_RPC_URL: 'not-a-url' }))).toThrow(
      expect.objectContaining({ code: 'INVALID_URL' }),
    );
  });
});

describe('cap and timeout validation', () => {
  it('rejects a non-canonical cap', () => {
    expect(() =>
      loadSettlementConfig(withEnv({ ONESHOT_SETTLEMENT_CAP_ATOMIC: '1.5' })),
    ).toThrow(expect.objectContaining({ code: 'INVALID_CAP' }));
  });

  it.each(['0', '-1', 'abc', '10.5'])('rejects timeout %s', (value) => {
    expect(() => loadSettlementConfig(withEnv({ ONESHOT_RPC_TIMEOUT_MS: value }))).toThrow(
      expect.objectContaining({ code: 'INVALID_TIMEOUT' }),
    );
  });

  it('rejects an unbounded timeout', () => {
    expect(() =>
      loadSettlementConfig(withEnv({ ONESHOT_RPC_TIMEOUT_MS: '120001' })),
    ).toThrow(expect.objectContaining({ code: 'INVALID_TIMEOUT' }));
  });
});

describe('env example rendering', () => {
  it('classifies the app secret as secret', () => {
    expect(SECRET_VARIABLE_NAMES).toContain('ONESHOT_PRIVY_APP_SECRET');
  });

  it('contains placeholders only, never a usable value', () => {
    const rendered = renderEnvExample();
    for (const variable of CONFIG_VARIABLES) {
      expect(rendered).toContain(`${variable.name}=`);
    }
    // The secret placeholder must not look like a credential.
    expect(rendered).toMatch(/ONESHOT_PRIVY_APP_SECRET=<set-in-secret-store-not-here>/);
    expect(rendered).not.toMatch(/[A-Za-z0-9]{32,}/);
  });

  it('labels every variable with its classification', () => {
    const rendered = renderEnvExample();
    for (const variable of CONFIG_VARIABLES) {
      expect(rendered).toContain(`[${variable.classification}] `);
    }
  });
});
