/**
 * Standalone settlement harness (B03.2).
 *
 * Runs the whole adapter workflow against simulated providers so the packet
 * closes with no credentials and no network.
 *
 * The ordering here is the point. Request identity is persisted BEFORE the
 * provider is called, never after. If the process dies mid-submission, the
 * recorded identity is what lets recovery ask "did this specific request
 * happen?" instead of guessing. Persisting after a successful response would
 * leave exactly the crash window that produces a double payment.
 */

import {
  classifyOutcome,
  redact,
  type Classification,
  type ProviderResponse,
} from '@oneshot/arc-adapter';
import { buildCanonicalRequest, type SettlementIntent } from '@oneshot/privy-adapter';
import { createProvider, type SettlementScenario, type SimulatedProvider } from './provider-simulator.js';

import {
  FileAttemptStore,
  MemoryAttemptStore,
  type AttemptStore,
  type PersistedAttempt,
} from './attempt-store.js';

export type { AttemptStore, PersistedAttempt };
export { FileAttemptStore, MemoryAttemptStore };

/**
 * Backwards-compatible alias.
 *
 * The store moved to its own module once B03.2's "persist before submission"
 * requirement made a file-backed implementation necessary; an in-memory map
 * cannot demonstrate restart recovery.
 */
export const AttemptLog = MemoryAttemptStore;

export interface HarnessResult {
  readonly classification: Classification;
  /** Sanitized evidence, safe to log or turn into a fixture. */
  readonly evidence: unknown;
  /** True when this call crossed the external boundary. */
  readonly submitted: boolean;
  /** True when a prior attempt for this intent already existed. */
  readonly replayed: boolean;
}

export interface HarnessOptions {
  readonly provider?: SimulatedProvider;
  readonly log?: AttemptStore;
}

export interface Harness {
  settle(intent: SettlementIntent, scenario: SettlementScenario): HarnessResult;
  /** External broadcasts performed. Asserted by the negative suite. */
  readonly broadcastCount: number;
  readonly log: AttemptStore;
}

/** Harness version published in the B03 handoff artifact. */
export const HARNESS_VERSION = 'settlement-harness-v1';

export function createHarness(options: HarnessOptions = {}): Harness {
  const provider = options.provider ?? createProvider();
  const log = options.log ?? new MemoryAttemptStore();

  return {
    settle(intent: SettlementIntent, scenario: SettlementScenario): HarnessResult {
      const request = buildCanonicalRequest(intent);

      const { entry, isNew } = log.recordOrGet({
        businessIntentId: request.businessIntentId,
        payloadFingerprint: request.payloadFingerprint,
        idempotencyKey: request.idempotencyKey,
        referenceId: request.referenceId,
        submissionAttempted: false,
      });

      if (!isNew) {
        // A settlement right is granted once per Business Intent. A replay
        // reads the existing attempt and never reaches the provider.
        return {
          classification: {
            outcome: 'POSSIBLY_SUBMITTED',
            reason:
              'An attempt for this Business Intent already exists. Reconcile the ' +
              'existing attempt rather than submitting again.',
          },
          evidence: redact({
            businessIntentId: entry.businessIntentId,
            referenceId: entry.referenceId,
            replayOf: entry.idempotencyKey,
          }),
          submitted: false,
          replayed: true,
        };
      }

      // Mark before the call, not after. The window between this line and the
      // provider returning is exactly where a crash produces UNKNOWN, and the
      // mark is what makes that recoverable. Written through immediately for a
      // file-backed store: a buffered write would reopen that window.
      entry.submissionAttempted = true;
      if (log instanceof FileAttemptStore) {
        log.update(entry);
      }

      const response: ProviderResponse = provider.submit(scenario);
      const classification = classifyOutcome(response);

      return {
        classification,
        evidence: redact({
          businessIntentId: request.businessIntentId,
          referenceId: request.referenceId,
          payloadFingerprint: request.payloadFingerprint,
          chainId: request.chainId,
          to: request.to,
          value: request.value,
          outcome: classification.outcome,
          scenario,
        }),
        submitted: true,
        replayed: false,
      };
    },

    get broadcastCount(): number {
      return provider.broadcastCount;
    },

    log,
  };
}
