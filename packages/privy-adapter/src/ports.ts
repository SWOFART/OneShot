/**
 * Production entry point (B04.5).
 *
 * Exports only the frozen port interfaces from `milestones/CONTRACTS.md`
 * section 5 and sanitized error shapes. Consumers compose against this surface,
 * never against adapter internals, so the internals can change without
 * breaking A's composition.
 *
 * Import direction is one-way by design: this package depends on the contract
 * and on `@oneshot/arc-adapter`, and on nothing owned by Coder A or Coder C.
 * `milestones/README.md` forbids importing another owner's implementation
 * package, and a compatibility test asserts it rather than trusting review.
 */

import type { EvidenceResult, SubmissionOutcome } from '@oneshot/arc-adapter';

/** Compatibility metadata published in the B04 handoff artifact. */
export const ADAPTER_CONTRACT_VERSION = 'settlement-adapter-contract-v1';

/** Contract pack this build was written against. */
export const CONTRACT_PACK_VERSION = 'frozen-v1';

/** AuthorizationPort result, per CONTRACTS.md section 5. */
export type AuthorizationResult = 'AUTHORIZED' | 'DENIED' | 'UNAVAILABLE';

export interface AuthorizationRequest {
  readonly businessIntentId: string;
  readonly attemptId: string;
  readonly payloadFingerprint: string;
  readonly chainId: number;
  readonly tokenContract: `0x${string}`;
  readonly recipient: `0x${string}`;
  readonly amountAtomic: bigint;
  readonly correlationId: string;
}

export interface AuthorizationPort {
  evaluate(request: AuthorizationRequest): Promise<AuthorizationResult>;
}

export interface SettlementRequest extends AuthorizationRequest {
  readonly idempotencyKey: string;
  readonly referenceId: string;
}

export interface SettlementPort {
  submit(request: SettlementRequest): Promise<SubmissionOutcome>;
}

export interface EvidenceRequest {
  readonly businessIntentId: string;
  readonly transactionHash?: string | undefined;
  readonly chainId: number;
  readonly tokenContract: string;
  readonly recipient: string;
  readonly amountAtomic: bigint;
}

export interface EvidencePort {
  lookup(request: EvidenceRequest): Promise<EvidenceResult>;
}

/**
 * Stable error families crossing the package boundary.
 *
 * Deliberately coarse. A provider's own error text can carry request bodies,
 * headers, and identifiers, so it never crosses this seam; callers get a
 * classification and a sanitized message.
 */
export type AdapterErrorCode =
  | 'CONFIGURATION_INVALID'
  | 'CONFIGURATION_DRIFTED'
  | 'NOT_READY'
  | 'SCOPE_DENIED'
  | 'PROVIDER_UNAVAILABLE'
  | 'OUTCOME_AMBIGUOUS';

export class AdapterError extends Error {
  constructor(
    readonly code: AdapterErrorCode,
    message: string,
  ) {
    super(message);
    this.name = 'AdapterError';
  }
}

/**
 * Compatibility manifest, published for A's composition.
 *
 * `providesPorts` is what A may rely on. `requiresHostCapabilities` is what A
 * must supply. Anything absent from both is an internal detail that may change
 * without notice.
 */
export const COMPATIBILITY_MANIFEST = {
  contractVersion: ADAPTER_CONTRACT_VERSION,
  contractPack: CONTRACT_PACK_VERSION,
  providesPorts: ['AuthorizationPort', 'SettlementPort', 'EvidencePort'] as const,
  requiresHostCapabilities: [
    'durable business intent and attempt state',
    'atomic submission-ownership grant',
    'persisted request identity across restarts',
  ] as const,
  doesNotProvide: [
    'reconciliation decisions',
    'external-index authority',
    'automatic transaction replacement',
    'user interface',
  ] as const,
  /** Live gaps, listed so fixtures cannot masquerade as live evidence. */
  liveGapsForGateP4: [
    'No Privy tenant has executed a policy denial or an allowed settlement.',
    'Arc receipt and Transfer log shapes are modelled, never observed.',
    'Privy wallet and policy identifier formats are shape-guessed, not documented.',
  ] as const,
} as const;
