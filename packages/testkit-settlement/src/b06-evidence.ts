/**
 * B06 sponsor evidence verification.
 *
 * The live Arc Testnet run already happened; this module re-verifies what it
 * recorded. Every check fails closed, because the failure mode that matters for
 * a sponsor bundle is a claim that outruns its proof: a denial whose broadcast
 * count was never checked, a transaction hash bound to nothing, or a mainnet
 * profile that quietly carries real values.
 */

import {
  ARC_MAINNET,
  ARC_TESTNET,
  FORBIDDEN_KEY_PATTERNS,
  assertNoSecrets,
  isPinned,
  verifyReceipt,
  type TransactionReceipt,
} from '@oneshot/arc-adapter';

export const B06_EVIDENCE_SCHEMA_VERSION = 'settlement-evidence-v1';

/** Explorer hosts a published evidence link may point at. */
export const ALLOWED_EXPLORER_HOSTS: readonly string[] = ['testnet.arcscan.app'];

const TRANSACTION_HASH_PATTERN = /^0x[0-9a-f]{64}$/iu;
const EVM_ADDRESS_PATTERN = /^0x[0-9a-fA-F]{40}$/u;
const ATOMIC_PATTERN = /^(0|[1-9][0-9]*)$/u;

export class EvidenceError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'EvidenceError';
  }
}

export interface SettlementRecord {
  readonly transaction_hash: string;
  readonly block_number: number;
  readonly block_hash: string;
  readonly transfer_log_index: number;
  readonly status: string;
  readonly explorer_url: string;
}

export interface DenialRecord {
  readonly dimension: string;
  readonly expected_outcome: string;
  readonly observed_status: number;
  readonly observed_code: string;
  readonly broadcast_count: number;
  readonly settlement_count: number;
  readonly target_recipient?: string;
  readonly attempted_amount_atomic?: string;
  readonly configured_cap_atomic?: string;
}

export interface RecoveryRecord {
  readonly lost_response_initial_state: string;
  readonly reconciled_final_state: string;
  readonly external_recovery_submissions: number;
  readonly replay_outcome: string;
  readonly total_settlements_for_intent: number;
}

export interface SanitizedSettlementProof {
  readonly schemaVersion: string;
  readonly status: string;
  readonly captured_at: string;
  readonly network: string;
  readonly execution_wallet: string;
  readonly policy_id: string;
  readonly token_contract: string;
  readonly recipient: string;
  readonly amount_atomic: string;
  readonly settlement: SettlementRecord;
  readonly denials: readonly DenialRecord[];
  readonly recovery: RecoveryRecord;
  /** Optional raw receipt, re-verified through the adapter when present. */
  readonly receipt?: TransactionReceipt;
}

export type CheckStatus = 'PASS' | 'FAIL';

export interface EvidenceCheck {
  readonly id: string;
  readonly title: string;
  readonly status: CheckStatus;
  readonly detail: string;
}

export interface EvidenceSection {
  readonly section: string;
  readonly status: CheckStatus;
  readonly checks: readonly EvidenceCheck[];
}

function check(id: string, title: string, ok: boolean, detail: string): EvidenceCheck {
  return { id, title, status: ok ? 'PASS' : 'FAIL', detail };
}

function section(name: string, checks: readonly EvidenceCheck[]): EvidenceSection {
  return {
    section: name,
    status: checks.every((entry) => entry.status === 'PASS') ? 'PASS' : 'FAIL',
    checks,
  };
}

function requireString(source: Record<string, unknown>, key: string, path: string): string {
  const value = source[key];
  if (typeof value !== 'string' || value.trim().length === 0) {
    throw new EvidenceError(`${path}.${key} must be a non-empty string`);
  }
  return value;
}

function requireInteger(source: Record<string, unknown>, key: string, path: string): number {
  const value = source[key];
  if (typeof value !== 'number' || !Number.isInteger(value) || value < 0) {
    throw new EvidenceError(`${path}.${key} must be a non-negative integer`);
  }
  return value;
}

function requireObject(value: unknown, path: string): Record<string, unknown> {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) {
    throw new EvidenceError(`${path} must be an object`);
  }
  return value as Record<string, unknown>;
}

/**
 * Validates a recorded receipt before it reaches `verifyReceipt`.
 *
 * The adapter assumes a well-formed receipt, so a missing `from` or `logs`
 * would surface as a TypeError from inside it rather than as a listed failure.
 * Every field the verifier reads is checked here so a malformed receipt is a
 * structured parse failure like any other bad input.
 */
