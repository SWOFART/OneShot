import { describe, expect, it } from 'vitest';
import { loadSettlementConfig, type RawEnv } from '../src/config.js';
import {
  checkChainId,
  checkIdentityFormat,
  checkProfileConsistency,
  checkTokenBytecode,
  checkTokenDecimals,
  probeReadiness,
  type RpcProbe,
} from '../src/readiness.js';

const VALID: RawEnv = {
  ONESHOT_ARC_PROFILE: 'arc-testnet',
  ONESHOT_ARC_RPC_URL: 'https://rpc.example.invalid',
  ONESHOT_PRIVY_APP_ID: 'app_1234567890',
  ONESHOT_PRIVY_WALLET_ID: 'wallet_1234567890',
  ONESHOT_PRIVY_POLICY_ID: 'policy_1234567890',
  ONESHOT_RECIPIENT_ALLOWLIST: '0x1111111111111111111111111111111111111111',
  ONESHOT_SETTLEMENT_CAP_ATOMIC: '1000000',
};

/** Offline probe. No network, no credentials, so this packet closes standalone. */
function stubProbe(overrides: Partial<RpcProbe> = {}): RpcProbe {
  return {
    getChainId: () => Promise.resolve(5042002),
    getCode: () => Promise.resolve('0x60806040'),
    getTokenDecimals: () => Promise.resolve(6),
    ...overrides,
  };
}

const config = loadSettlementConfig(VALID);

describe('checkChainId', () => {
  it('passes on the expected chain', async () => {
    const result = await checkChainId(stubProbe(), 5042002);
    expect(result.status).toBe('PASS');
  });

  it('reports MISMATCH on a different chain, not UNAVAILABLE', async () => {
    // A wrong chain is a permanent, human-fix condition. Classifying it as a
    // transient fault would invite a retry loop that eventually pays out.
    const result = await checkChainId(stubProbe({ getChainId: () => Promise.resolve(1) }), 5042002);
    expect(result.status).toBe('MISMATCH');
    expect(result.detail).toContain('1');
  });

  it('reports UNAVAILABLE when the endpoint cannot be reached', async () => {
    const result = await checkChainId(
      stubProbe({
        getChainId: () => Promise.reject(new Error('ECONNREFUSED')),
      }),
      5042002,
    );
    expect(result.status).toBe('UNAVAILABLE');
  });

  it('truncates a large provider error rather than echoing it whole', async () => {
    const result = await checkChainId(
      stubProbe({
        getChainId: () => Promise.reject(new Error('x'.repeat(5000))),
      }),
      5042002,
    );
    expect(result.detail.length).toBeLessThan(300);
  });
});

describe('checkTokenBytecode', () => {
  it('passes when the address holds bytecode', async () => {
    const result = await checkTokenBytecode(stubProbe(), '0x3600000000000000000000000000000000000000');
    expect(result.status).toBe('PASS');
  });

  it.each(['0x', '0x0', '', '  '])(
    'reports MISMATCH when the address holds no code (%s)',
    async (code) => {
      // An address with no code is the wrong address or the wrong chain. A
      // transfer to it would be irrecoverable.
      const result = await checkTokenBytecode(
        stubProbe({ getCode: () => Promise.resolve(code) }),
        '0x3600000000000000000000000000000000000000',
      );
      expect(result.status).toBe('MISMATCH');
    },
  );

  it('reports UNAVAILABLE when the call fails', async () => {
    const result = await checkTokenBytecode(
      stubProbe({
        getCode: () => Promise.reject(new Error('timeout')),
      }),
      '0x3600000000000000000000000000000000000000',
    );
    expect(result.status).toBe('UNAVAILABLE');
  });
});

describe('checkTokenDecimals', () => {
  it('passes when the live token uses the profile precision', async () => {
    const result = await checkTokenDecimals(
      stubProbe(),
      '0x3600000000000000000000000000000000000000',
      6,
    );
    expect(result.status).toBe('PASS');
  });

  it('reports MISMATCH when the live token uses another precision', async () => {
    const result = await checkTokenDecimals(
      stubProbe({ getTokenDecimals: () => Promise.resolve(18) }),
      '0x3600000000000000000000000000000000000000',
      6,
    );
    expect(result.status).toBe('MISMATCH');
    expect(result.detail).toContain('18');
  });

  it('reports UNAVAILABLE when the token interface cannot be read', async () => {
    const result = await checkTokenDecimals(
      stubProbe({ getTokenDecimals: () => Promise.reject(new Error('timeout')) }),
      '0x3600000000000000000000000000000000000000',
      6,
    );
    expect(result.status).toBe('UNAVAILABLE');
  });
});

