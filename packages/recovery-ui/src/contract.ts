export const RECOVERY_TIMELINE_VERSION = 'recovery-timeline-v1' as const;

export type RecoveryState = 'SUBMITTING' | 'UNKNOWN' | 'COMMITTED' | 'FAILED_SAFE';
export type RecoveryAction = 'WAIT' | 'RECONCILE' | 'ESCALATE' | 'RETURN_EXISTING_RESULT';
export type CoreDisposition =
  'HOLD_UNKNOWN' | 'READ_ONLY_LOOKUP' | 'ESCALATE_UNKNOWN' | 'MARK_COMMITTED' | 'MARK_FAILED_SAFE';
export type EvidenceSource = 'ONESHOT' | 'PRIVY' | 'ARC' | 'THE_GRAPH' | 'LLM';
export type AuthorityClass =
  | 'AUTHORITATIVE_ONESHOT'
  | 'AUTHORITATIVE_CHAIN_EVIDENCE'
  | 'PROVIDER_OBSERVATION'
  | 'NON_AUTHORITATIVE_CANDIDATE_DISCOVERY'
  | 'ADVISORY_AGENT_OBSERVATION';
export type IndexHealth = 'FRESH' | 'LAGGING' | 'UNHEALTHY' | 'UNAVAILABLE' | 'UNKNOWN_FRESHNESS';
export type TimelineKind = 'ATTEMPT' | 'TRANSITION' | 'EVIDENCE' | 'RECONCILIATION' | 'DECISION';

export interface AttemptSummary {
  readonly attemptId: string;
  readonly stage: string;
  readonly createdAt: string;
  readonly completedAt: string | null;
  readonly sanitizedError: string | null;
}

export interface TimelineEntry {
  readonly eventId: string;
  readonly kind: TimelineKind;
  readonly timestamp: string;
  readonly sequence: string | null;
  readonly title: string;
  readonly summary: string;
  readonly source: EvidenceSource;
  readonly authorityClass: AuthorityClass;
  readonly evidenceReferences: readonly string[];
}

export interface EvidenceSummary {
  readonly evidenceId: string;
  readonly source: EvidenceSource;
  readonly authorityClass: AuthorityClass;
  readonly retrievedAt: string;
  readonly finality: 'FINAL' | 'PENDING' | 'UNKNOWN' | null;
  readonly blockNumber: string | null;
  readonly digest: string;
  readonly summary: string;
  readonly verifiedBinding: boolean;
  readonly contradictionCodes: readonly string[];
}

export interface IndexedCandidateSummary {
  readonly candidateId: string;
  readonly transactionHash: string;
  readonly blockNumber: string;
  readonly bindingStatus: 'MATCH' | 'CONTRADICTORY';
  readonly contradictionCodes: readonly string[];
}

export interface GraphObservationSummary {
  readonly retrievalPath: 'STUDIO_GRAPHQL' | 'SUBGRAPH_MCP' | 'UNKNOWN';
  readonly endpointUrl: string;
  readonly serverName: string | null;
  readonly serverVersion: string | null;
  readonly toolName: string | null;
  readonly deploymentId: string;
  readonly manifestCid: string;
  readonly observedThroughBlock: string | null;
  readonly observedThroughTime: string | null;
  readonly chainHeadBlock: string | null;
  readonly lagBlocks: string | null;
  readonly health: IndexHealth;
  readonly available: boolean;
  readonly candidateCount: number;
  readonly diagnostics: readonly string[];
  readonly candidates: readonly IndexedCandidateSummary[];
}

export interface RecommendationSummary {
  readonly accepted: boolean;
  readonly action: RecoveryAction;
  readonly reason: string;
  readonly modelName: string;
  readonly promptVersion: string;
  readonly evidenceReferences: readonly string[];
}

export interface CoreDispositionSummary {
  readonly commandType: CoreDisposition;
  readonly targetState: 'UNKNOWN' | 'COMMITTED' | 'FAILED_SAFE';
  readonly reason: string;
  readonly authoritativeProofPresent: boolean;
  readonly evidenceReferences: readonly string[];
}

export interface RecoveryTimelinePage {
  readonly schemaVersion: typeof RECOVERY_TIMELINE_VERSION;
  readonly businessIntentId: string;
  readonly authoritativeState: RecoveryState;
  readonly stateVersion: string;
  readonly settlementPermission: 'NEVER';
  readonly evaluatedAt: string;
  readonly summary: string;
  readonly attempts: readonly AttemptSummary[];
  readonly timeline: readonly TimelineEntry[];
  readonly evidence: readonly EvidenceSummary[];
  readonly graph: GraphObservationSummary | null;
  readonly recommendation: RecommendationSummary;
  readonly coreDisposition: CoreDispositionSummary;
  readonly contradiction: boolean;
  readonly contradictionCodes: readonly string[];
  readonly diagnostics: readonly string[];
  readonly page: {
    readonly cursor: string | null;
    readonly nextCursor: string | null;
    readonly totalEntries: number;
  };
}

