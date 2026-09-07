/**
 * Submission failure taxonomy (B04.1).
 *
 * Turns a real transport or provider error into a submission outcome.
 *
 * The whole file turns on one question: **did the request reach the network?**
 *
 * A DNS failure or a connection refusal happens before any bytes reach the
 * provider, so nothing can have been broadcast. A timeout, a reset mid-flight,
 * or a truncated response all happen at or after the moment the request left,
 * so a transaction may exist. The first group permits a retry; the second
 * never does.
 *
 * Getting this boundary wrong in the safe direction costs a stuck payment that
 * a human reconciles. Getting it wrong in the unsafe direction pays twice.
 */

import type { ProviderResponse, SubmissionOutcome } from './outcome.js';
import { classifyOutcome } from './outcome.js';

/**
 * Transport failures that provably happened before the request was sent.
 *
 * Every entry needs a documented reason why no byte reached the provider.
 * Adding one widens retry permission, so the bar is proof, not likelihood.
 */
export type PreBroadcastFailure =
  /** Hostname never resolved. No connection was opened. */
  | 'DNS_RESOLUTION_FAILED'
  /** The peer actively refused the connection. No request was sent. */
  | 'CONNECTION_REFUSED'
  /** TLS handshake failed before any application data was transmitted. */
  | 'TLS_HANDSHAKE_FAILED'
  /** The request was rejected locally before being written to the socket. */
  | 'LOCAL_VALIDATION_FAILED';

/**
 * Failures that may have occurred after the request was sent.
 *
 * Note `TLS_INTERRUPTED` sits here while `TLS_HANDSHAKE_FAILED` sits above:
 * an interrupted connection may have already delivered the request.
 */
export type PostSendAmbiguity =
  | 'REQUEST_TIMEOUT'
  | 'CONNECTION_RESET'
  | 'TLS_INTERRUPTED'
  | 'RATE_LIMITED_429'
  | 'SERVER_ERROR_5XX'
  | 'TRUNCATED_RESPONSE'
  | 'MALFORMED_RESPONSE'
  | 'LOST_SUCCESS_RESPONSE'
  | 'PROCESS_TERMINATED';

export type TransportFailure =
  | { readonly phase: 'PRE_BROADCAST'; readonly kind: PreBroadcastFailure }
  | { readonly phase: 'POST_SEND'; readonly kind: PostSendAmbiguity };

/**
 * Node error codes that prove the request never left.
 *
 * `ECONNREFUSED` means the peer rejected the TCP handshake. `ENOTFOUND` and
 * `EAI_AGAIN` are DNS. None of them can coexist with a delivered request.
 *
 * `ECONNRESET` and `ETIMEDOUT` are deliberately absent: both can occur after
 * the request was written.
 */
const PRE_BROADCAST_ERROR_CODES: Readonly<Record<string, PreBroadcastFailure>> = {
  ENOTFOUND: 'DNS_RESOLUTION_FAILED',
  EAI_AGAIN: 'DNS_RESOLUTION_FAILED',
  ECONNREFUSED: 'CONNECTION_REFUSED',
  ERR_TLS_CERT_ALTNAME_INVALID: 'TLS_HANDSHAKE_FAILED',
  UNABLE_TO_VERIFY_LEAF_SIGNATURE: 'TLS_HANDSHAKE_FAILED',
  CERT_HAS_EXPIRED: 'TLS_HANDSHAKE_FAILED',
  DEPTH_ZERO_SELF_SIGNED_CERT: 'TLS_HANDSHAKE_FAILED',
};

const POST_SEND_ERROR_CODES: Readonly<Record<string, PostSendAmbiguity>> = {
  ECONNRESET: 'CONNECTION_RESET',
  ETIMEDOUT: 'REQUEST_TIMEOUT',
  ERR_SOCKET_CONNECTION_TIMEOUT: 'REQUEST_TIMEOUT',
  EPIPE: 'CONNECTION_RESET',
  ERR_STREAM_PREMATURE_CLOSE: 'TRUNCATED_RESPONSE',
};

