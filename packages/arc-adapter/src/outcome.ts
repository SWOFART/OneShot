/**
 * Submission outcome classifier (B02.5).
 *
 * Maps a provider or RPC response to one of the three SettlementPort results
 * in `milestones/CONTRACTS.md` section 5. Pure: no network, no durable state,
 * no clock.
 *
 * The whole module exists to make one bias structural: **doubt means
 * `POSSIBLY_SUBMITTED`**. `DEFINITELY_NOT_SUBMITTED` is a strong claim that no
 * external effect occurred, and it is the only result that permits a fresh
 * attempt without reconciliation. It is therefore granted only for narrow,
 * documented proofs, and every unrecognized shape falls through to
 * `POSSIBLY_SUBMITTED`.
 *
 * `.agent/SECURITY_INVARIANTS.md`: a timeout, crash, disconnect, lost response,
 * or provider error after possible submission creates `UNKNOWN`.
 */

export type SubmissionOutcome =
  /** Verified final receipt and exactly matching Transfer evidence. */
  | 'CONFIRMED'
  /** Narrow documented proof that no broadcast or external effect occurred. */
  | 'DEFINITELY_NOT_SUBMITTED'
  /** Any doubt at all. Maps to durable UNKNOWN and requires reconciliation. */
  | 'POSSIBLY_SUBMITTED';

/**
 * Failure shapes that prove the request never reached the network.
 *
 * Each is a pre-flight rejection: the provider refused the request before
 * broadcasting anything, so no transaction can exist. Adding to this list
 * widens the set of situations that permit a retry, so entries need real
 * documented proof.
 */
export type PreSubmissionProof =
  /** Privy policy denied the action. Nothing was signed. */
  | 'POLICY_DENIED'
  /** Request failed schema validation at the provider before signing. */
  | 'REQUEST_VALIDATION_FAILED'
  /** Local scope check refused the transaction before it was ever sent. */
  | 'LOCAL_SCOPE_DENIED'
  /** Authorization was rejected as expired or invalid before signing. */
  | 'AUTHORIZATION_INVALID';

/**
 * Ambiguous shapes. Listed for documentation and exhaustiveness; every one of
 * them classifies as `POSSIBLY_SUBMITTED`.
 */
export type AmbiguousSignal =
  | 'TIMEOUT'
  | 'CONNECTION_RESET'
  | 'LOST_RESPONSE'
  | 'TRUNCATED_RESPONSE'
  | 'MALFORMED_RESPONSE'
  | 'PROVIDER_5XX'
  | 'RATE_LIMITED'
  | 'PROCESS_CRASH'
  | 'UNKNOWN_ERROR';

export type ProviderResponse =
  /** A receipt was obtained and independently verified as confirmed. */
  | { readonly kind: 'VERIFIED_RECEIPT'; readonly confirmed: boolean }
  /** The provider proved it never submitted. */
  | { readonly kind: 'PRE_SUBMISSION_FAILURE'; readonly proof: PreSubmissionProof }
  /** Something went wrong and we cannot prove what. */
  | { readonly kind: 'AMBIGUOUS'; readonly signal: AmbiguousSignal }
  /** A shape this build does not recognize. */
  | { readonly kind: 'UNRECOGNIZED'; readonly detail: string };

export interface Classification {
  readonly outcome: SubmissionOutcome;
  /** Sanitized explanation suitable for an operator timeline. */
  readonly reason: string;
}

/**
 * Classify a provider response.
 *
 * Note the asymmetry in the `VERIFIED_RECEIPT` case: a confirmed receipt gives
 * `CONFIRMED`, but an unconfirmed one does NOT give
 * `DEFINITELY_NOT_SUBMITTED`. Failing to prove a settlement happened is not
 * proof that it did not; the transaction may be pending, or the receipt may be
 * for an attempt whose Transfer we could not match yet.
 */
export function classifyOutcome(response: ProviderResponse): Classification {
  switch (response.kind) {
    case 'VERIFIED_RECEIPT':
      return response.confirmed
        ? {
            outcome: 'CONFIRMED',
            reason: 'Final receipt and exactly the expected Transfer were verified.',
          }
        : {
            outcome: 'POSSIBLY_SUBMITTED',
            reason:
              'A receipt was obtained but did not prove the expected settlement. ' +
              'Absence of proof is not proof of absence; reconcile before retrying.',
          };

    case 'PRE_SUBMISSION_FAILURE':
      return {
        outcome: 'DEFINITELY_NOT_SUBMITTED',
        reason: `The request was refused before broadcast (${response.proof}); no external effect occurred.`,
      };

    case 'AMBIGUOUS':
      return {
        outcome: 'POSSIBLY_SUBMITTED',
        reason: `The outcome is unknown after ${response.signal}; the transaction may have been broadcast.`,
      };

    case 'UNRECOGNIZED':
      // An unrecognized response must never widen retry permission. This is
      // the fail-closed default the module exists for.
      return {
        outcome: 'POSSIBLY_SUBMITTED',
        reason: 'The provider response was not recognized, so submission cannot be ruled out.',
      };

    default: {
      const unreachable: never = response;
      return {
        outcome: 'POSSIBLY_SUBMITTED',
        reason: `Unhandled response shape: ${String(unreachable)}`,
      };
    }
  }
}

/** Only this outcome permits a fresh attempt without reconciliation. */
export function permitsImmediateRetry(outcome: SubmissionOutcome): boolean {
  return outcome === 'DEFINITELY_NOT_SUBMITTED';
}