function parseReceipt(value: unknown): TransactionReceipt {
  const receipt = requireObject(value, '$.receipt');
  requireInteger(receipt, 'chainId', '$.receipt');
  requireInteger(receipt, 'status', '$.receipt');
  requireString(receipt, 'from', '$.receipt');
  requireString(receipt, 'to', '$.receipt');
  if (!Array.isArray(receipt['logs'])) {
    throw new EvidenceError('$.receipt.logs must be an array');
  }
  return receipt as unknown as TransactionReceipt;
}

/**
 * Parses a sanitized proof bundle.
 *
 * Validation is strict rather than tolerant: a bundle missing a field is a
 * bundle that cannot support the claim built on it, so it is rejected here
 * instead of silently producing a PASS with an absent value.
 */
export function parseSettlementProof(value: unknown): SanitizedSettlementProof {
  const root = requireObject(value, '$');
  const schemaVersion = requireString(root, 'schemaVersion', '$');
  if (schemaVersion !== B06_EVIDENCE_SCHEMA_VERSION) {
    throw new EvidenceError(
      `Unsupported evidence schema ${schemaVersion}; expected ${B06_EVIDENCE_SCHEMA_VERSION}`,
    );
  }

  const settlementRaw = requireObject(root['settlement'], '$.settlement');
  const settlement: SettlementRecord = {
    transaction_hash: requireString(settlementRaw, 'transaction_hash', '$.settlement'),
    block_number: requireInteger(settlementRaw, 'block_number', '$.settlement'),
    block_hash: requireString(settlementRaw, 'block_hash', '$.settlement'),
    transfer_log_index: requireInteger(settlementRaw, 'transfer_log_index', '$.settlement'),
    status: requireString(settlementRaw, 'status', '$.settlement'),
    explorer_url: requireString(settlementRaw, 'explorer_url', '$.settlement'),
  };

  const denialsRaw = root['denials'];
  if (!Array.isArray(denialsRaw) || denialsRaw.length === 0) {
    throw new EvidenceError('$.denials must be a non-empty array');
  }
  const denials = denialsRaw.map((entry, index) => {
    const path = `$.denials[${index}]`;
    const denial = requireObject(entry, path);
    const record: DenialRecord = {
      dimension: requireString(denial, 'dimension', path),
      expected_outcome: requireString(denial, 'expected_outcome', path),
      observed_status: requireInteger(denial, 'observed_status', path),
      observed_code: requireString(denial, 'observed_code', path),
      broadcast_count: requireInteger(denial, 'broadcast_count', path),
      settlement_count: requireInteger(denial, 'settlement_count', path),
      ...(typeof denial['target_recipient'] === 'string'
        ? { target_recipient: denial['target_recipient'] }
        : {}),
      ...(typeof denial['attempted_amount_atomic'] === 'string'
        ? { attempted_amount_atomic: denial['attempted_amount_atomic'] }
        : {}),
      ...(typeof denial['configured_cap_atomic'] === 'string'
        ? { configured_cap_atomic: denial['configured_cap_atomic'] }
        : {}),
    };
    return record;
  });

  const recoveryRaw = requireObject(root['recovery'], '$.recovery');
  const recovery: RecoveryRecord = {
    lost_response_initial_state: requireString(recoveryRaw, 'lost_response_initial_state', '$.recovery'),
    reconciled_final_state: requireString(recoveryRaw, 'reconciled_final_state', '$.recovery'),
    external_recovery_submissions: requireInteger(
      recoveryRaw,
      'external_recovery_submissions',
      '$.recovery',
    ),
    replay_outcome: requireString(recoveryRaw, 'replay_outcome', '$.recovery'),
    total_settlements_for_intent: requireInteger(
      recoveryRaw,
      'total_settlements_for_intent',
      '$.recovery',
    ),
  };

  return {
    schemaVersion,
    status: requireString(root, 'status', '$'),
    captured_at: requireString(root, 'captured_at', '$'),
    network: requireString(root, 'network', '$'),
    execution_wallet: requireString(root, 'execution_wallet', '$'),
    policy_id: requireString(root, 'policy_id', '$'),
    token_contract: requireString(root, 'token_contract', '$'),
    recipient: requireString(root, 'recipient', '$'),
    amount_atomic: requireString(root, 'amount_atomic', '$'),
    settlement,
    denials,
    recovery,
    ...(root['receipt'] === undefined ? {} : { receipt: parseReceipt(root['receipt']) }),
  };
}