describe('checkIdentityFormat', () => {
  it('passes on well-formed identifiers', () => {
    expect(
      checkIdentityFormat({ walletId: 'wallet_1234567890', policyId: 'policy_1234567890' }).status,
    ).toBe('PASS');
  });

  it.each([
    ['too short', 'short'],
    ['containing a space', 'wallet 1234567890'],
    ['empty', ''],
  ])('reports MISMATCH for a wallet id %s', (_label, walletId) => {
    expect(checkIdentityFormat({ walletId, policyId: 'policy_1234567890' }).status).toBe(
      'MISMATCH',
    );
  });

  it('never echoes the identifier values it was given', () => {
    const result = checkIdentityFormat({
      walletId: 'wallet_secretlooking_value',
      policyId: 'policy_1234567890',
    });
    expect(result.detail).not.toContain('wallet_secretlooking_value');
  });
});

describe('checkProfileConsistency', () => {
  it('passes for the pinned testnet profile', () => {
    expect(checkProfileConsistency(config).status).toBe('PASS');
  });

  it('reports MISMATCH when CAIP-2 disagrees with the chain ID', () => {
    const tampered = {
      ...config,
      profile: { ...config.profile, caip2: 'eip155:1' as const },
    };
    expect(checkProfileConsistency(tampered).status).toBe('MISMATCH');
  });

  it('reports MISMATCH when token precision is not six decimals', () => {
    const tampered = {
      ...config,
      profile: { ...config.profile, tokenDecimals: 18 },
    };
    expect(checkProfileConsistency(tampered).status).toBe('MISMATCH');
  });
});

describe('probeReadiness', () => {
  it('is ready only when every check passes', async () => {
    const report = await probeReadiness(config, stubProbe());
    expect(report.ready).toBe(true);
    expect(report.hasMismatch).toBe(false);
  });

  it('is not ready on a wrong chain and flags a mismatch', async () => {
    const report = await probeReadiness(config, stubProbe({ getChainId: () => Promise.resolve(1) }));
    expect(report.ready).toBe(false);
    expect(report.hasMismatch).toBe(true);
  });

  it('is not ready when the endpoint is unavailable, without flagging a mismatch', async () => {
    // Distinguishing these matters: UNAVAILABLE may resolve on its own,
    // MISMATCH never will.
    const report = await probeReadiness(
      config,
      stubProbe({
        getChainId: () => Promise.reject(new Error('ECONNREFUSED')),
        getCode: () => Promise.reject(new Error('ECONNREFUSED')),
      }),
    );
    expect(report.ready).toBe(false);
    expect(report.hasMismatch).toBe(false);
  });

  it('reports every check so an operator sees the whole picture', async () => {
    const report = await probeReadiness(config, stubProbe());
    expect(report.checks.map((check) => check.name)).toEqual([
      'profile.consistency',
      'privy.identityFormat',
      'rpc.chainId',
      'token.bytecode',
      'token.decimals',
    ]);
  });
});

describe('native gas versus settlement precision', () => {
  it('reports MISMATCH when a profile equates gas and settlement precision', () => {
    // Arc names both units USDC. Treating them as one is a twelve-order-of-
    // magnitude mispricing, so the probe refuses a profile that conflates them.
    const tampered = {
      ...config,
      profile: { ...config.profile, nativeDecimals: 6 },
    };
    const result = checkProfileConsistency(tampered);
    expect(result.status).toBe('MISMATCH');
    expect(result.detail).toMatch(/must differ/i);
  });

  it('reports MISMATCH when native gas decimals are not 18', () => {
    const tampered = {
      ...config,
      profile: { ...config.profile, nativeDecimals: 9 },
    };
    expect(checkProfileConsistency(tampered).status).toBe('MISMATCH');
  });
});
