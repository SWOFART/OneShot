/**
 * Configuration drift hardening (B04.4).
 *
 * The settlement boundary depends on values that live outside this repository:
 * a Privy policy in provider configuration, a wallet ID, a chain, a token, a
 * spending cap. Any of them can change without a commit, a deploy, or a
 * review.
 *
 * So the expected values are captured once as a baseline, and rechecked at
 * startup and before sensitive use. Every difference fails closed. A widened
 * cap and a narrowed cap are both failures here: this module's job is to
 * detect that the world no longer matches what was reviewed, not to judge
 * whether the change was benign.
 */

import { keccak256, toHex } from 'viem';

/** The identity the build was reviewed against. */
export interface SettlementBaseline {
  readonly policyDigest: string;
  readonly policyId: string;
  readonly walletId: string;
  readonly walletAddress: string;
  readonly chainId: number;
  readonly tokenContract: string;
  readonly settlementCapAtomic: bigint;
}

/** The identity observed right now. */
export type ObservedIdentity = SettlementBaseline;

export type DriftField =
  | 'policyDigest'
  | 'policyId'
  | 'walletId'
  | 'walletAddress'
  | 'chainId'
  | 'tokenContract'
  | 'settlementCapAtomic';

export interface DriftFinding {
  readonly field: DriftField;
  /** Sanitized description. Never prints a credential. */
  readonly detail: string;
}

export interface DriftReport {
  readonly safe: boolean;
  readonly findings: readonly DriftFinding[];
}

function normalize(value: string): string {
  return value.trim().toLowerCase();
}

/**
 * Compare observed identity against the reviewed baseline.
 *
 * Every field is compared, and all differences are collected rather than
 * returning on the first. An operator fixing drift should see the whole
 * picture, not discover it one restart at a time.
 */
export function detectDrift(
  baseline: SettlementBaseline,
  observed: ObservedIdentity,
): DriftReport {
  const findings: DriftFinding[] = [];

  if (normalize(baseline.policyDigest) !== normalize(observed.policyDigest)) {
    findings.push({
      field: 'policyDigest',
      detail:
        'The deployed Privy policy no longer matches the reviewed policy. ' +
        'Settlement is refused until the policy is restored or a new baseline ' +
        'is reviewed and approved.',
    });
  }

  if (normalize(baseline.policyId) !== normalize(observed.policyId)) {
    findings.push({ field: 'policyId', detail: 'The attached policy identifier changed.' });
  }

  if (normalize(baseline.walletId) !== normalize(observed.walletId)) {
    findings.push({ field: 'walletId', detail: 'The execution wallet identifier changed.' });
  }

  if (normalize(baseline.walletAddress) !== normalize(observed.walletAddress)) {
    findings.push({
      field: 'walletAddress',
      detail: 'The execution wallet address changed; evidence would not bind to prior attempts.',
    });
  }

  if (baseline.chainId !== observed.chainId) {
    findings.push({
      field: 'chainId',
      detail: `Chain changed from ${baseline.chainId} to ${observed.chainId}.`,
    });
  }

  if (normalize(baseline.tokenContract) !== normalize(observed.tokenContract)) {
    findings.push({ field: 'tokenContract', detail: 'The settlement token contract changed.' });
  }

  if (baseline.settlementCapAtomic !== observed.settlementCapAtomic) {
    // Both directions are reported. A lowered cap is not dangerous, but it
    // still means the deployment no longer matches what was reviewed.
    findings.push({
      field: 'settlementCapAtomic',
      detail:
        `The per-settlement cap changed from ${baseline.settlementCapAtomic.toString()} ` +
        `to ${observed.settlementCapAtomic.toString()} atomic units.`,
    });
  }

  return { safe: findings.length === 0, findings };
}

/** Deterministic digest of a baseline, for recording in evidence. */
export function baselineDigest(baseline: SettlementBaseline): `0x${string}` {
  return keccak256(
    toHex(
      JSON.stringify([
        normalize(baseline.policyDigest),
        normalize(baseline.policyId),
        normalize(baseline.walletId),
        normalize(baseline.walletAddress),
        baseline.chainId,
        normalize(baseline.tokenContract),
        baseline.settlementCapAtomic.toString(10),
      ]),
    ),
  );
}

export class DriftError extends Error {
  constructor(readonly findings: readonly DriftFinding[]) {
    super(
      `Settlement configuration drifted from the reviewed baseline: ${findings
        .map((finding) => finding.field)
        .join(', ')}.`,
    );
    this.name = 'DriftError';
  }
}

/**
 * Gate sensitive use on an unchanged baseline.
 *
 * Throws rather than returning a boolean, so a caller cannot proceed by
 * ignoring a return value.
 */
export function assertNoDrift(
  baseline: SettlementBaseline,
  observed: ObservedIdentity,
): void {
  const report = detectDrift(baseline, observed);
  if (!report.safe) throw new DriftError(report.findings);
}

/**
 * Webhook posture (B04.4).
 *
 * Webhooks stay disabled. Accepting a provider callback means accepting an
 * unauthenticated inbound claim about a payment, and signature verification
 * against Privy's scheme has not been proven here. Polling through
 * `EvidencePort` is complete on its own, so a webhook would add attack surface
 * without adding capability.
 */
export const WEBHOOKS_ENABLED = false;

/** Why webhooks are off, surfaced in the handoff artifact. */
export const WEBHOOK_POSTURE =
  'Disabled. Signature verification is unproven, and polling via EvidencePort ' +
  'is already complete. Enabling requires proven plan availability and verified ' +
  'signatures.';