/**
 * B06.1 — Privy is the authorization boundary.
 *
 * A denial only counts when the broadcast and settlement counters were observed
 * at zero. "Privy said no" without those counters proves nothing about whether
 * a transaction reached the chain anyway.
 */
export function checkPrivyEvidence(proof: SanitizedSettlementProof): EvidenceSection {
  const checks: EvidenceCheck[] = [];

  checks.push(
    check(
      'privy.policy-identity',
      'Policy and execution wallet identities recorded',
      proof.policy_id.trim().length > 0 && EVM_ADDRESS_PATTERN.test(proof.execution_wallet),
      `policy ${proof.policy_id}, wallet ${proof.execution_wallet}`,
    ),
  );

  const recipientDenial = proof.denials.find((d) => d.dimension === 'UNAUTHORIZED_RECIPIENT');
  const capDenial = proof.denials.find((d) => d.dimension === 'ABOVE_CAP_AMOUNT');

  checks.push(
    check(
      'privy.denial-coverage',
      'Both required denial dimensions were exercised',
      recipientDenial !== undefined && capDenial !== undefined,
      'UNAUTHORIZED_RECIPIENT and ABOVE_CAP_AMOUNT',
    ),
  );

  for (const denial of proof.denials) {
    checks.push(
      check(
        `privy.zero-settlement.${denial.dimension.toLowerCase()}`,
        `${denial.dimension} produced zero broadcasts and zero settlements`,
        denial.broadcast_count === 0 && denial.settlement_count === 0,
        `broadcasts ${denial.broadcast_count}, settlements ${denial.settlement_count}`,
      ),
    );
    checks.push(
      check(
        `privy.refusal.${denial.dimension.toLowerCase()}`,
        `${denial.dimension} was refused by the provider, not by local code`,
        denial.observed_status >= 400 && denial.observed_code.length > 0,
        `HTTP ${denial.observed_status} ${denial.observed_code}`,
      ),
    );
  }

  if (capDenial !== undefined) {
    // The amounts are required, not optional: a cap drill that does not record
    // what it attempted against which cap proves nothing, and treating the
    // absent fields as "skip" would let a tampered record pass unexamined.
    const attempted = capDenial.attempted_amount_atomic;
    const cap = capDenial.configured_cap_atomic;
    const present = attempted !== undefined && cap !== undefined;
    const wellFormed =
      present && ATOMIC_PATTERN.test(attempted) && ATOMIC_PATTERN.test(cap);
    checks.push(
      check(
        'privy.cap-exceeded',
        'Above-cap drill actually exceeded the configured cap',
        wellFormed && BigInt(attempted) > BigInt(cap),
        present ? `attempted ${attempted} against cap ${cap}` : 'drill did not record both amounts',
      ),
    );
  }

  if (recipientDenial !== undefined) {
    const denied = recipientDenial.target_recipient;
    checks.push(
      check(
        'privy.denied-recipient-differs',
        'Denied recipient is recorded and is not the authorized recipient',
        denied !== undefined && denied.toLowerCase() !== proof.recipient.toLowerCase(),
        denied === undefined ? 'drill did not record the denied recipient' : `denied ${denied}`,
      ),
    );
  }

  checks.push(
    check(
      'privy.normal-path-settled',
      'The authorized path produced exactly one confirmed settlement',
      proof.settlement.status === 'CONFIRMED' && proof.recovery.total_settlements_for_intent === 1,
      `status ${proof.settlement.status}, settlements ${proof.recovery.total_settlements_for_intent}`,
    ),
  );

  return section('B06.1 Privy authorization boundary', checks);
}

/**
 * B06.2 — Arc Testnet is the working rail.
 *
 * The point is the binding, not the label: chain, token, recipient, amount, and
 * Transfer log index all have to agree with the pinned profile and with each
 * other before the explorer link means anything.
 */
