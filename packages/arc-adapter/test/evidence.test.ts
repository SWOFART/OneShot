import { describe, expect, it } from 'vitest';
import {
  isTerminalEvidence,
  lookupEvidence,
  permitsResubmission,
  type PersistedIdentity,
  type ReceiptSource,
} from '../src/evidence.js';
import { TRANSFER_EVENT_TOPIC, type TransactionReceipt } from '../src/receipt.js';

const WALLET = '0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa';
const RECIPIENT = '0x1111111111111111111111111111111111111111';
const OTHER = '0x2222222222222222222222222222222222222222';
const USDC = '0x3600000000000000000000000000000000000000';
const HASH = `0x${'c'.repeat(64)}`;

const IDENTITY: PersistedIdentity = {
  transactionHash: HASH,
  walletAddress: WALLET,
  chainId: 5042002,
  tokenContract: USDC,
  recipient: RECIPIENT,
  amountAtomic: 1_250_000n,
};

function topic(address: string): string {
  return `0x${'0'.repeat(24)}${address.slice(2)}`;
}

function receipt(overrides: Partial<TransactionReceipt> = {}): TransactionReceipt {
  return {
    transactionHash: HASH,
    chainId: 5042002,
    from: WALLET,
    to: USDC,
    status: 1,
    blockNumber: 100n,
    blockHash: `0x${'d'.repeat(64)}`,
    logs: [
      {
        address: USDC,
        topics: [TRANSFER_EVENT_TOPIC, topic(WALLET), topic(RECIPIENT)],
        data: `0x${(1_250_000n).toString(16).padStart(64, '0')}`,
        logIndex: 3,
      },
    ],
    ...overrides,
  };
}

function source(value: TransactionReceipt | null | Error): ReceiptSource {
  return {
    getReceipt: () =>
      value instanceof Error ? Promise.reject(value) : Promise.resolve(value),
  };
}

describe('final evidence', () => {
  it('reports FINAL_SUCCESS for a verified settlement', async () => {
    const observation = await lookupEvidence(IDENTITY, source(receipt()));
    expect(observation.result).toBe('FINAL_SUCCESS');
    expect(observation.boundToRequest).toBe(true);
    expect(isTerminalEvidence(observation)).toBe(true);
  });

  it('reports FINAL_REVERT for a reverted transaction', async () => {
    const observation = await lookupEvidence(IDENTITY, source(receipt({ status: 0, logs: [] })));
    expect(observation.result).toBe('FINAL_REVERT');
    expect(isTerminalEvidence(observation)).toBe(true);
  });
});

describe('NOT_FOUND is never permission', () => {
  it('reports NOT_FOUND when no receipt exists', async () => {
    const observation = await lookupEvidence(IDENTITY, source(null));
    expect(observation.result).toBe('NOT_FOUND');
    expect(observation.boundToRequest).toBe(false);
    expect(isTerminalEvidence(observation)).toBe(false);
  });

  it('says explicitly that absence is not proof of non-payment', async () => {
    const observation = await lookupEvidence(IDENTITY, source(null));
    expect(observation.detail).toMatch(/not proof/i);
  });

  it('never permits resubmission on any observation', async () => {
    // Written down once so no call site re-derives it. Only a reconciliation
    // policy may decide to attempt again, and that is not this adapter.
    for (const value of [null, receipt(), receipt({ status: 0 })]) {
      const observation = await lookupEvidence(IDENTITY, source(value));
      expect(permitsResubmission(observation)).toBe(false);
    }
  });

  it('reports NOT_FOUND and unbound when no hash was persisted', async () => {
    // Hashless discovery is Coder C's Subgraph MCP path. This adapter must
    // not grow a second, weaker way to decide a payment happened.
    const observation = await lookupEvidence(
      { ...IDENTITY, transactionHash: undefined },
      source(receipt()),
    );
    expect(observation.result).toBe('NOT_FOUND');
    expect(observation.boundToRequest).toBe(false);
  });
});

describe('unavailability is distinct from absence', () => {
  it('reports UNAVAILABLE when the lookup throws', async () => {
    const observation = await lookupEvidence(IDENTITY, source(new Error('ECONNRESET')));
    expect(observation.result).toBe('UNAVAILABLE');
    expect(isTerminalEvidence(observation)).toBe(false);
  });

  it('truncates a large provider error', async () => {
    const observation = await lookupEvidence(IDENTITY, source(new Error('x'.repeat(9000))));
    expect(observation.detail.length).toBeLessThan(300);
  });
});

// B04.3: evidence that cannot be bound to the exact request preserves
// ambiguity instead of resolving it.
describe('mismatched and contradictory evidence', () => {
  it('refuses a receipt from another chain', async () => {
    const observation = await lookupEvidence(IDENTITY, source(receipt({ chainId: 1 })));
    expect(observation.boundToRequest).toBe(false);
    expect(isTerminalEvidence(observation)).toBe(false);
  });

  it('refuses a receipt for a different transaction hash', async () => {
    const wrongHash = receipt({ transactionHash: `0x${'e'.repeat(64)}` });
    const observation = await lookupEvidence(IDENTITY, source(wrongHash));
    expect(observation.result).toBe('NOT_FOUND');
    expect(observation.boundToRequest).toBe(false);
  });

  it('holds ambiguity when our hash succeeded without our Transfer', async () => {
    // Contradictory: the transaction is ours and final, but it does not prove
    // our settlement. Resolving this either way would be a guess.
    const observation = await lookupEvidence(IDENTITY, source(receipt({ logs: [] })));
    expect(observation.result).toBe('PENDING');
    expect(observation.boundToRequest).toBe(false);
    expect(isTerminalEvidence(observation)).toBe(false);
  });

  it('holds ambiguity when the Transfer went elsewhere', async () => {
    const redirected = receipt({
      logs: [
        {
          address: USDC,
          topics: [TRANSFER_EVENT_TOPIC, topic(WALLET), topic(OTHER)],
          data: `0x${(1_250_000n).toString(16).padStart(64, '0')}`,
          logIndex: 3,
        },
      ],
    });
    expect(isTerminalEvidence(await lookupEvidence(IDENTITY, source(redirected)))).toBe(false);
  });

  it('holds ambiguity when the wallet does not match', async () => {
    expect(isTerminalEvidence(await lookupEvidence(IDENTITY, source(receipt({ from: OTHER }))))).toBe(
      false,
    );
  });
});

describe('idempotent lookup', () => {
  it('returns the same observation when repeated and submits nothing', async () => {
    let calls = 0;
    const counting: ReceiptSource = {
      getReceipt: () => {
        calls += 1;
        return Promise.resolve(receipt());
      },
    };

    const first = await lookupEvidence(IDENTITY, counting);
    const second = await lookupEvidence(IDENTITY, counting);
    const third = await lookupEvidence(IDENTITY, counting);

    expect(second).toEqual(first);
    expect(third).toEqual(first);
    expect(calls).toBe(3);
    // The port is read-only by construction: there is no submit path here.
  });
});
