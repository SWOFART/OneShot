import {
  OPENAPI_MOCK_SERVER_VERSION,
  type AuthorizationStatus,
  type EvidenceView,
  type IntentResponse,
  type IntentState,
  type PolicyStatus,
} from '@oneshot/contracts';

import { compareAtomic, formatAtomicUsdc, isAtomicAmount } from './money.js';

export const SETTLEMENT_UI_CONTRACT_VERSION = 'settlement-details-v1' as const;

/** Mock-server version this slice is built and tested against. */
export const SETTLEMENT_UI_MOCK_SERVER_VERSION = OPENAPI_MOCK_SERVER_VERSION;

const MAX_TEXT_LENGTH = 256;
const MAX_EXPLORER_URL_LENGTH = 256;
const EVM_ADDRESS_PATTERN = /^0x[0-9a-fA-F]{40}$/u;
const TRANSACTION_HASH_PATTERN = /^0x[0-9a-fA-F]{64}$/u;
const BLOCK_NUMBER_PATTERN = /^(0|[1-9][0-9]*)$/u;

/**
 * Control characters are matched by code point rather than by a regular
 * expression: a control character inside a pattern literal is exactly the kind
 * of invisible source that `no-control-regex` exists to prevent.
 */
function isControlCodePoint(codePoint: number): boolean {
  return codePoint < 0x20 || codePoint === 0x7f;
}

function containsControlCharacter(value: string): boolean {
  for (let index = 0; index < value.length; index += 1) {
    if (isControlCodePoint(value.charCodeAt(index))) {
      return true;
    }
  }
  return false;
}

function replaceControlCharacters(value: string, replacement: string): string {
  let result = '';
  for (const character of value) {
    result += isControlCodePoint(character.codePointAt(0) ?? 0) ? replacement : character;
  }
  return result;
}

/**
 * Field names that must never reach a component prop. The API is expected to be
 * sanitized upstream; this is the consumer-side fail-closed check, because a
 * future provider field leaking through would otherwise render.
 */
const FORBIDDEN_KEY_FRAGMENTS = [
  'secret',
  'private',
  'seed',
  'mnemonic',
  'passphrase',
  'password',
  'credential',
  'signature',
  'signed',
  'apikey',
  'api_key',
  'access_token',
  'bearer',
  'authorization_header',
  'raw_policy',
  'raw_response',
  'raw_provider',
] as const;

export class SanitizationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'SanitizationError';
  }
}

/**
 * Rejects a payload carrying a field whose name indicates secret or raw
 * provider material. Runs before projection, so an unexpected shape fails the
 * render instead of being partially trusted.
 */
export function assertNoSensitiveFields(value: unknown, path = '$'): void {
  if (Array.isArray(value)) {
    value.forEach((entry, index) => {
      assertNoSensitiveFields(entry, `${path}[${index}]`);
    });
    return;
  }
  if (value === null || typeof value !== 'object') {
    return;
  }
  for (const [key, entry] of Object.entries(value as Record<string, unknown>)) {
    const normalized = key.toLowerCase();
    const forbidden = FORBIDDEN_KEY_FRAGMENTS.find((fragment) => normalized.includes(fragment));
    if (forbidden !== undefined) {
      throw new SanitizationError(
        `Refusing to render ${path}.${key}: field name matches forbidden fragment "${forbidden}"`,
      );
    }
    assertNoSensitiveFields(entry, `${path}.${key}`);
  }
}

/** Strips control characters and bounds length for any operator-facing string. */
export function sanitizeText(value: string | undefined | null): string | null {
  if (typeof value !== 'string') {
    return null;
  }
  const stripped = replaceControlCharacters(value, ' ').trim();
  if (stripped.length === 0) {
    return null;
  }
  return stripped.length > MAX_TEXT_LENGTH
    ? `${stripped.slice(0, MAX_TEXT_LENGTH - 1)}…`
    : stripped;
}

export interface ExplorerLink {
  readonly href: string | null;
  readonly rejectedReason: string | null;
}

/**
 * Validates an outbound explorer URL before it can become an anchor href.
 *
 * The OpenAPI field is a bounded string with no scheme constraint, so the rules
 * live here: https only, no embedded credentials, and the link must reference
 * the exact transaction hash being displayed. A link that cannot be proven to
 * point at this transaction is dropped rather than rendered.
 */