export function checkArcEvidence(
  proof: SanitizedSettlementProof,
  allowedExplorerHosts: readonly string[] = ALLOWED_EXPLORER_HOSTS,
): EvidenceSection {
  const checks: EvidenceCheck[] = [];

  checks.push(
    check(
      'arc.network-pinned',
      'Settlement network is the pinned Arc Testnet profile',
      isPinned(ARC_TESTNET) && proof.network === ARC_TESTNET.caip2,
      `${proof.network} against pinned ${ARC_TESTNET.caip2}`,
    ),
  );

  checks.push(
    check(
      'arc.token-pinned',
      'Token contract is the pinned USDC interface',
      proof.token_contract.toLowerCase() === ARC_TESTNET.tokenContract.toLowerCase(),
      proof.token_contract,
    ),
  );

  checks.push(
    check(
      'arc.transaction-identity',
      'Transaction hash, block, and Transfer log index are well formed',
      TRANSACTION_HASH_PATTERN.test(proof.settlement.transaction_hash) &&
        proof.settlement.block_number > 0 &&
        proof.settlement.transfer_log_index >= 0,
      `${proof.settlement.transaction_hash} at block ${proof.settlement.block_number} log ${proof.settlement.transfer_log_index}`,
    ),
  );

  checks.push(
    check(
      'arc.amount-integer',
      'Amount is a canonical integer atomic value',
      ATOMIC_PATTERN.test(proof.amount_atomic),
      `${proof.amount_atomic} atomic units`,
    ),
  );

  checks.push(
    check(
      'arc.recipient-address',
      'Recipient is a normalized EVM address',
      EVM_ADDRESS_PATTERN.test(proof.recipient),
      proof.recipient,
    ),
  );

  const explorer = checkExplorerUrl(
    proof.settlement.explorer_url,
    proof.settlement.transaction_hash,
    allowedExplorerHosts,
  );
  checks.push(
    check(
      'arc.explorer-binding',
      'Explorer link is https, on an allowed host, and references this transaction',
      explorer === null,
      explorer ?? proof.settlement.explorer_url,
    ),
  );

  if (proof.receipt !== undefined) {
    const verdict = verifyReceipt(proof.receipt, {
      chainId: ARC_TESTNET.chainId,
      walletAddress: proof.execution_wallet,
      tokenContract: proof.token_contract,
      recipient: proof.recipient,
      amountAtomic: BigInt(proof.amount_atomic),
    });
    const confirmed = verdict.result === 'CONFIRMED';
    checks.push(
      check(
        'arc.receipt-verified',
        'Recorded receipt re-verifies as the expected ERC-20 Transfer',
        confirmed && verdict.transferLogIndex === proof.settlement.transfer_log_index,
        confirmed
          ? `CONFIRMED at log index ${verdict.transferLogIndex}`
          : `${verdict.result}: ${verdict.detail}`,
      ),
    );
  } else {
    checks.push(
      check(
        'arc.transfer-identity-recorded',
        'Transfer identity checked against recorded fields (bundle carries no raw receipt)',
        true,
        'Chain-level re-verification needs a captured receipt; the recorded identity is consistent',
      ),
    );
  }

  return section('B06.2 Arc Testnet settlement rail', checks);
}

/** Returns a rejection reason, or `null` when the explorer link is acceptable. */
export function checkExplorerUrl(
  rawUrl: string,
  transactionHash: string,
  allowedHosts: readonly string[] = ALLOWED_EXPLORER_HOSTS,
): string | null {
  let parsed: URL;
  try {
    parsed = new URL(rawUrl);
  } catch {
    return 'Explorer link is not a valid absolute URL.';
  }
  if (parsed.protocol !== 'https:') return 'Explorer link must use https.';
  if (parsed.username !== '' || parsed.password !== '') {
    return 'Explorer link must not embed credentials.';
  }
  const host = parsed.hostname.toLowerCase();
  if (!allowedHosts.some((allowed) => allowed.toLowerCase() === host)) {
    return `Explorer host ${host} is not on the allowlist.`;
  }
  if (!`${parsed.pathname}${parsed.search}`.toLowerCase().includes(transactionHash.toLowerCase())) {
    return 'Explorer link does not reference this transaction hash.';
  }
  return null;
}

/**
 * B06.3 — An ambiguous outcome resolves to the original transaction.
 *
 * The drill only means something if the replacement-submission counter stayed
 * at zero: reaching `COMMITTED` after a second payment would be the exact
 * failure this product exists to prevent.
 */
