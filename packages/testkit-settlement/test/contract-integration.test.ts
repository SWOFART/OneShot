import { describe, expect, it } from 'vitest';
import {
  classifyHttpStatus,
  classifyTransportError,
  isTerminalEvidence,
  lookupEvidence,
  outcomeForTransportFailure,
  permitsResubmission,
  type PersistedIdentity,
  type ReceiptSource,
} from '@oneshot/arc-adapter';
import { COMPATIBILITY_MANIFEST, assertNoDrift, type SettlementBaseline } from '@oneshot/privy-adapter';
import { FileAttemptStore } from '../src/attempt-store.js';
import { createHarness } from '../src/harness.js';
import { createProvider } from '../src/provider-simulator.js';
import { rmSync } from 'node:fs';
import { afterEach } from 'vitest';

const STATE_DIR = 'tmp/contract-integration';
afterEach(() => {
  rmSync(STATE_DIR, { recursive: true, force: true });
});

const INTENT = {
  businessIntentId: '018f-contract-intent',
  chainId: 5042002,
  tokenContract: '0x3600000000000000000000000000000000000000' as const,
  recipient: '0x1111111111111111111111111111111111111111' as const,
  amountAtomic: 1_250_000n,
};

const BASELINE: SettlementBaseline = {
  policyDigest: '0x' + 'a'.repeat(64),
  policyId: 'policy_1234567890',
  walletId: 'wallet_1234567890',
  walletAddress: '0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa',
  chainId: 5042002,
  tokenContract: INTENT.tokenContract,
  settlementCapAtomic: 1_000_000n,
};

const IDENTITY: PersistedIdentity = {
  transactionHash: undefined,
  walletAddress: BASELINE.walletAddress,
  chainId: INTENT.chainId,
  tokenContract: INTENT.tokenContract,
  recipient: INTENT.recipient,
  amountAtomic: INTENT.amountAtomic,
};

const emptySource: ReceiptSource = { getReceipt: () => Promise.resolve(null) };

// B04.5: the adapter pack composed end to end against simulators only, with no
// implementation from Coder A or Coder C present.
describe('adapter pack contract integration', () => {
  it('runs the full flow with no A or C implementation available', () => {
    const provider = createProvider();
    const harness = createHarness({
      log: new FileAttemptStore(`${STATE_DIR}/a.json`),
      provider,
    });

    assertNoDrift(BASELINE, { ...BASELINE });
    const result = harness.settle(INTENT, 'allowed-confirmed');

    expect(result.classification.outcome).toBe('CONFIRMED');
    expect(provider.broadcastCount).toBe(1);
  });

  it('refuses to settle when configuration drifted', () => {
    // Drift is checked before sensitive use, so a changed policy stops the
    // flow rather than being discovered during a payment.
    const provider = createProvider();
    expect(() => {
      assertNoDrift(BASELINE, { ...BASELINE, chainId: 1 });
    }).toThrow();
    expect(provider.broadcastCount).toBe(0);
  });

  it('keeps an ambiguous submission unresolved when evidence is absent', async () => {
    // The complete dangerous path: submit, lose the response, look for
    // evidence, find none. Nothing in that chain may permit paying again.
    const provider = createProvider();
    const harness = createHarness({
      log: new FileAttemptStore(`${STATE_DIR}/b.json`),
      provider,
    });

    const submitted = harness.settle(INTENT, 'allowed-lost-response');
    expect(submitted.classification.outcome).toBe('POSSIBLY_SUBMITTED');

    const observation = await lookupEvidence(IDENTITY, emptySource);
    expect(observation.result).toBe('NOT_FOUND');
    expect(isTerminalEvidence(observation)).toBe(false);
    expect(permitsResubmission(observation)).toBe(false);

    // A retry after all that still does not broadcast.
    harness.settle(INTENT, 'allowed-confirmed');
    expect(provider.broadcastCount).toBe(1);
  });

  it('routes a transport failure through the taxonomy to a durable outcome', () => {
    const refused = classifyTransportError(
      Object.assign(new Error('refused'), { code: 'ECONNREFUSED' }),
    );
    expect(outcomeForTransportFailure(refused)).toBe('DEFINITELY_NOT_SUBMITTED');

    const reset = classifyTransportError(
      Object.assign(new Error('reset'), { code: 'ECONNRESET' }),
    );
    expect(outcomeForTransportFailure(reset)).toBe('POSSIBLY_SUBMITTED');

    expect(outcomeForTransportFailure(classifyHttpStatus(429))).toBe('POSSIBLY_SUBMITTED');
  });

  it('publishes a manifest that names its live gaps', () => {
    expect(COMPATIBILITY_MANIFEST.contractPack).toBe('frozen-v1');
    expect(COMPATIBILITY_MANIFEST.liveGapsForGateP4.length).toBeGreaterThan(0);
  });
});