function errorCodeOf(error: unknown): string | undefined {
  if (typeof error !== 'object' || error === null) return undefined;
  const code = (error as { code?: unknown }).code;
  return typeof code === 'string' ? code : undefined;
}

/**
 * Classify a thrown transport error.
 *
 * Anything unrecognized is `POST_SEND`. An error this build has never seen
 * cannot be proof that nothing was broadcast, and treating it as such is the
 * failure mode that pays twice.
 */
export function classifyTransportError(error: unknown): TransportFailure {
  const code = errorCodeOf(error);

  if (code !== undefined) {
    const pre = PRE_BROADCAST_ERROR_CODES[code];
    if (pre) return { phase: 'PRE_BROADCAST', kind: pre };

    const post = POST_SEND_ERROR_CODES[code];
    if (post) return { phase: 'POST_SEND', kind: post };
  }

  return { phase: 'POST_SEND', kind: 'MALFORMED_RESPONSE' };
}

/**
 * Classify an HTTP status.
 *
 * A 4xx other than 429 means the provider rejected the request on its own
 * terms and did not act on it. 429 is excluded: a rate limiter may reject
 * either before or after the work is queued, so it stays ambiguous.
 */
export function classifyHttpStatus(status: number): TransportFailure {
  if (status === 429) return { phase: 'POST_SEND', kind: 'RATE_LIMITED_429' };
  if (status >= 500) return { phase: 'POST_SEND', kind: 'SERVER_ERROR_5XX' };
  if (status >= 400) {
    return { phase: 'PRE_BROADCAST', kind: 'LOCAL_VALIDATION_FAILED' };
  }
  // A 2xx or 3xx reaching this path means the caller could not interpret the
  // body, which says nothing about whether the transaction was broadcast.
  return { phase: 'POST_SEND', kind: 'MALFORMED_RESPONSE' };
}

/** Map a transport failure onto the SettlementPort response shape. */
export function toProviderResponse(failure: TransportFailure): ProviderResponse {
  if (failure.phase === 'PRE_BROADCAST') {
    return { kind: 'PRE_SUBMISSION_FAILURE', proof: 'REQUEST_VALIDATION_FAILED' };
  }

  const kind: PostSendAmbiguity = failure.kind;

  switch (kind) {
    case 'REQUEST_TIMEOUT':
      return { kind: 'AMBIGUOUS', signal: 'TIMEOUT' };
    case 'CONNECTION_RESET':
    case 'TLS_INTERRUPTED':
      return { kind: 'AMBIGUOUS', signal: 'CONNECTION_RESET' };
    case 'RATE_LIMITED_429':
      return { kind: 'AMBIGUOUS', signal: 'RATE_LIMITED' };
    case 'SERVER_ERROR_5XX':
      return { kind: 'AMBIGUOUS', signal: 'PROVIDER_5XX' };
    case 'TRUNCATED_RESPONSE':
      return { kind: 'AMBIGUOUS', signal: 'TRUNCATED_RESPONSE' };
    case 'MALFORMED_RESPONSE':
      return { kind: 'AMBIGUOUS', signal: 'MALFORMED_RESPONSE' };
    case 'LOST_SUCCESS_RESPONSE':
      return { kind: 'AMBIGUOUS', signal: 'LOST_RESPONSE' };
    case 'PROCESS_TERMINATED':
      return { kind: 'AMBIGUOUS', signal: 'PROCESS_CRASH' };
    default: {
      // Exhaustive over PostSendAmbiguity. A new member added without a case
      // lands here and is treated as unrecognized, which fails closed.
      const unreachable: never = kind;
      return { kind: 'UNRECOGNIZED', detail: String(unreachable) };
    }
  }
}

/** Convenience: classify a transport failure straight to an outcome. */
export function outcomeForTransportFailure(failure: TransportFailure): SubmissionOutcome {
  return classifyOutcome(toProviderResponse(failure)).outcome;
}