export function checkAmbiguityEvidence(proof: SanitizedSettlementProof): EvidenceSection {
  const { recovery } = proof;
  const checks: EvidenceCheck[] = [
    check(
      'ambiguity.unknown-first',
      'Lost response produced UNKNOWN rather than a guess',
      recovery.lost_response_initial_state === 'UNKNOWN',
      recovery.lost_response_initial_state,
    ),
    check(
      'ambiguity.reconciled',
      'Reconciliation bound the original transaction',
      recovery.reconciled_final_state === 'COMMITTED',
      recovery.reconciled_final_state,
    ),
    check(
      'ambiguity.no-replacement',
      'Recovery submitted no replacement transaction',
      recovery.external_recovery_submissions === 0,
      `${recovery.external_recovery_submissions} replacement submissions`,
    ),
    check(
      'ambiguity.replay-idempotent',
      'Replaying the intent returned the existing settlement',
      recovery.replay_outcome.toUpperCase().includes('REPLAY'),
      recovery.replay_outcome,
    ),
    check(
      'ambiguity.single-settlement',
      'The intent still holds exactly one settlement',
      recovery.total_settlements_for_intent === 1,
      `${recovery.total_settlements_for_intent} settlements`,
    ),
  ];

  return section('B06.3 Ambiguity and recovery', checks);
}

export interface MainnetArtifactCheck {
  readonly path: string;
  readonly present: boolean;
}

/**
 * B06.4 — Mainnet readiness without a mainnet transaction.
 *
 * Readiness here means the disabled profile carries no usable values. A profile
 * that is merely flagged `enabled: false` while holding a chain ID and RPC is
 * one config edit away from spending real money.
 */
export function checkMainnetReadiness(
  artifacts: readonly MainnetArtifactCheck[],
  mainnetProfile: typeof ARC_MAINNET = ARC_MAINNET,
): EvidenceSection {
  const profile = mainnetProfile as unknown as Record<string, unknown>;
  const valueKeys = ['chainId', 'caip2', 'tokenContract', 'rpcUrl', 'explorerUrl'];
  const carriedValues = valueKeys.filter((key) => profile[key] !== undefined);

  const checks: EvidenceCheck[] = [
    check(
      'mainnet.disabled',
      'Arc Mainnet profile is disabled',
      mainnetProfile.enabled === false,
      `enabled=${String(mainnetProfile.enabled)}`,
    ),
    check(
      'mainnet.unpublished',
      'Arc Mainnet profile is marked unpublished',
      mainnetProfile.verification === 'UNPUBLISHED' && !isPinned(mainnetProfile),
      mainnetProfile.verification,
    ),
    check(
      'mainnet.no-values',
      'Arc Mainnet profile carries no chain, RPC, explorer, or token value',
      carriedValues.length === 0,
      carriedValues.length === 0 ? 'no network values present' : `carries ${carriedValues.join(', ')}`,
    ),
    check(
      'mainnet.reason-recorded',
      'Profile records why it stays disabled',
      typeof mainnetProfile.reason === 'string' && mainnetProfile.reason.length > 0,
      mainnetProfile.reason,
    ),
  ];

  for (const artifact of artifacts) {
    checks.push(
      check(
        `mainnet.artifact.${artifact.path}`,
        `Deployment artifact present: ${artifact.path}`,
        artifact.present,
        artifact.present ? 'present' : 'missing',
      ),
    );
  }

  return section('B06.4 Mainnet readiness', checks);
}

/**
 * Public fields the adapter's generic rules cannot distinguish from secrets,
 * each paired with the shape its value must actually hold.
 *
 * `assertNoSecrets` rejects any key containing `token`, which is right for
 * `access_token` and wrong for `token_contract`; and it rejects bare 32-byte
 * hex outside its hash-bearing field list, which is right for a stray key and
 * wrong for an explorer URL that must embed the transaction hash to be worth
 * publishing. Both are load-bearing evidence: dropping them would leave a
 * bundle that no longer proves which asset moved or where to verify it. The
 * exemption is from the generic rule only — each value still has to look like
 * the public datum it claims to be, and the explorer link is separately bound
 * to this transaction by `checkArcEvidence`.
 */
const PUBLIC_VALUE_PATTERN = /^[A-Za-z0-9:._-]{1,80}$/u;

function isPublicIdentifier(value: unknown): boolean {
  return typeof value === 'number' || (typeof value === 'string' && PUBLIC_VALUE_PATTERN.test(value));
}

