import { rmSync } from 'node:fs';
import { afterEach, describe, expect, it } from 'vitest';
import type { SettlementIntent } from '@oneshot/privy-adapter';
import { createHarness } from '../src/harness.js';
import { FileAttemptStore } from '../src/attempt-store.js';
import { createProvider } from '../src/provider-simulator.js';

// Ignored runtime state, per B03.2. `tmp/` is gitignored.
const STATE_DIR = 'tmp/attempt-state';
let counter = 0;

function freshPath(): string {
  counter += 1;
  return `${STATE_DIR}/attempts-${String(counter)}.json`;
}

afterEach(() => {
  rmSync(STATE_DIR, { recursive: true, force: true });
});

const INTENT: SettlementIntent = {
  businessIntentId: '018f-restart-intent',
  chainId: 5042002,
  tokenContract: '0x3600000000000000000000000000000000000000',
  recipient: '0x1111111111111111111111111111111111111111',
  amountAtomic: 1_250_000n,
};

describe('durable attempt state survives a restart', () => {
  it('persists the attempt to disk before the provider is called', () => {
    const path = freshPath();
    const harness = createHarness({ log: new FileAttemptStore(path) });
    harness.settle(INTENT, 'allowed-confirmed');

    // A brand-new store object, as a restarted process would build.
    const afterRestart = new FileAttemptStore(path);
    const recovered = afterRestart.get(INTENT.businessIntentId);

    expect(recovered).toBeDefined();
    expect(recovered?.submissionAttempted).toBe(true);
    expect(recovered?.payloadFingerprint).toMatch(/^0x[0-9a-f]{64}$/);
  });

  it('does not grant a second submission right after a restart', () => {
    // The failure this whole packet guards against: the process dies after a
    // possible payment, comes back with no memory, and pays again.
    const path = freshPath();
    const provider = createProvider();

    const before = createHarness({ log: new FileAttemptStore(path), provider });
    before.settle(INTENT, 'allowed-confirmed');
    expect(provider.broadcastCount).toBe(1);

    // Simulate the restart: new store, new harness, same durable file.
    const after = createHarness({ log: new FileAttemptStore(path), provider });
    const result = after.settle(INTENT, 'allowed-confirmed');

    expect(result.replayed).toBe(true);
    expect(result.submitted).toBe(false);
    expect(provider.broadcastCount).toBe(1);
  });

  it('recovers an attempt whose outcome was never learned', () => {
    // Crash during submission: the mark is on disk, the response never
    // arrived. Recovery must see an attempt in flight, not a clean slate.
    const path = freshPath();
    const provider = createProvider();

    const before = createHarness({ log: new FileAttemptStore(path), provider });
    const timedOut = before.settle(INTENT, 'provider-timeout');
    expect(timedOut.classification.outcome).toBe('POSSIBLY_SUBMITTED');

    const after = createHarness({ log: new FileAttemptStore(path), provider });
    const recovered = after.log.get(INTENT.businessIntentId);

    expect(recovered?.submissionAttempted).toBe(true);
    expect(after.settle(INTENT, 'allowed-confirmed').submitted).toBe(false);
    expect(provider.broadcastCount).toBe(1);
  });

  it('broadcasts once across ten restarted workers', () => {
    const path = freshPath();
    const provider = createProvider();

    for (let i = 0; i < 10; i += 1) {
      const worker = createHarness({ log: new FileAttemptStore(path), provider });
      worker.settle(INTENT, 'allowed-confirmed');
    }

    expect(provider.broadcastCount).toBe(1);
    expect(new FileAttemptStore(path).size).toBe(1);
  });

  it('still separates genuinely different intents across restarts', () => {
    const path = freshPath();
    const provider = createProvider();

    createHarness({ log: new FileAttemptStore(path), provider }).settle(
      { ...INTENT, businessIntentId: 'intent-a' },
      'allowed-confirmed',
    );
    createHarness({ log: new FileAttemptStore(path), provider }).settle(
      { ...INTENT, businessIntentId: 'intent-b' },
      'allowed-confirmed',
    );

    expect(provider.broadcastCount).toBe(2);
    expect(new FileAttemptStore(path).size).toBe(2);
  });
});

describe('store durability details', () => {
  it('treats a missing state file as no attempts rather than crashing', () => {
    const store = new FileAttemptStore(freshPath());
    expect(store.size).toBe(0);
    expect(store.get('anything')).toBeUndefined();
  });

  it('writes through on every record so nothing is buffered', () => {
    // A buffered write would reopen the crash window the store exists to close.
    const path = freshPath();
    const store = new FileAttemptStore(path);
    store.recordOrGet({
      businessIntentId: 'x',
      payloadFingerprint: '0x' + 'a'.repeat(64),
      idempotencyKey: '0x' + 'a'.repeat(64),
      referenceId: 'oneshot-x',
      submissionAttempted: false,
    });
    expect(new FileAttemptStore(path).get('x')).toBeDefined();
  });
});
