/**
 * Provider response simulator (B03.2, B03.3).
 *
 * Emits every SettlementPort response family from `milestones/CONTRACTS.md`
 * without network access or credentials, so the harness closes offline.
 *
 * The simulator counts every broadcast it performs. That counter is the
 * instrument the negative suite asserts against: a denial that returns the
 * right enum but still broadcast a transaction has not actually denied
 * anything.
 */

import type { ProviderResponse } from '@oneshot/arc-adapter';

export type SettlementScenario =
  /** Policy allows; transaction broadcasts and confirms. */
  | 'allowed-confirmed'
  /** Policy allows; transaction broadcasts and reverts on chain. */
  | 'allowed-final-revert'
  /** Policy allows; broadcast happened but the response was lost. */
  | 'allowed-lost-response'
  /** Policy allows; broadcast happened, receipt not yet available. */
  | 'allowed-pending'
  /** Policy allows; receipt returned but its Transfer does not match. */
  | 'allowed-mismatched-transfer'
  /** Policy denies before signing. Nothing broadcasts. */
  | 'denied-wrong-chain'
  | 'denied-wrong-contract'
  | 'denied-wrong-method'
  | 'denied-wrong-recipient'
  | 'denied-above-cap'
  | 'denied-non-zero-value'
  | 'denied-authorization-expired'
  /** Provider rejected the request shape before signing. */
  | 'request-validation-failed'
  /** Provider unreachable. Ambiguous: may or may not have broadcast. */
  | 'provider-timeout'
  | 'provider-5xx'
  | 'response-truncated';

/** Scenarios where the provider refuses before any external effect. */
const PRE_SUBMISSION: Readonly<Record<string, ProviderResponse>> = {
  'denied-wrong-chain': { kind: 'PRE_SUBMISSION_FAILURE', proof: 'POLICY_DENIED' },
  'denied-wrong-contract': { kind: 'PRE_SUBMISSION_FAILURE', proof: 'POLICY_DENIED' },
  'denied-wrong-method': { kind: 'PRE_SUBMISSION_FAILURE', proof: 'POLICY_DENIED' },
  'denied-wrong-recipient': { kind: 'PRE_SUBMISSION_FAILURE', proof: 'POLICY_DENIED' },
  'denied-above-cap': { kind: 'PRE_SUBMISSION_FAILURE', proof: 'POLICY_DENIED' },
  'denied-non-zero-value': { kind: 'PRE_SUBMISSION_FAILURE', proof: 'POLICY_DENIED' },
  'denied-authorization-expired': {
    kind: 'PRE_SUBMISSION_FAILURE',
    proof: 'AUTHORIZATION_INVALID',
  },
  'request-validation-failed': {
    kind: 'PRE_SUBMISSION_FAILURE',
    proof: 'REQUEST_VALIDATION_FAILED',
  },
};

/** Ambiguous scenarios. Each broadcasts, or may have broadcast. */
const AMBIGUOUS: Readonly<Record<string, ProviderResponse>> = {
  'provider-timeout': { kind: 'AMBIGUOUS', signal: 'TIMEOUT' },
  'provider-5xx': { kind: 'AMBIGUOUS', signal: 'PROVIDER_5XX' },
  'response-truncated': { kind: 'AMBIGUOUS', signal: 'TRUNCATED_RESPONSE' },
  'allowed-lost-response': { kind: 'AMBIGUOUS', signal: 'LOST_RESPONSE' },
  'allowed-pending': { kind: 'AMBIGUOUS', signal: 'UNKNOWN_ERROR' },
};

export interface SimulatedProvider {
  submit(scenario: SettlementScenario): ProviderResponse;
  /** Transactions actually broadcast. The safety instrument. */
  readonly broadcastCount: number;
}

/**
 * Build a provider simulator.
 *
 * `broadcastCount` increments only when a transaction crosses the external
 * boundary. A denial must leave it at zero; an ambiguous outcome must
 * increment it, because ambiguity means we cannot rule out a broadcast.
 */
export function createProvider(): SimulatedProvider {
  let broadcasts = 0;

  return {
    submit(scenario: SettlementScenario): ProviderResponse {
      const preSubmission = PRE_SUBMISSION[scenario];
      if (preSubmission) {
        // No increment: the provider refused before signing.
        return preSubmission;
      }

      const ambiguous = AMBIGUOUS[scenario];
      if (ambiguous) {
        // Increment even though the outcome is unknown. Counting these as
        // non-broadcasts would understate exposure and is exactly the
        // assumption that leads to a double payment.
        broadcasts += 1;
        return ambiguous;
      }

      switch (scenario) {
        case 'allowed-confirmed':
          broadcasts += 1;
          return { kind: 'VERIFIED_RECEIPT', confirmed: true };

        case 'allowed-final-revert':
        case 'allowed-mismatched-transfer':
          broadcasts += 1;
          return { kind: 'VERIFIED_RECEIPT', confirmed: false };

        default:
          // Unknown scenario names never produce a usable result.
          throw new Error(`Unknown settlement scenario: ${scenario}`);
      }
    },

    get broadcastCount(): number {
      return broadcasts;
    },
  };
}

/** Scenarios that must never broadcast. Drives the negative suite. */
export const DENIAL_SCENARIOS: readonly SettlementScenario[] = [
  'denied-wrong-chain',
  'denied-wrong-contract',
  'denied-wrong-method',
  'denied-wrong-recipient',
  'denied-above-cap',
  'denied-non-zero-value',
  'denied-authorization-expired',
  'request-validation-failed',
];
