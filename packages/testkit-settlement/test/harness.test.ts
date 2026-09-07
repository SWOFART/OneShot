import { describe, expect, it } from 'vitest';
import type { SettlementIntent } from '@oneshot/privy-adapter';
import { AttemptLog, createHarness } from '../src/harness.js';
import { DENIAL_SCENARIOS, createProvider, type SettlementScenario } from '../src/provider-simulator.js';

const INTENT: SettlementIntent = {
  businessIntentId: '018f-harness-intent',
  chainId: 5042002,
  tokenContract: '0x3600000000000000000000000000000000000000',
  recipient: '0x1111111111111111111111111111111111111111',
  amountAtomic: 1_250_000n,
};

function intentWithId(id: string): SettlementIntent {
  return { ...INTENT, businessIntentId: id };
}

describe('allowed settlement', () => {
  it('confirms and broadcasts exactly once', () => {
    const harness = createHarness();
    const result = harness.settle(INTENT, 'allowed-confirmed');
    expect(result.classification.outcome).toBe('CONFIRMED');
    expect(harness.broadcastCount).toBe(1);
  });

  it('records the attempt before the provider is called', () => {
    // The ordering the whole invariant rests on: if the process died during
    // submission, the attempt is already on record and recoverable.
    const harness = createHarness();
    harness.settle(INTENT, 'allowed-confirmed');
    const persisted = harness.log.get(INTENT.businessIntentId);
    expect(persisted?.submissionAttempted).toBe(true);
    expect(persisted?.payloadFingerprint).toMatch(/^0x[0-9a-f]{64}$/);
  });
});

// B03.3: every denial must produce zero external transfers. Asserting the
// returned enum alone is not enough; a denial that still broadcast has not
// denied anything.
describe('policy negative suite', () => {
  it.each(DENIAL_SCENARIOS)('denies %s with zero broadcasts', (scenario) => {
    const harness = createHarness();
    const result = harness.settle(INTENT, scenario);
    expect(result.classification.outcome).toBe('DEFINITELY_NOT_SUBMITTED');
    expect(harness.broadcastCount).toBe(0);
  });

  it('performs zero broadcasts across every denial in one run', () => {
    const harness = createHarness();
    DENIAL_SCENARIOS.forEach((scenario, index) => {
      harness.settle(intentWithId(`denial-${index}`), scenario);
    });
    expect(harness.broadcastCount).toBe(0);
    expect(harness.log.size).toBe(DENIAL_SCENARIOS.length);
  });
});

describe('ambiguous outcomes', () => {
  it.each<SettlementScenario>([
    'provider-timeout',
    'provider-5xx',
    'response-truncated',
    'allowed-lost-response',
    'allowed-pending',
  ])('treats %s as possibly submitted and counts the broadcast', (scenario) => {
    // Counting an ambiguous attempt as a non-broadcast would understate
    // exposure, which is the assumption that leads to paying twice.
    const harness = createHarness();
    const result = harness.settle(INTENT, scenario);
    expect(result.classification.outcome).toBe('POSSIBLY_SUBMITTED');
    expect(harness.broadcastCount).toBe(1);
  });

  it('does not confirm a receipt whose Transfer does not match', () => {
    const harness = createHarness();
    const result = harness.settle(INTENT, 'allowed-mismatched-transfer');
    expect(result.classification.outcome).toBe('POSSIBLY_SUBMITTED');
  });

  it('treats an on-chain revert as not confirmed', () => {
    const harness = createHarness();
    expect(harness.settle(INTENT, 'allowed-final-revert').classification.outcome).not.toBe(
      'CONFIRMED',
    );
  });
});

// The at-most-once invariant, exercised the way the failure-injection skill
// requires: duplicate delivery, sequential retries, and parallel workers.
describe('at most one committed settlement', () => {
  it('collapses a duplicate delivery of the same intent', () => {
    const harness = createHarness();
    const first = harness.settle(INTENT, 'allowed-confirmed');
    const second = harness.settle(INTENT, 'allowed-confirmed');

    expect(first.replayed).toBe(false);
    expect(second.replayed).toBe(true);
    expect(second.submitted).toBe(false);
    expect(harness.broadcastCount).toBe(1);
  });

  it('broadcasts once across ten sequential retries', () => {
    const harness = createHarness();
    for (let i = 0; i < 10; i += 1) {
      harness.settle(INTENT, 'allowed-confirmed');
    }
    expect(harness.broadcastCount).toBe(1);
  });

  it('broadcasts once across ten workers sharing durable state', () => {
    // Workers are separate harnesses, as separate processes would be, but they
    // share the durable log. The log is what enforces the invariant, not the
    // worker.
    const log = new AttemptLog();
    const provider = createProvider();
    const workers = Array.from({ length: 10 }, () => createHarness({ log, provider }));

    for (const worker of workers) {
      worker.settle(INTENT, 'allowed-confirmed');
    }

    expect(provider.broadcastCount).toBe(1);
    expect(log.size).toBe(1);
  });

  it('does not collapse genuinely different intents', () => {
    const harness = createHarness();
    harness.settle(intentWithId('intent-a'), 'allowed-confirmed');
    harness.settle(intentWithId('intent-b'), 'allowed-confirmed');
    expect(harness.broadcastCount).toBe(2);
  });

  it('does not grant a fresh submission right after an ambiguous outcome', () => {
    // The dangerous retry: the first attempt may have paid. A blind retry here
    // is precisely the double payment the product exists to prevent.
    const harness = createHarness();
    harness.settle(INTENT, 'provider-timeout');
    const retry = harness.settle(INTENT, 'allowed-confirmed');

    expect(retry.replayed).toBe(true);
    expect(retry.submitted).toBe(false);
    expect(harness.broadcastCount).toBe(1);
  });
});

describe('evidence sanitation', () => {
  it('emits no secret-shaped content', () => {
    const harness = createHarness();
    const { evidence } = harness.settle(INTENT, 'allowed-confirmed');
    expect(JSON.stringify(evidence)).not.toMatch(/-----BEGIN|Bearer\s/i);
  });

  it('serializes bigint values rather than throwing', () => {
    const harness = createHarness();
    const { evidence } = harness.settle(INTENT, 'allowed-confirmed');
    expect(() => JSON.stringify(evidence)).not.toThrow();
  });

  it('rejects an unknown scenario instead of defaulting to allowed', () => {
    const harness = createHarness();
    expect(() => harness.settle(INTENT, 'not-a-scenario' as SettlementScenario)).toThrow(
      /Unknown settlement scenario/,
    );
    expect(harness.broadcastCount).toBe(0);
  });
});
