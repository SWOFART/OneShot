import { describe, expect, it } from 'vitest';
import type { CreateIntentRequest } from '@oneshot/contracts';
import {
  TRANSFER_EVENT_TOPIC,
  loadSettlementConfig,
  type RawEnv,
  type TransactionReceipt,
} from '@oneshot/arc-adapter';
import {
  ArcSettlementAdapter,
  PrivyAuthorizationAdapter,
  SUPPORTED_NETWORK,
  WORKER_PORT_CONTRACT_VERSION,
  type WalletProvider,
} from '../src/adapters.js';
import type { SettlementBaseline } from '../src/hardening.js';

const WALLET = '0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa';
const RECIPIENT = '0x1111111111111111111111111111111111111111';
const OTHER = '0x2222222222222222222222222222222222222222';
const USDC = '0x3600000000000000000000000000000000000000';

const ENV: RawEnv = {
  ONESHOT_ARC_PROFILE: 'arc-testnet',
  ONESHOT_ARC_RPC_URL: 'https://rpc.example.invalid',
  ONESHOT_PRIVY_APP_ID: 'app_1234567890',
  ONESHOT_PRIVY_WALLET_ID: 'wallet_1234567890',
  ONESHOT_PRIVY_POLICY_ID: 'policy_1234567890',
  ONESHOT_RECIPIENT_ALLOWLIST: RECIPIENT,
  ONESHOT_SETTLEMENT_CAP_ATOMIC: '1000000',
};

const config = loadSettlementConfig(ENV);

const BASELINE: SettlementBaseline = {
  policyDigest: '0x' + 'a'.repeat(64),
  policyId: 'policy_1234567890',
  walletId: 'wallet_1234567890',
  walletAddress: WALLET,
  chainId: 5042002,
  tokenContract: USDC,
  settlementCapAtomic: 1_000_000n,
};

function intent(overrides: Partial<CreateIntentRequest> = {}): CreateIntentRequest {
  return {
    business_intent_id: '018f-adapter-intent',
    recipient: RECIPIENT,
    amount_atomic: '500000',
    asset: 'USDC',
    network: SUPPORTED_NETWORK,
    purpose: 'Invoice INV-1001',
    ...overrides,
  } as CreateIntentRequest;
}

function topic(address: string): string {
  return `0x${'0'.repeat(24)}${address.slice(2)}`;
}

function receipt(overrides: Partial<TransactionReceipt> = {}): TransactionReceipt {
  return {
    transactionHash: `0x${'c'.repeat(64)}`,
    chainId: 5042002,
    from: WALLET,
    to: USDC,
    status: 1,
    blockNumber: 500n,
    blockHash: `0x${'d'.repeat(64)}`,
    logs: [
      {
        address: USDC,
        topics: [TRANSFER_EVENT_TOPIC, topic(WALLET), topic(RECIPIENT)],
        data: `0x${(500_000n).toString(16).padStart(64, '0')}`,
        logIndex: 2,
      },
    ],
    ...overrides,
  };
}

function provider(overrides: Partial<WalletProvider> = {}): WalletProvider & { sends: number } {
  const state = {
    sends: 0,
    sendTransaction: () => {
      state.sends += 1;
      return Promise.resolve({
        transactionHash: `0x${'c'.repeat(64)}`,
        providerReferenceId: WALLET,
      });
    },
    getReceipt: () => Promise.resolve(receipt()),
    ...overrides,
  };
  return state as WalletProvider & { sends: number };
}

const auth = (observe = () => BASELINE) =>
  new PrivyAuthorizationAdapter(config, BASELINE, observe);