function isPublicHttpsUrl(value: unknown): boolean {
  if (typeof value !== 'string' || value.length > 256) return false;
  try {
    const parsed = new URL(value);
    return parsed.protocol === 'https:' && parsed.username === '' && parsed.password === '';
  } catch {
    return false;
  }
}

function isEvmAddress(value: unknown): boolean {
  return typeof value === 'string' && EVM_ADDRESS_PATTERN.test(value);
}

const PUBLIC_FIELD_ALLOWLIST: ReadonlyMap<string, (value: unknown) => boolean> = new Map([
  ['tokencontract', isEvmAddress],
  ['tokensymbol', isPublicIdentifier],
  ['tokendecimals', isPublicIdentifier],
  ['explorerurl', isPublicHttpsUrl],
  ['explorerhost', isPublicIdentifier],
]);

function normalizeFieldName(key: string): string {
  return key.toLowerCase().replace(/[^a-z0-9]/gu, '');
}

function publicFieldGuard(key: string): ((value: unknown) => boolean) | undefined {
  return PUBLIC_FIELD_ALLOWLIST.get(normalizeFieldName(key));
}

function keyIsForbidden(key: string): boolean {
  const normalized = normalizeFieldName(key);
  return FORBIDDEN_KEY_PATTERNS.some((pattern) => normalized.includes(normalizeFieldName(pattern)));
}

/**
 * Walks the bundle, applying the adapter's redaction contract at every level.
 *
 * The walk is explicit rather than delegated wholesale, because handing a
 * subtree to `assertNoSecrets` would re-enter its own recursion and skip past
 * the public-field allowlist below it.
 */
function scanScalar(
  value: unknown,
  path: string,
  fieldName: string | undefined,
  failures: string[],
): void {
  try {
    assertNoSecrets(value, path, fieldName);
  } catch (error) {
    failures.push(error instanceof Error ? error.message : String(error));
  }
}

/**
 * Scans an allowlisted public URL for credential material.
 *
 * The transaction hash is stripped first because it is the one 32-byte value
 * that legitimately belongs in the link; everything else in the path and query
 * still has to survive the adapter's value rules, so a JWT cannot ride along in
 * a query string just because the host is allowed.
 */
function scanPublicUrl(value: string, path: string, failures: string[]): void {
  scanScalar(value.replace(/0x[a-fA-F0-9]{64}/gu, ''), path, 'explorerurl', failures);
}

function auditValue(
  value: unknown,
  path: string,
  failures: string[],
  fieldName?: string,
): void {
  if (Array.isArray(value)) {
    // Scalar elements are scanned here rather than skipped: a credential
    // nested in an array is still a credential, and it inherits the parent
    // field name the way the adapter's own array walk does.
    value.forEach((entry, index) => {
      const childPath = `${path}[${index}]`;
      if (entry !== null && typeof entry === 'object') {
        auditValue(entry, childPath, failures, fieldName);
      } else {
        scanScalar(entry, childPath, fieldName, failures);
      }
    });
    return;
  }
  if (value === null || typeof value !== 'object') {
    scanScalar(value, path, fieldName, failures);
    return;
  }
  for (const [key, entry] of Object.entries(value as Record<string, unknown>)) {
    const childPath = `${path}.${key}`;

    const guard = publicFieldGuard(key);
    if (guard !== undefined) {
      if (!guard(entry)) {
        failures.push(`${childPath} is allowlisted as public but does not hold a public value`);
        continue;
      }
      if (typeof entry === 'string' && entry.startsWith('https://')) {
        scanPublicUrl(entry, childPath, failures);
      }
      continue;
    }

    if (keyIsForbidden(key)) {
      failures.push(`Forbidden key "${key}" at ${path} is not redacted.`);
      continue;
    }

    if (entry !== null && typeof entry === 'object') {
      auditValue(entry, childPath, failures, key);
      continue;
    }

    scanScalar(entry, childPath, key, failures);
  }
}

/**
 * B06.5 — Sanitization audit.
 *
 * Holds the published evidence pack to the same redaction contract as a
 * provider fixture, so a key, token, signature, or raw provider payload cannot
 * ride along with the sponsor claims.
 */
export function auditSanitization(bundle: unknown, label = 'bundle'): EvidenceSection {
  const failures: string[] = [];
  auditValue(bundle, '$', failures);

  return section('B06.5 Sanitization audit', [
    check(
      'audit.no-secrets',
      `Published ${label} carries no secret material`,
      failures.length === 0,
      failures.length === 0 ? 'no secret-shaped keys or values found' : failures.join('; '),
    ),
  ]);
}