export interface RecoveryActionReceipt {
  readonly schemaVersion: 'recovery-action-receipt-v1';
  readonly businessIntentId: string;
  readonly action: 'REFRESH_STATUS' | 'ESCALATE';
  readonly accepted: true;
  readonly message: string;
}

const FORBIDDEN_KEYS = new Set([
  'accesstoken',
  'apikey',
  'authorization',
  'credential',
  'credentials',
  'headers',
  'privatekey',
  'providerbody',
  'rawbody',
  'rawproviderbody',
  'requestbody',
  'responsebody',
  'secret',
  'seedphrase',
]);

const SECRET_TEXT =
  /(?:bearer\s+[a-z0-9._~-]+|(?:api[_-]?key|access[_-]?token|private[_-]?key|seed[_-]?phrase)\s*[:=]\s*[^\s,;]+)/iu;

function normalizedKey(key: string): string {
  return key.replace(/[^a-z0-9]/giu, '').toLowerCase();
}

function assertSanitized(value: unknown, path = '$', seen = new Set<object>()): void {
  if (typeof value === 'string') {
    if (value.length > 1_000 || SECRET_TEXT.test(value)) {
      throw new Error(`Unsafe recovery UI text at ${path}`);
    }
    return;
  }
  if (value === null || typeof value !== 'object') return;
  if (seen.has(value)) return;
  seen.add(value);
  if (Array.isArray(value)) {
    value.forEach((item, index) => assertSanitized(item, `${path}[${index}]`, seen));
    return;
  }
  Object.entries(value as Record<string, unknown>).forEach(([key, child]) => {
    if (FORBIDDEN_KEYS.has(normalizedKey(key))) {
      throw new Error(`Forbidden recovery UI field at ${path}.${key}`);
    }
    assertSanitized(child, `${path}.${key}`, seen);
  });
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function requireRecord(value: unknown, path: string): Record<string, unknown> {
  if (!isRecord(value)) throw new Error(`Expected object at ${path}`);
  return value;
}

function requireString(value: unknown, path: string): string {
  if (typeof value !== 'string' || value.length === 0)
    throw new Error(`Expected string at ${path}`);
  return value;
}

function requireNullableString(value: unknown, path: string): string | null {
  return value === null ? null : requireString(value, path);
}

function requireBoolean(value: unknown, path: string): boolean {
  if (typeof value !== 'boolean') throw new Error(`Expected boolean at ${path}`);
  return value;
}

function requireNumber(value: unknown, path: string): number {
  if (typeof value !== 'number' || !Number.isSafeInteger(value) || value < 0) {
    throw new Error(`Expected non-negative integer at ${path}`);
  }
  return value;
}

function requireDate(value: unknown, path: string): string {
  const date = requireString(value, path);
  if (!Number.isFinite(Date.parse(date))) throw new Error(`Expected date-time at ${path}`);
  return date;
}

function requireEnum<T extends string>(value: unknown, allowed: readonly T[], path: string): T {
  if (typeof value !== 'string' || !allowed.includes(value as T)) {
    throw new Error(`Unexpected value at ${path}`);
  }
  return value as T;
}

function requireStringArray(value: unknown, path: string): readonly string[] {
  if (!Array.isArray(value)) throw new Error(`Expected array at ${path}`);
  return value.map((item, index) => requireString(item, `${path}[${index}]`));
}

const RECOVERY_STATES = ['SUBMITTING', 'UNKNOWN', 'COMMITTED', 'FAILED_SAFE'] as const;
const ACTIONS = ['WAIT', 'RECONCILE', 'ESCALATE', 'RETURN_EXISTING_RESULT'] as const;
const DISPOSITIONS = [
  'HOLD_UNKNOWN',
  'READ_ONLY_LOOKUP',
  'ESCALATE_UNKNOWN',
  'MARK_COMMITTED',
  'MARK_FAILED_SAFE',
] as const;
const SOURCES = ['ONESHOT', 'PRIVY', 'ARC', 'THE_GRAPH', 'LLM'] as const;
const AUTHORITIES = [
  'AUTHORITATIVE_ONESHOT',
  'AUTHORITATIVE_CHAIN_EVIDENCE',
  'PROVIDER_OBSERVATION',
  'NON_AUTHORITATIVE_CANDIDATE_DISCOVERY',
  'ADVISORY_AGENT_OBSERVATION',
] as const;
const HEALTH = ['FRESH', 'LAGGING', 'UNHEALTHY', 'UNAVAILABLE', 'UNKNOWN_FRESHNESS'] as const;
const KINDS = ['ATTEMPT', 'TRANSITION', 'EVIDENCE', 'RECONCILIATION', 'DECISION'] as const;

function parseAttempt(value: unknown, path: string): AttemptSummary {
  const item = requireRecord(value, path);
  return {
    attemptId: requireString(item.attemptId, `${path}.attemptId`),
    stage: requireString(item.stage, `${path}.stage`),
    createdAt: requireDate(item.createdAt, `${path}.createdAt`),
    completedAt: requireNullableString(item.completedAt, `${path}.completedAt`),
    sanitizedError: requireNullableString(item.sanitizedError, `${path}.sanitizedError`),
  };
}

function parseTimeline(value: unknown, path: string): TimelineEntry {
  const item = requireRecord(value, path);
  return {
    eventId: requireString(item.eventId, `${path}.eventId`),
    kind: requireEnum(item.kind, KINDS, `${path}.kind`),
    timestamp: requireDate(item.timestamp, `${path}.timestamp`),
    sequence: requireNullableString(item.sequence, `${path}.sequence`),
    title: requireString(item.title, `${path}.title`),
    summary: requireString(item.summary, `${path}.summary`),
    source: requireEnum(item.source, SOURCES, `${path}.source`),
    authorityClass: requireEnum(item.authorityClass, AUTHORITIES, `${path}.authorityClass`),
    evidenceReferences: requireStringArray(item.evidenceReferences, `${path}.evidenceReferences`),
  };
}

function parseEvidence(value: unknown, path: string): EvidenceSummary {
  const item = requireRecord(value, path);
  return {
    evidenceId: requireString(item.evidenceId, `${path}.evidenceId`),
    source: requireEnum(item.source, SOURCES, `${path}.source`),
    authorityClass: requireEnum(item.authorityClass, AUTHORITIES, `${path}.authorityClass`),
    retrievedAt: requireDate(item.retrievedAt, `${path}.retrievedAt`),
    finality:
      item.finality === null
        ? null
        : requireEnum(item.finality, ['FINAL', 'PENDING', 'UNKNOWN'] as const, `${path}.finality`),
    blockNumber: requireNullableString(item.blockNumber, `${path}.blockNumber`),
    digest: requireString(item.digest, `${path}.digest`),
    summary: requireString(item.summary, `${path}.summary`),
    verifiedBinding: requireBoolean(item.verifiedBinding, `${path}.verifiedBinding`),
    contradictionCodes: requireStringArray(item.contradictionCodes, `${path}.contradictionCodes`),
  };
}

function parseCandidate(value: unknown, path: string): IndexedCandidateSummary {
  const item = requireRecord(value, path);
  return {
    candidateId: requireString(item.candidateId, `${path}.candidateId`),
    transactionHash: requireString(item.transactionHash, `${path}.transactionHash`),
    blockNumber: requireString(item.blockNumber, `${path}.blockNumber`),
    bindingStatus: requireEnum(
      item.bindingStatus,
      ['MATCH', 'CONTRADICTORY'],
      `${path}.bindingStatus`,
    ),
    contradictionCodes: requireStringArray(item.contradictionCodes, `${path}.contradictionCodes`),
  };
}

function parseGraph(value: unknown, path: string): GraphObservationSummary | null {
  if (value === null) return null;
  const item = requireRecord(value, path);
  if (!Array.isArray(item.candidates) || !Array.isArray(item.diagnostics)) {
    throw new Error(`Expected Graph arrays at ${path}`);
  }
  return {
    retrievalPath: requireEnum(
      item.retrievalPath,
      ['STUDIO_GRAPHQL', 'SUBGRAPH_MCP', 'UNKNOWN'],
      `${path}.retrievalPath`,
    ),
    endpointUrl: requireString(item.endpointUrl, `${path}.endpointUrl`),
    serverName:
      item.serverName === undefined ? null : requireString(item.serverName, `${path}.serverName`),
    serverVersion:
      item.serverVersion === undefined
        ? null
        : requireString(item.serverVersion, `${path}.serverVersion`),
    toolName: item.toolName === undefined ? null : requireString(item.toolName, `${path}.toolName`),
    deploymentId: requireString(item.deploymentId, `${path}.deploymentId`),
    manifestCid: requireString(item.manifestCid, `${path}.manifestCid`),
    observedThroughBlock: requireNullableString(
      item.observedThroughBlock,
      `${path}.observedThroughBlock`,
    ),
    observedThroughTime: requireNullableString(
      item.observedThroughTime,
      `${path}.observedThroughTime`,
    ),
    chainHeadBlock: requireNullableString(item.chainHeadBlock, `${path}.chainHeadBlock`),
    lagBlocks: requireNullableString(item.lagBlocks, `${path}.lagBlocks`),
    health: requireEnum(item.health, HEALTH, `${path}.health`),
    available: requireBoolean(item.available, `${path}.available`),
    candidateCount: requireNumber(item.candidateCount, `${path}.candidateCount`),
    diagnostics: requireStringArray(item.diagnostics, `${path}.diagnostics`),
    candidates: item.candidates.map((candidate, index) =>
      parseCandidate(candidate, `${path}.candidates[${index}]`),
    ),
  };
}

export function parseRecoveryTimelinePage(value: unknown): RecoveryTimelinePage {
  assertSanitized(value);
  const input = requireRecord(value, '$');
  if (
    !Array.isArray(input.attempts) ||
    !Array.isArray(input.timeline) ||
    !Array.isArray(input.evidence)
  ) {
    throw new Error('Recovery timeline arrays are required');
  }
  const recommendation = requireRecord(input.recommendation, '$.recommendation');
  const core = requireRecord(input.coreDisposition, '$.coreDisposition');
  const page = requireRecord(input.page, '$.page');
  const parsed: RecoveryTimelinePage = {
    schemaVersion: requireEnum(input.schemaVersion, [RECOVERY_TIMELINE_VERSION], '$.schemaVersion'),
    businessIntentId: requireString(input.businessIntentId, '$.businessIntentId'),
    authoritativeState: requireEnum(
      input.authoritativeState,
      RECOVERY_STATES,
      '$.authoritativeState',
    ),
    stateVersion: requireString(input.stateVersion, '$.stateVersion'),
    settlementPermission: requireEnum(
      input.settlementPermission,
      ['NEVER'],
      '$.settlementPermission',
    ),
    evaluatedAt: requireDate(input.evaluatedAt, '$.evaluatedAt'),
    summary: requireString(input.summary, '$.summary'),
    attempts: input.attempts.map((attempt, index) => parseAttempt(attempt, `$.attempts[${index}]`)),
    timeline: input.timeline.map((event, index) => parseTimeline(event, `$.timeline[${index}]`)),
    evidence: input.evidence.map((item, index) => parseEvidence(item, `$.evidence[${index}]`)),
    graph: parseGraph(input.graph, '$.graph'),
    recommendation: {
      accepted: requireBoolean(recommendation.accepted, '$.recommendation.accepted'),
      action: requireEnum(recommendation.action, ACTIONS, '$.recommendation.action'),
      reason: requireString(recommendation.reason, '$.recommendation.reason'),
      modelName: requireString(recommendation.modelName, '$.recommendation.modelName'),
      promptVersion: requireString(recommendation.promptVersion, '$.recommendation.promptVersion'),
      evidenceReferences: requireStringArray(
        recommendation.evidenceReferences,
        '$.recommendation.evidenceReferences',
      ),
    },
    coreDisposition: {
      commandType: requireEnum(core.commandType, DISPOSITIONS, '$.coreDisposition.commandType'),
      targetState: requireEnum(
        core.targetState,
        ['UNKNOWN', 'COMMITTED', 'FAILED_SAFE'],
        '$.coreDisposition.targetState',
      ),
      reason: requireString(core.reason, '$.coreDisposition.reason'),
      authoritativeProofPresent: requireBoolean(
        core.authoritativeProofPresent,
        '$.coreDisposition.authoritativeProofPresent',
      ),
      evidenceReferences: requireStringArray(
        core.evidenceReferences,
        '$.coreDisposition.evidenceReferences',
      ),
    },
    contradiction: requireBoolean(input.contradiction, '$.contradiction'),
    contradictionCodes: requireStringArray(input.contradictionCodes, '$.contradictionCodes'),
    diagnostics: requireStringArray(input.diagnostics, '$.diagnostics'),
    page: {
      cursor: requireNullableString(page.cursor, '$.page.cursor'),
      nextCursor: requireNullableString(page.nextCursor, '$.page.nextCursor'),
      totalEntries: requireNumber(page.totalEntries, '$.page.totalEntries'),
    },
  };
  if (parsed.graph !== null && parsed.graph.candidateCount !== parsed.graph.candidates.length) {
    throw new Error('Graph candidate count mismatch');
  }
  return parsed;
}
