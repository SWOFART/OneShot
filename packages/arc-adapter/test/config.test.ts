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

  it('refuses the default mainnet rail until an operator confirms it', () => {
    expect(() => loadSettlementConfig(withEnv({ ONESHOT_ARC_PROFILE: undefined }))).toThrow(
      expect.objectContaining({ code: 'MAINNET_NOT_AUTHORIZED' }),
    );
  });

  it('loads Arc Mainnet when the operator confirms activation', () => {
    const config = loadSettlementConfig(
      withEnv({
        ONESHOT_ARC_PROFILE: 'arc-mainnet',
        ONESHOT_ALLOW_MAINNET_ACTIVATION: 'true',
      }),
    );
    expect(config.profile.chainId).toBe(5042);
    expect(config.profile.caip2).toBe('eip155:5042');
    expect(config.profile.tokenContract).toBe('0x3600000000000000000000000000000000000000');
    expect(config.profile.graphQueryEnv).toBeUndefined();
  });

  it('selects Base Sepolia when ONESHOT_CHAIN names it', () => {
    const config = loadSettlementConfig(
      withEnv({ ONESHOT_ARC_PROFILE: undefined, ONESHOT_CHAIN: 'base-sepolia' }),
    );
    expect(config.profile.id).toBe('base-sepolia');
    expect(config.profile.caip2).toBe('eip155:84532');
    expect(config.profile.nativeSymbol).toBe('ETH');
    expect(config.profile.tokenDecimals).toBe(6);
    expect(config.profile.nativeDecimals).toBe(18);
  });

  it('accepts ONESHOT_CHAIN=arc-testnet without the legacy profile variable', () => {
    const config = loadSettlementConfig(
      withEnv({ ONESHOT_ARC_PROFILE: undefined, ONESHOT_CHAIN: 'arc-testnet' }),
    );
    expect(config.profile.chainId).toBe(5042002);
  });

  it('refuses conflicting chain selectors', () => {
    expect(() =>
      loadSettlementConfig(withEnv({ ONESHOT_CHAIN: 'base-sepolia' })),
    ).toThrow(expect.objectContaining({ code: 'CHAIN_SELECTION_CONFLICT' }));
  });

  it('refuses an unknown chain instead of defaulting', () => {
    expect(() =>
      loadSettlementConfig(withEnv({ ONESHOT_ARC_PROFILE: undefined, ONESHOT_CHAIN: 'ethereum' })),
    ).toThrow(expect.objectContaining({ code: 'UNKNOWN_PROFILE' }));
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