export function validateExplorerUrl(
  rawUrl: string | undefined | null,
  transactionHash: string,
): ExplorerLink {
  if (typeof rawUrl !== 'string' || rawUrl.trim().length === 0) {
    return { href: null, rejectedReason: null };
  }
  const candidate = rawUrl.trim();
  if (candidate.length > MAX_EXPLORER_URL_LENGTH) {
    return { href: null, rejectedReason: 'Explorer link exceeds the permitted length.' };
  }
  if (containsControlCharacter(candidate) || /\s/u.test(candidate)) {
    return { href: null, rejectedReason: 'Explorer link contains unsupported characters.' };
  }

  let parsed: URL;
  try {
    parsed = new URL(candidate);
  } catch {
    return { href: null, rejectedReason: 'Explorer link is not a valid absolute URL.' };
  }
  if (parsed.protocol !== 'https:') {
    return { href: null, rejectedReason: 'Explorer link must use https.' };
  }
  if (parsed.username !== '' || parsed.password !== '') {
    return { href: null, rejectedReason: 'Explorer link must not embed credentials.' };
  }
  if (parsed.hostname === '') {
    return { href: null, rejectedReason: 'Explorer link has no host.' };
  }
  if (!TRANSACTION_HASH_PATTERN.test(transactionHash)) {
    return { href: null, rejectedReason: 'Transaction hash is not a valid Arc transaction hash.' };
  }
  const reference = `${parsed.pathname}${parsed.search}`.toLowerCase();
  if (!reference.includes(transactionHash.toLowerCase())) {
    return {
      href: null,
      rejectedReason: 'Explorer link does not reference this transaction hash.',
    };
  }
  return { href: parsed.toString(), rejectedReason: null };
}

export type SettlementPhase =
  | 'AWAITING_AUTHORIZATION'
  | 'READY'
  | 'SUBMITTING'
  | 'PENDING_UNKNOWN'
  | 'COMMITTED'
  | 'FINAL_FAILED_SAFE'
  | 'REJECTED';

export type VerificationState = 'VERIFIED' | 'UNVERIFIED' | 'NONE';

export type AuthorizationDisplayStatus = AuthorizationStatus | 'NOT_REPORTED';

export type PolicyDisplayStatus = PolicyStatus | 'NOT_REPORTED';

export interface PolicySummaryDisplay {
  readonly policyId: string | null;
  readonly status: PolicyDisplayStatus;
  readonly network: string;
  readonly asset: string;
  readonly recipient: string;
  readonly allowedRecipients: readonly string[];
  /** `null` when no allowlist is reported: unknown is not the same as allowed. */
  readonly recipientAllowlisted: boolean | null;
  readonly settlementCapAtomic: string | null;
  readonly settlementCapDisplay: string | null;
  readonly amountAtomic: string;
  readonly amountDisplay: string | null;
  /** `null` when either amount or cap is missing or malformed. */
  readonly amountWithinCap: boolean | null;
}

export interface AuthorizationDisplay {
  readonly status: AuthorizationDisplayStatus;
  readonly attemptId: string | null;
  readonly occurredAt: string | null;
  readonly sanitizedReason: string | null;
  readonly terminal: boolean;
}

export interface VerifiedTransactionDisplay {
  readonly providerReferenceId: string;
  readonly transactionHash: string;
  readonly blockNumber: string;
  readonly transferLogIndex: number;
  readonly tokenContract: string | null;
  readonly recipient: string;
  readonly amountAtomic: string;
  readonly amountDisplay: string | null;
  readonly explorer: ExplorerLink;
}

export interface EvidenceDisplay {
  readonly source: EvidenceView['source'];
  readonly authorityClass: EvidenceView['authority_class'];
  readonly retrievedAt: string;
  readonly digest: string;
  readonly blockNumber: string | null;
  readonly freshness: NonNullable<EvidenceView['freshness']> | null;
}

export interface SettlementDetailsView {
  readonly contractVersion: typeof SETTLEMENT_UI_CONTRACT_VERSION;
  readonly businessIntentId: string;
  readonly purpose: string | null;
  readonly state: IntentState;
  readonly phase: SettlementPhase;
  /** `false` for `UNKNOWN`: an ambiguous outcome is never a finished one. */
  readonly terminal: boolean;
  readonly policy: PolicySummaryDisplay;
  readonly authorization: AuthorizationDisplay;
  readonly verification: VerificationState;
  readonly transaction: VerifiedTransactionDisplay | null;
  readonly evidence: readonly EvidenceDisplay[];
  readonly evidenceAvailable: boolean;
}

const PHASE_BY_STATE: Readonly<Record<IntentState, SettlementPhase>> = {
  AUTHORIZING: 'AWAITING_AUTHORIZATION',
  READY: 'READY',
  SUBMITTING: 'SUBMITTING',
  UNKNOWN: 'PENDING_UNKNOWN',
  COMMITTED: 'COMMITTED',
  FAILED_SAFE: 'FINAL_FAILED_SAFE',
  REJECTED: 'REJECTED',
};

const TERMINAL_PHASES: ReadonlySet<SettlementPhase> = new Set<SettlementPhase>([
  'COMMITTED',
  'FINAL_FAILED_SAFE',
  'REJECTED',
]);

const TERMINAL_AUTHORIZATION: ReadonlySet<AuthorizationDisplayStatus> =
  new Set<AuthorizationDisplayStatus>(['DENIED', 'CONFIG_MISMATCH']);