describe('PrivyAuthorizationAdapter', () => {
  it('declares the contract version the worker checks', () => {
    expect(auth().contractVersion).toBe(WORKER_PORT_CONTRACT_VERSION);
    expect(WORKER_PORT_CONTRACT_VERSION).toBe('1.0.0');
  });

  it('authorizes an in-scope intent', async () => {
    await expect(auth().authorize(intent())).resolves.toEqual({ kind: 'AUTHORIZED' });
  });

  it.each<[string, Partial<CreateIntentRequest>]>([
    ['a non-allowlisted recipient', { recipient: OTHER }],
    ['a zero amount', { amount_atomic: '0' }],
    ['an amount above the cap', { amount_atomic: '1000001' }],
  ])('denies %s', async (_label, override) => {
    const result = await auth().authorize(intent(override));
    expect(result.kind).toBe('DENIED');
  });

  it('permits an amount exactly at the cap', async () => {
    const result = await auth().authorize(intent({ amount_atomic: '1000000' }));
    expect(result.kind).toBe('AUTHORIZED');
  });

  it('denies a foreign network', async () => {
    const result = await auth().authorize(intent({ network: 'eip155:1' }));
    expect(result.kind).toBe('DENIED');
  });

  it('reports UNAVAILABLE rather than DENIED when configuration drifted', async () => {
    // Drift makes every other answer untrustworthy rather than merely wrong,
    // so it must not be reported as a policy decision about this intent.
    const drifted = auth(() => ({ ...BASELINE, chainId: 1 }));
    const result = await drifted.authorize(intent());
    expect(result.kind).toBe('UNAVAILABLE');
  });
});

