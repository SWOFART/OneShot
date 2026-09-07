/**
 * Canonical settlement request identity (B02.1, B02.2).
 *
 * One Business Intent must produce one byte-stable request. Everything here is
 * deterministic: the same intent yields the same calldata, the same body
 * fingerprint, the same idempotency key, and the same reference ID on every
 * process, every worker, and every restart.
 *
 * That determinism is the point. `.agent/SECURITY_INVARIANTS.md` requires a
 * stable identity across retries, and the provider idempotency key is only
 * useful if independent workers derive the identical key for the identical
 * obligation.
 */

import { keccak256, toHex } from 'viem';
import { buildSettlementTransaction, type ExpectedScope } from './scope.js';

/** The immutable inputs that define one settlement obligation. */
export interface SettlementIntent {
  /** Caller-supplied stable identity. Survives retries and restarts. */
  readonly businessIntentId: string;
  readonly chainId: number;
  readonly tokenContract: `0x${string}`;
  readonly recipient: `0x${string}`;
  /** Atomic units at the ERC-20 six-decimal precision. */
  readonly amountAtomic: bigint;
}

export interface CanonicalRequest {
  readonly businessIntentId: string;
  /** Deterministic serialization the fingerprint is computed over. */
  readonly canonicalBody: string;
  /** keccak256 of the canonical body. Detects any payload divergence. */
  readonly payloadFingerprint: `0x${string}`;
  /** Stable key sent to Privy so a replay collapses provider-side too. */
  readonly idempotencyKey: `0x${string}`;
  /** Stable lookup identity for evidence recovery. */
  readonly referenceId: string;
  readonly chainId: number;
  readonly to: `0x${string}`;
  readonly value: bigint;
  readonly data: `0x${string}`;
}

export class RequestError extends Error {
  constructor(
    message: string,
    readonly code:
      | 'EMPTY_INTENT_ID'
      | 'INTENT_ID_TOO_LONG'
      | 'AMOUNT_NOT_POSITIVE'
      | 'AMOUNT_TOO_LARGE'
      | 'IDEMPOTENCY_KEY_REUSED',
  ) {
    super(message);
    this.name = 'RequestError';
  }
}

/** `milestones/CONTRACTS.md`: the intent id is an opaque, length-bounded string. */
const MAX_INTENT_ID_LENGTH = 128;

/** uint256 ceiling. An amount at or above this cannot be encoded. */
const MAX_UINT256 = (1n << 256n) - 1n;

/**
 * Serialize an intent deterministically.
 *
 * Field order is fixed and written by hand rather than taken from
 * `JSON.stringify` over an object literal, because key order there depends on
 * construction order. Two workers building the same intent differently would
 * otherwise produce different fingerprints for the same obligation.
 *
 * The address fields are lowercased so that checksummed and non-checksummed
 * spellings of one address cannot fingerprint differently.
 */
export function canonicalizeIntent(intent: SettlementIntent): string {
  return JSON.stringify([
    ['businessIntentId', intent.businessIntentId],
    ['chainId', intent.chainId],
    ['tokenContract', intent.tokenContract.toLowerCase()],
    ['recipient', intent.recipient.toLowerCase()],
    ['amountAtomic', intent.amountAtomic.toString(10)],
  ]);
}

function validate(intent: SettlementIntent): void {
  if (intent.businessIntentId.trim() === '') {
    throw new RequestError('business_intent_id must not be empty.', 'EMPTY_INTENT_ID');
  }
  if (intent.businessIntentId.length > MAX_INTENT_ID_LENGTH) {
    throw new RequestError(
      `business_intent_id exceeds ${MAX_INTENT_ID_LENGTH} characters.`,
      'INTENT_ID_TOO_LONG',
    );
  }
  if (intent.amountAtomic <= 0n) {
    throw new RequestError('Settlement amount must be greater than zero.', 'AMOUNT_NOT_POSITIVE');
  }
  if (intent.amountAtomic > MAX_UINT256) {
    throw new RequestError('Settlement amount exceeds uint256.', 'AMOUNT_TOO_LARGE');
  }
}

/**
 * Build the canonical request for an intent.
 *
 * Uses the direct ERC-20 transfer path. The Arc Memo forwarded call is not
 * built: B01.3 recorded it `NOT_SUPPORTED` because Privy policy cannot
 * constrain the forwarded recipient and amount. See
 * `.agent/research/20260907-b01-arc-privy-verification.md`.
 */
export function buildCanonicalRequest(intent: SettlementIntent): CanonicalRequest {
  validate(intent);

  const scope: ExpectedScope = {
    chainId: intent.chainId,
    tokenContract: intent.tokenContract,
    recipient: intent.recipient,
    amountAtomic: intent.amountAtomic,
  };
  const transaction = buildSettlementTransaction(scope);

  const canonicalBody = canonicalizeIntent(intent);
  const payloadFingerprint = keccak256(toHex(canonicalBody));

  return {
    businessIntentId: intent.businessIntentId,
    canonicalBody,
    payloadFingerprint,
    // Derived from the fingerprint, so the same obligation always produces the
    // same provider key and a duplicate submission collapses at Privy too.
    idempotencyKey: payloadFingerprint,
    referenceId: `oneshot-${intent.businessIntentId}`,
    chainId: transaction.chainId,
    to: transaction.to,
    value: transaction.value,
    data: transaction.data,
  };
}

/**
 * Refuse reuse of one idempotency key with a different body.
 *
 * This is the `INTENT_PAYLOAD_CONFLICT` rule from `milestones/CONTRACTS.md`
 * section 3 at the adapter boundary. Sending a changed body under a previously
 * used key is how a second, different payment gets authorized under the
 * identity of the first.
 *
 * Because the key here is the fingerprint itself, a differing body yields a
 * differing key and this can only trigger on a caller-supplied mismatch. It is
 * checked anyway: the key derivation is an implementation choice that could
 * change, and this invariant must outlive it.
 */
export function assertIdempotencyKeyBinding(
  request: CanonicalRequest,
  previouslySeen: { readonly idempotencyKey: string; readonly payloadFingerprint: string },
): void {
  if (
    previouslySeen.idempotencyKey === request.idempotencyKey &&
    previouslySeen.payloadFingerprint !== request.payloadFingerprint
  ) {
    throw new RequestError(
      'The same idempotency key was reused with a different payload fingerprint.',
      'IDEMPOTENCY_KEY_REUSED',
    );
  }
}

/**
 * Provider idempotency window, documented as supplemental only (B02.2).
 *
 * Privy's key deduplicates for a bounded period. OneShot's durable state is the
 * authority for at-most-once settlement and remains so past this window; the
 * provider key is defence in depth, never the lock.
 */
export const PROVIDER_IDEMPOTENCY_WINDOW_HOURS = 24;