function projectEvidence(evidence: readonly EvidenceView[]): readonly EvidenceDisplay[] {
  return evidence.map((entry) => ({
    source: entry.source,
    authorityClass: entry.authority_class,
    retrievedAt: entry.retrieved_at,
    digest: entry.digest,
    blockNumber:
      typeof entry.block_number === 'string' && BLOCK_NUMBER_PATTERN.test(entry.block_number)
        ? entry.block_number
        : null,
    freshness: entry.freshness ?? null,
  }));
}

function hasAuthoritativeArcEvidence(evidence: readonly EvidenceView[]): boolean {
  return evidence.some(
    (entry) => entry.source === 'ARC' && entry.authority_class === 'AUTHORITATIVE',
  );
}

/**
 * Projects one frozen `IntentResponse` into the display model.
 *
 * Only known contract fields are copied, so an added provider field cannot
 * reach a component prop by accident. Malformed identity fields collapse to
 * `null` instead of rendering an unverified value as fact.
 */
export function toSettlementDetailsView(intent: IntentResponse): SettlementDetailsView {
  assertNoSensitiveFields(intent);

  const state = intent.state;
  const phase = PHASE_BY_STATE[state];
  const amountAtomic = intent.amount_atomic;
  const capAtomic =
    typeof intent.policy?.settlement_cap_atomic === 'string' &&
    isAtomicAmount(intent.policy.settlement_cap_atomic)
      ? intent.policy.settlement_cap_atomic
      : null;
  const allowedRecipients = (intent.policy?.allowed_recipients ?? []).filter((entry) =>
    EVM_ADDRESS_PATTERN.test(entry),
  );
  const capComparison = capAtomic === null ? null : compareAtomic(amountAtomic, capAtomic);

  const latestAttempt = intent.attempts.at(-1) ?? null;
  const authorizationStatus: AuthorizationDisplayStatus =
    latestAttempt?.authorization_status ?? 'NOT_REPORTED';

  const settlement = intent.settlement ?? null;
  const settlementIsWellFormed =
    settlement !== null &&
    TRANSACTION_HASH_PATTERN.test(settlement.transaction_hash) &&
    BLOCK_NUMBER_PATTERN.test(settlement.block_number) &&
    Number.isInteger(settlement.transfer_log_index) &&
    settlement.transfer_log_index >= 0;

  const verified =
    settlement !== null &&
    settlementIsWellFormed &&
    state === 'COMMITTED' &&
    hasAuthoritativeArcEvidence(intent.evidence);

  const verification: VerificationState =
    settlement === null ? 'NONE' : verified ? 'VERIFIED' : 'UNVERIFIED';

  const transaction: VerifiedTransactionDisplay | null =
    settlement !== null && verified
      ? {
          providerReferenceId: settlement.provider_reference_id,
          transactionHash: settlement.transaction_hash,
          blockNumber: settlement.block_number,
          transferLogIndex: settlement.transfer_log_index,
          tokenContract:
            typeof settlement.token_contract === 'string' &&
            EVM_ADDRESS_PATTERN.test(settlement.token_contract)
              ? settlement.token_contract
              : null,
          recipient: intent.recipient,
          amountAtomic,
          amountDisplay: formatAtomicUsdc(amountAtomic),
          explorer: validateExplorerUrl(settlement.explorer_url, settlement.transaction_hash),
        }
      : null;

  return {
    contractVersion: SETTLEMENT_UI_CONTRACT_VERSION,
    businessIntentId: intent.business_intent_id,
    purpose: sanitizeText(intent.purpose),
    state,
    phase,
    terminal: TERMINAL_PHASES.has(phase),
    policy: {
      policyId: sanitizeText(intent.policy?.policy_id),
      status: intent.policy?.status ?? 'NOT_REPORTED',
      network: intent.network,
      asset: intent.asset,
      recipient: intent.recipient,
      allowedRecipients,
      recipientAllowlisted:
        allowedRecipients.length === 0
          ? null
          : allowedRecipients.some(
              (entry) => entry.toLowerCase() === intent.recipient.toLowerCase(),
            ),
      settlementCapAtomic: capAtomic,
      settlementCapDisplay: capAtomic === null ? null : formatAtomicUsdc(capAtomic),
      amountAtomic,
      amountDisplay: formatAtomicUsdc(amountAtomic),
      amountWithinCap: capComparison === null ? null : capComparison <= 0,
    },
    authorization: {
      status: authorizationStatus,
      attemptId: latestAttempt?.attempt_id ?? null,
      occurredAt: latestAttempt?.created_at ?? null,
      sanitizedReason: sanitizeText(latestAttempt?.sanitized_error),
      terminal: TERMINAL_AUTHORIZATION.has(authorizationStatus),
    },
    verification,
    transaction,
    evidence: projectEvidence(intent.evidence),
    evidenceAvailable: intent.evidence.length > 0,
  };
}