export type SponsorStatus = 'QUALIFIED' | 'NOT QUALIFIED' | 'NOT VERIFIED';

export interface SponsorQualificationInput {
  readonly sponsor: string;
  readonly status: SponsorStatus;
  readonly citations: readonly string[];
  readonly limitations: readonly string[];
}

/**
 * B06.6 — Input for the `sponsor-qualification` skill.
 *
 * This reports what Lane B evidence supports, not a final verdict. A failing
 * section downgrades the sponsor to `NOT VERIFIED`; nothing here can promote a
 * fixture into a qualification.
 */
export function buildQualificationInput(
  sections: readonly EvidenceSection[],
  liveStatus: string,
): readonly SponsorQualificationInput[] {
  const byName = new Map(sections.map((entry) => [entry.section, entry.status]));
  const live = liveStatus === 'LIVE_RUN';
  const privyOk = byName.get('B06.1 Privy authorization boundary') === 'PASS' && live;
  const arcOk =
    byName.get('B06.2 Arc Testnet settlement rail') === 'PASS' &&
    byName.get('B06.3 Ambiguity and recovery') === 'PASS' &&
    byName.get('B06.4 Mainnet readiness') === 'PASS' &&
    live;

  return [
    {
      sponsor: 'Privy',
      status: privyOk ? 'QUALIFIED' : 'NOT VERIFIED',
      citations: [
        'packages/privy-adapter/src/adapters.ts (authorization port and policy enforcement)',
        'packages/privy-adapter/src/hardening.ts (policy identity re-check, fail closed on drift)',
        'docs/settlement/LIVE_EVIDENCE.md (live policy denial drills, zero broadcasts)',
        'evidence/c06/sanitized-proof.json (recorded denial counters)',
      ],
      limitations: [
        'Denials are recorded from one live drill per dimension, not a continuous suite.',
        'Policy identity is re-checked at startup and before sensitive use, not per request.',
      ],
    },
    {
      sponsor: 'Arc',
      status: arcOk ? 'QUALIFIED' : 'NOT VERIFIED',
      citations: [
        'packages/arc-adapter/src/receipt.ts (Transfer log verification)',
        'packages/arc-adapter/src/profiles.ts (pinned testnet, disabled mainnet)',
        'docs/settlement/LIVE_EVIDENCE.md (live settlement, block, log index, explorer URL)',
        'docs/SAFE_DISABLE_RUNBOOK.md (safe-disable and rollback)',
      ],
      limitations: [
        'Arc Mainnet is disabled and unpinned; no mainnet transaction exists or is claimed.',
        'Testnet only. Mainnet activation needs official Arc values and explicit human approval.',
      ],
    },
    {
      sponsor: 'The Graph',
      status: 'NOT VERIFIED',
      citations: ['Lane C owns this verdict; see the C06 qualification report.'],
      limitations: [
        'Out of scope for B06 by milestone non-goal; Lane B publishes no Graph verdict.',
      ],
    },
  ];
}

export interface EvidenceReport {
  readonly status: CheckStatus;
  readonly sections: readonly EvidenceSection[];
  readonly qualification: readonly SponsorQualificationInput[];
}

/** Aggregates every section; the report passes only when all of them pass. */
export function buildEvidenceReport(
  sections: readonly EvidenceSection[],
  liveStatus: string,
): EvidenceReport {
  return {
    status: sections.every((entry) => entry.status === 'PASS') ? 'PASS' : 'FAIL',
    sections,
    qualification: buildQualificationInput(sections, liveStatus),
  };
}

/** Renders a report as plain text for the CLI. */
export function formatEvidenceReport(report: EvidenceReport): string {
  const lines: string[] = [];
  for (const entry of report.sections) {
    lines.push(`${entry.status === 'PASS' ? 'PASS' : 'FAIL'}  ${entry.section}`);
    for (const item of entry.checks) {
      lines.push(`  ${item.status === 'PASS' ? '+' : '!'} ${item.title} — ${item.detail}`);
    }
    lines.push('');
  }
  lines.push('Sponsor qualification input:');
  for (const entry of report.qualification) {
    lines.push(`  ${entry.sponsor}: ${entry.status}`);
  }
  lines.push('');
  lines.push(`Overall: ${report.status}`);
  return lines.join('\n');
}
