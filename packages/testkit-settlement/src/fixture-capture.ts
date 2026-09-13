/**
 * Live-to-fixture conversion (B03.5).
 *
 * Turns a real provider or RPC response into a fixture safe to commit to a
 * public repository.
 *
 * Two rules, both enforced here rather than by reviewer discipline:
 *
 * 1. Strip everything not needed to reproduce the decision. Headers, request
 *    metadata, and provider bookkeeping are not evidence; they are leak
 *    surface.
 * 2. Redact whatever survives. `redact` is deny-by-default on key name and on
 *    value shape, so a provider field nobody has classified is removed rather
 *    than published.
 */

import { assertNoSecrets, redact } from '@oneshot/arc-adapter';

/** Fields kept from a receipt. Everything else is dropped. */
const RECEIPT_FIELDS = [
  'transactionHash',
  'chainId',
  'from',
  'to',
  'status',
  'blockNumber',
  'blockHash',
  'logs',
] as const;

/** Fields kept from a log. */
const LOG_FIELDS = ['address', 'topics', 'data', 'logIndex'] as const;

export interface CapturedFixture {
  readonly version: 'settlement-fixture-v1';
  readonly name: string;
  /** What this fixture is expected to prove when replayed. */
  readonly expectation: string;
  readonly payload: unknown;
}

function pick(source: unknown, fields: readonly string[]): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  if (typeof source !== 'object' || source === null) return out;
  const record = source as Record<string, unknown>;
  for (const field of fields) {
    if (field in record) out[field] = record[field];
  }
  return out;
}

/**
 * Capture a receipt as a fixture.
 *
 * Allowlists fields rather than blocklisting them: a provider adding a new
 * field to its receipt shape must not silently start appearing in committed
 * fixtures.
 */
export function captureReceiptFixture(
  name: string,
  expectation: string,
  rawReceipt: unknown,
): CapturedFixture {
  const trimmed = pick(rawReceipt, RECEIPT_FIELDS);

  const logs = trimmed.logs;
  if (Array.isArray(logs)) {
    trimmed.logs = logs.map((log) => pick(log, LOG_FIELDS));
  }

  const payload = redact(trimmed);

  // Fail loudly at capture time rather than committing a leak.
  assertNoSecrets(payload);

  return { version: 'settlement-fixture-v1', name, expectation, payload };
}

/**
 * Capture an arbitrary provider response as a fixture.
 *
 * Used for the response families that are not receipts, such as policy denials
 * and ambiguous failures.
 */
export function captureResponseFixture(
  name: string,
  expectation: string,
  rawResponse: unknown,
): CapturedFixture {
  const payload = redact(rawResponse);
  assertNoSecrets(payload);
  return { version: 'settlement-fixture-v1', name, expectation, payload };
}

/**
 * Reject a fixture whose version this build does not know.
 *
 * Per `.agent/AGENTS.md`, simulators reject unknown fixture versions and schema
 * drift rather than guessing at their meaning.
 */
export function assertKnownFixtureVersion(fixture: { readonly version: string }): void {
  if (fixture.version !== 'settlement-fixture-v1') {
    throw new Error(`Unknown fixture version: ${fixture.version}`);
  }
}