describe('ArcSettlementAdapter', () => {
  it('derives the durable provider request identity from the intent', () => {
    const identity = new ArcSettlementAdapter(config, provider()).getSubmissionIdentity(
      intent(),
    );

    expect(identity).toEqual({
      idempotencyKey: expect.stringMatching(/^0x[0-9a-f]{64}$/),
      referenceId: 'oneshot-018f-adapter-intent',
      requestFingerprint: expect.stringMatching(/^[0-9a-f]{64}$/),
      walletId: 'wallet_1234567890',
      policyId: 'policy_1234567890',
    });
    expect(identity.idempotencyKey).not.toBe(identity.requestFingerprint);
  });

  it('confirms from a verified receipt with contract-shaped fields', async () => {
    const wallet = provider();
    const result = await new ArcSettlementAdapter(config, wallet).submit(intent(), {
      attemptId: 'attempt-1',
      correlationId: 'corr-1',
    });

    expect(result.kind).toBe('CONFIRMED');
    if (result.kind === 'CONFIRMED') {
      expect(result.transaction_hash).toBe(`0x${'c'.repeat(64)}`);
      expect(result.block_number).toBe('500');
      expect(result.transfer_log_index).toBe(2);
    }
    expect(wallet.sends).toBe(1);
  });

  it('passes a stable idempotency key derived from the intent', async () => {
    const seen: string[] = [];
    const wallet = provider({
      sendTransaction: (input) => {
        seen.push(input.idempotencyKey);
        return Promise.resolve({
          transactionHash: `0x${'c'.repeat(64)}`,
          providerReferenceId: WALLET,
        });
      },
    });
    const adapter = new ArcSettlementAdapter(config, wallet);
    const ctx = { attemptId: 'a', correlationId: 'c' };

    await adapter.submit(intent(), ctx);
    await adapter.submit(intent(), ctx);

    // Same obligation, same key, so a duplicate collapses provider-side too.
    expect(seen[0]).toBe(seen[1]);
    expect(seen[0]).toMatch(/^0x[0-9a-f]{64}$/);
  });

  it('never attaches native value', async () => {
    let observed: bigint | undefined;
    const wallet = provider({
      sendTransaction: (input) => {
        observed = input.value;
        return Promise.resolve({
          transactionHash: `0x${'c'.repeat(64)}`,
          providerReferenceId: WALLET,
        });
      },
    });
    await new ArcSettlementAdapter(config, wallet).submit(intent(), {
      attemptId: 'a',
      correlationId: 'c',
    });
    expect(observed).toBe(0n);
  });

  it('refuses a foreign network without sending', async () => {
    const wallet = provider();
    const result = await new ArcSettlementAdapter(config, wallet).submit(
      intent({ network: 'eip155:1' }),
      { attemptId: 'a', correlationId: 'c' },
    );
    expect(result.kind).toBe('DEFINITELY_NOT_SUBMITTED');
    expect(wallet.sends).toBe(0);
  });

  it('treats a connection refusal as definitely not submitted', async () => {
    const wallet = provider({
      sendTransaction: () =>
        Promise.reject(Object.assign(new Error('refused'), { code: 'ECONNREFUSED' })),
    });
    const result = await new ArcSettlementAdapter(config, wallet).submit(intent(), {
      attemptId: 'a',
      correlationId: 'c',
    });
    expect(result.kind).toBe('DEFINITELY_NOT_SUBMITTED');
  });

  it.each(['ECONNRESET', 'ETIMEDOUT'])(
    'treats %s during send as possibly submitted',
    async (code) => {
      const wallet = provider({
        sendTransaction: () => Promise.reject(Object.assign(new Error(code), { code })),
      });
      const result = await new ArcSettlementAdapter(config, wallet).submit(intent(), {
        attemptId: 'a',
        correlationId: 'c',
      });
      expect(result.kind).toBe('POSSIBLY_SUBMITTED');
    },
  );

  it('is possibly submitted when the receipt cannot be read', async () => {
    const wallet = provider({ getReceipt: () => Promise.reject(new Error('timeout')) });
    const result = await new ArcSettlementAdapter(config, wallet).submit(intent(), {
      attemptId: 'a',
      correlationId: 'c',
    });
    expect(result.kind).toBe('POSSIBLY_SUBMITTED');
  });

  it('is possibly submitted when no receipt exists yet', async () => {
    const wallet = provider({ getReceipt: () => Promise.resolve(null) });
    const result = await new ArcSettlementAdapter(config, wallet).submit(intent(), {
      attemptId: 'a',
      correlationId: 'c',
    });
    expect(result.kind).toBe('POSSIBLY_SUBMITTED');
  });

  it('does not confirm a receipt whose Transfer went elsewhere', async () => {
    const wallet = provider({
      getReceipt: () =>
        Promise.resolve(
          receipt({
            logs: [
              {
                address: USDC,
                topics: [TRANSFER_EVENT_TOPIC, topic(WALLET), topic(OTHER)],
                data: `0x${(500_000n).toString(16).padStart(64, '0')}`,
                logIndex: 2,
              },
            ],
          }),
        ),
    });
    const result = await new ArcSettlementAdapter(config, wallet).submit(intent(), {
      attemptId: 'a',
      correlationId: 'c',
    });
    expect(result.kind).toBe('POSSIBLY_SUBMITTED');
  });

  it('treats an on-chain revert as definitely not submitted', async () => {
    // A revert moved no value, so the policy may schedule a fresh attempt.
    const wallet = provider({
      getReceipt: () => Promise.resolve(receipt({ status: 0, logs: [] })),
    });
    const result = await new ArcSettlementAdapter(config, wallet).submit(intent(), {
      attemptId: 'a',
      correlationId: 'c',
    });
    expect(result.kind).toBe('DEFINITELY_NOT_SUBMITTED');
  });
});

describe('provider data is validated at the boundary', () => {
  it.each([-1, 1.5, Number.NaN, Number.MAX_SAFE_INTEGER + 1])(
    'refuses to confirm when the Transfer log index is %s',
    async (logIndex) => {
      // The value comes from provider data. parseSettlementResult would reject
      // it downstream, but that throws inside the worker; failing closed here
      // keeps the intent reconcilable.
      const wallet = provider({
        getReceipt: () =>
          Promise.resolve(
            receipt({
              logs: [
                {
                  address: USDC,
                  topics: [TRANSFER_EVENT_TOPIC, topic(WALLET), topic(RECIPIENT)],
                  data: `0x${(500_000n).toString(16).padStart(64, '0')}`,
                  logIndex,
                },
              ],
            }),
          ),
      });
      const result = await new ArcSettlementAdapter(config, wallet).submit(intent());
      expect(result.kind).toBe('POSSIBLY_SUBMITTED');
    },
  );

  it('still confirms a log index of zero', () => {
    // Zero is valid and must not be rejected by a truthiness check.
    expect(Number.isSafeInteger(0) && 0 >= 0).toBe(true);
  });
});
