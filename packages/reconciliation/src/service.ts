import { buildRecoveryAgentInput, validateAndNormalizeRecommendation } from './agent-contract.js';
import { buildBoundEvidenceRecords } from './evidence-model.js';
import { sha256 } from './query.js';
import { evaluateReconciliation } from './safety-core.js';
import {
  INDEX_VIEW_VERSION,
  RECOVERY_EVIDENCE_VERSION,
  type BoundEvidenceRecord,
  type DetailedRecoveryView,
  type EvidenceAuthorityClass,
  type EvidenceBinding,
  type EvidenceSource,
  type GraphRetrieval,
  type IndexLookupOutcome,
  type IndexLookupRequest,
  type IndexView,
  type IndexedCandidate,
  type KnownIdentityRecoveryEvidence,
  type ModelIdentity,
  type ReconciliationCommand,
  type RecoveryAdvisorPort,
  type RecoveryRecommendationOutcome,
  type SubgraphMcpPolicy,
} from './types.js';

export const RECOVERY_JOB_VERSION = 'recovery-job-v1' as const;
export const LOCAL_RECOVERY_SNAPSHOT_VERSION = 'local-recovery-snapshot-v1' as const;
export const RECOVERY_RECORD_VERSION = 'recovery-record-v1' as const;
export const APPEND_RECOVERY_RECORD_VERSION = 'append-recovery-record-v1' as const;
export const RECOVERY_COMMAND_PACK_VERSION = 'recovery-command-pack-v1' as const;

export type RecoveryServiceIssueCode =
  | 'ADVISOR_BOUNDARY_REJECTED'
  | 'ADVISOR_UNAVAILABLE'
  | 'CANDIDATE_EVIDENCE_AMBIGUOUS'
  | 'CANDIDATE_EVIDENCE_UNAVAILABLE'
  | 'COMMAND_STORE_UNAVAILABLE'
  | 'CONTRACT_VERSION_MISMATCH'
  | 'DUPLICATE_EVENT'
  | 'EVIDENCE_BINDING_MISMATCH'
  | 'EVIDENCE_UNAVAILABLE'
  | 'EVENT_ID_CONFLICT'
  | 'INVALID_JOB'
  | 'LOCAL_STATE_UNAVAILABLE'
  | 'MCP_BOUNDARY_REJECTED'
  | 'MCP_UNAVAILABLE'
  | 'MISSING_FRESHNESS_METADATA'
  | 'RAW_PROVIDER_PAYLOAD_REJECTED';

export interface RecoveryJob {
  readonly schemaVersion: typeof RECOVERY_JOB_VERSION;
  readonly eventId: string;
  readonly businessIntentId: string;
  readonly requestedAt: string;
}

export interface LocalRecoverySnapshot {
  readonly schemaVersion: typeof LOCAL_RECOVERY_SNAPSHOT_VERSION;
  readonly binding: EvidenceBinding;
  readonly providerIdentity?: {
    readonly referenceId: string;
    readonly requestFingerprint: string;
    readonly providerKind?: 'DIRECT_ARC' | 'CIRCLE_X402';
    readonly transactionHash?: string;
    readonly walletId?: string | undefined;
    readonly policyId?: string | undefined;
  };
  readonly durable: {
    readonly state: 'SUBMITTING' | 'UNKNOWN' | 'COMMITTED' | 'FAILED_SAFE';
    readonly stateVersion: string;
    readonly attemptCount: number;
    readonly persistedAt: string;
  };
  readonly indexRequest: IndexLookupRequest;
  readonly mcpPolicy: SubgraphMcpPolicy;
  readonly capturedAt: string;
}

export interface LocalRecoveryStatePort {
  read(businessIntentId: string): Promise<LocalRecoverySnapshot>;
}

export interface KnownIdentityEvidencePort {
  read(binding: EvidenceBinding): Promise<KnownIdentityRecoveryEvidence>;
}

/**
 * Verifies a non-authoritative Graph candidate against an independently
 * fetched Arc receipt. Candidate discovery never proves settlement by itself.
 */
export interface CandidateEvidencePort {
  verifyCandidate(
    binding: EvidenceBinding,
    candidate: IndexedCandidate,
  ): Promise<KnownIdentityRecoveryEvidence | null>;
}

export interface SubgraphMcpRecoveryPort {
  lookup(request: IndexLookupRequest, policy: SubgraphMcpPolicy): Promise<IndexLookupOutcome>;
}

export type RecoveryRecordProvenance =
  | {
      readonly kind: 'SOURCE';
      readonly source: Exclude<EvidenceSource, 'LLM' | 'THE_GRAPH'>;
      readonly sourceVersion: string;
    }
  | {
      readonly kind: 'GRAPH';
      readonly retrieval: GraphRetrieval;
      readonly endpointUrl: string;
      readonly deploymentId: string;
      readonly manifestCid: string;
      readonly queryName: string;
      readonly queryDigest: string;
      readonly serverName?: string | undefined;
      readonly serverVersion?: string | undefined;
      readonly toolName?: string | undefined;
    }
  | {
      readonly kind: 'MCP';
      readonly serverName: string;
      readonly serverVersion: string;
      readonly deploymentId: string;
      readonly manifestCid: string;
      readonly toolName: string;
      readonly queryName: string;
      readonly queryDigest: string;
    }
  | {
      readonly kind: 'MODEL';
      readonly modelIdentity: ModelIdentity;
    };

interface RecoveryRecordBase {
  readonly schemaVersion: typeof RECOVERY_RECORD_VERSION;
  readonly recordId: string;
  readonly businessIntentId: string;
  readonly authorityClass: EvidenceAuthorityClass;
  readonly retrievedAt: string;
  readonly freshness: IndexView['health'] | null;
  readonly blockNumber: string | null;
  readonly reason: string;
  readonly evidenceReferences: readonly string[];
  readonly transferLogIndex?: number | undefined;
  readonly digest: string;
  readonly provenance: RecoveryRecordProvenance;
}

export interface RecoveryObservationRecord extends RecoveryRecordBase {
  readonly recordType: 'OBSERVATION';
  readonly source: Exclude<EvidenceSource, 'LLM'>;
}

export interface RecoveryDecisionRecord extends RecoveryRecordBase {
  readonly recordType: 'DECISION';
  readonly source: 'LLM';
  readonly accepted: boolean;
  readonly advisoryAction: string;
  readonly coreDisposition: ReconciliationCommand['commandType'];
}

export type RecoveryRecord = RecoveryObservationRecord | RecoveryDecisionRecord;

export interface AppendRecoveryRecordCommand {
  readonly schemaVersion: typeof APPEND_RECOVERY_RECORD_VERSION;
  readonly commandId: string;
  readonly operation: 'APPEND_RECOVERY_RECORD';
  readonly businessIntentId: string;
  readonly expectedStateVersion: string;
  readonly record: RecoveryRecord;
}

export interface RecoveryCommandPack {
  readonly schemaVersion: typeof RECOVERY_COMMAND_PACK_VERSION;
  readonly packId: string;
  readonly eventId: string;
  readonly businessIntentId: string;
  readonly sourceStateVersion: string;
  readonly generatedAt: string;
  readonly appendCommands: readonly AppendRecoveryRecordCommand[];
  readonly reconciliationCommand: ReconciliationCommand;
  readonly recoveryView: DetailedRecoveryView;
  readonly externalSubmissionCount: 0;
}

export interface RecoveryCommandStoreResult {
  readonly status: 'APPENDED' | 'DUPLICATE';
  readonly pack: RecoveryCommandPack;
}

export interface RecoveryCommandStorePort {
  findByEventId(eventId: string): Promise<RecoveryCommandPack | null>;
  append(pack: RecoveryCommandPack): Promise<RecoveryCommandStoreResult>;
}

export interface RecoveryServiceResult {
  readonly status: 'PROCESSED' | 'DUPLICATE' | 'HELD';
  readonly issues: readonly RecoveryServiceIssueCode[];
  readonly pack: RecoveryCommandPack | null;
  readonly externalSubmissionCount: 0;
}

export interface RecoveryServicePorts {
  readonly localState: LocalRecoveryStatePort;
  readonly knownIdentityEvidence: KnownIdentityEvidencePort;
  readonly candidateEvidence?: CandidateEvidencePort;
  readonly subgraphMcp: SubgraphMcpRecoveryPort;
  readonly advisor: RecoveryAdvisorPort;
  readonly commandStore: RecoveryCommandStorePort;
}

const FORBIDDEN_PAYLOAD_KEYS = new Set([
  'accesstoken',
  'apikey',
  'authorization',
  'credential',
  'credentials',
  'headers',
  'privatekey',
  'providerbody',
  'rawproviderbody',
  'rawbody',
  'requestbody',
  'responsebody',
  'secret',
  'seedphrase',
]);

const SENSITIVE_TEXT =
  /(?:bearer\s+[a-z0-9._~-]+|(?:api[_-]?key|access[_-]?token|secret|private[_-]?key)\s*[:=]\s*[^\s,;]+)/giu;

function normalizedKey(key: string): string {
  return key.replace(/[^a-z0-9]/giu, '').toLowerCase();
}

function hasForbiddenPayload(value: unknown, seen = new Set<object>()): boolean {
  if (value === null || typeof value !== 'object') return false;
  if (seen.has(value)) return false;
  seen.add(value);

  if (Array.isArray(value)) return value.some((item) => hasForbiddenPayload(item, seen));

  return Object.entries(value as Record<string, unknown>).some(
    ([key, child]) =>
      FORBIDDEN_PAYLOAD_KEYS.has(normalizedKey(key)) || hasForbiddenPayload(child, seen),
  );
}

function sanitizeText(value: string, maxLength = 500): string {
  return value.replace(SENSITIVE_TEXT, '[REDACTED]').slice(0, maxLength);
}

function sameBinding(left: EvidenceBinding, right: EvidenceBinding): boolean {
  return (
    left.businessIntentId === right.businessIntentId &&
    left.requestFingerprint === right.requestFingerprint &&
    left.network === right.network &&
    left.tokenContract.toLowerCase() === right.tokenContract.toLowerCase() &&
    left.recipient.toLowerCase() === right.recipient.toLowerCase() &&
    left.amountAtomic === right.amountAtomic
  );
}

function stableDigest(value: unknown): string {
  return sha256(JSON.stringify(value));
}

function held(...issues: RecoveryServiceIssueCode[]): RecoveryServiceResult {
  return { status: 'HELD', issues: [...new Set(issues)], pack: null, externalSubmissionCount: 0 };
}

function sourceProvenance(record: BoundEvidenceRecord): RecoveryRecordProvenance {
  if (record.source === 'THE_GRAPH') {
    throw new Error('The Graph records require explicit provider provenance');
  }
  if (record.source === 'LLM') {
    throw new Error('LLM records require explicit model provenance');
  }
  return {
    kind: 'SOURCE',
    source: record.source,
    sourceVersion: RECOVERY_EVIDENCE_VERSION,
  };
}

function observationFromBoundRecord(
  businessIntentId: string,
  record: BoundEvidenceRecord,
): RecoveryObservationRecord {
  const safe = {
    source: record.source,
    authorityClass: record.authorityClass,
    retrievedAt: record.retrievedAt,
    freshness: record.freshness ?? null,
    blockNumber: record.blockNumber ?? null,
    reason: sanitizeText(record.sanitizedReason ?? 'Observation accepted at recovery boundary'),
    evidenceReferences: [record.id],
    sourceDigest: record.digest,
  };
  const transferLogIndex =
    record.source === 'ARC' && typeof record.details?.['logIndex'] === 'string'
      ? Number(record.details['logIndex'])
      : undefined;
  return {
    schemaVersion: RECOVERY_RECORD_VERSION,
    recordType: 'OBSERVATION',
    recordId: `observation:${stableDigest(safe)}`,
    businessIntentId,
    source: record.source as Exclude<EvidenceSource, 'LLM' | 'THE_GRAPH'>,
    authorityClass: record.authorityClass,
    retrievedAt: record.retrievedAt,
    freshness: record.freshness ?? null,
    blockNumber: record.blockNumber ?? null,
    reason: safe.reason,
    evidenceReferences: safe.evidenceReferences,
    ...(typeof transferLogIndex === 'number' &&
    Number.isSafeInteger(transferLogIndex) &&
    transferLogIndex >= 0
      ? { transferLogIndex }
      : {}),
    digest: stableDigest(safe),
    provenance: sourceProvenance(record),
  };
}

function graphObservation(businessIntentId: string, view: IndexView): RecoveryObservationRecord {
  const retrievalLabel =
    view.source.retrieval === 'STUDIO_GRAPHQL' ? 'Studio GraphQL' : 'Subgraph MCP';
  const reason = sanitizeText(
    view.diagnostics.length === 0
      ? `${retrievalLabel} observation accepted with ${view.candidateCount} candidate(s)`
      : `${retrievalLabel} diagnostics: ${view.diagnostics.join(', ')}`,
  );
  const evidenceReferences = view.candidates.map((candidate) => `thegraph:${candidate.id}`);
  const safe = {
    source: 'THE_GRAPH',
    authorityClass: view.source.authority,
    retrievedAt: view.retrievedAt,
    freshness: view.health,
    blockNumber: view.observedThrough?.blockNumber ?? null,
    reason,
    evidenceReferences,
    graph: view.graph,
  };
  return {
    schemaVersion: RECOVERY_RECORD_VERSION,
    recordType: 'OBSERVATION',
    recordId: `observation:${stableDigest(safe)}`,
    businessIntentId,
    source: 'THE_GRAPH',
    authorityClass: 'NON_AUTHORITATIVE_CANDIDATE_DISCOVERY',
    retrievedAt: view.retrievedAt,
    freshness: view.health,
    blockNumber: view.observedThrough?.blockNumber ?? null,
    reason,
    evidenceReferences,
    digest: stableDigest(safe),
    provenance:
      view.graph.retrieval === 'SUBGRAPH_MCP'
        ? {
            kind: 'MCP',
            serverName: view.graph.serverName ?? 'subgraph-mcp',
            serverVersion: view.graph.serverVersion ?? 'unknown',
            deploymentId: view.graph.deploymentId,
            manifestCid: view.graph.manifestCid,
            toolName: view.graph.toolName ?? 'execute_query_by_deployment_id',
            queryName: view.graph.queryName,
            queryDigest: view.graph.queryDigest,
          }
        : {
            kind: 'GRAPH',
            retrieval: view.graph.retrieval,
            endpointUrl: view.graph.endpointUrl,
            ...(view.graph.serverName ? { serverName: view.graph.serverName } : {}),
            ...(view.graph.serverVersion ? { serverVersion: view.graph.serverVersion } : {}),
            ...(view.graph.toolName ? { toolName: view.graph.toolName } : {}),
            deploymentId: view.graph.deploymentId,
            manifestCid: view.graph.manifestCid,
            queryName: view.graph.queryName,
            queryDigest: view.graph.queryDigest,
          },
  };
}

function decisionRecord(
  businessIntentId: string,
  requestedAt: string,
  outcome: RecoveryRecommendationOutcome,
  command: ReconciliationCommand,
): RecoveryDecisionRecord {
  const recommendation = outcome.recommendation;
  const reason = sanitizeText(recommendation.reason);
  const safe = {
    accepted: outcome.accepted,
    advisoryAction: recommendation.action,
    coreDisposition: command.commandType,
    reason,
    evidenceReferences: [...command.evidenceReferences],
    modelIdentity: recommendation.modelIdentity,
  };
  return {
    schemaVersion: RECOVERY_RECORD_VERSION,
    recordType: 'DECISION',
    recordId: `decision:${stableDigest(safe)}`,
    businessIntentId,
    source: 'LLM',
    authorityClass: 'ADVISORY_AGENT_OBSERVATION',
    retrievedAt: requestedAt,
    freshness: null,
    blockNumber: null,
    reason,
    evidenceReferences: safe.evidenceReferences,
    digest: stableDigest(safe),
    provenance: { kind: 'MODEL', modelIdentity: recommendation.modelIdentity },
    accepted: outcome.accepted,
    advisoryAction: recommendation.action,
    coreDisposition: command.commandType,
  };
}

function buildCommandPack(params: {
  job: RecoveryJob;
  snapshot: LocalRecoverySnapshot;
  evidence: KnownIdentityRecoveryEvidence;
  indexView: IndexView | null;
  recommendation: RecoveryRecommendationOutcome;
}): RecoveryCommandPack {
  const evaluated = evaluateReconciliation({
    binding: params.snapshot.binding,
    durable: params.snapshot.durable,
    evidence: params.evidence,
    indexView: params.indexView,
    recommendationOutcome: params.recommendation,
    evaluatedAt: params.job.requestedAt,
  });
  const reconciliationCommand: ReconciliationCommand = {
    ...evaluated.command,
    reason: sanitizeText(evaluated.command.reason),
  };
  const extracted = buildBoundEvidenceRecords(
    params.snapshot.binding,
    params.evidence,
    params.indexView,
  );
  const records: RecoveryRecord[] = extracted.records
    .filter((record) => record.source !== 'THE_GRAPH' && record.source !== 'LLM')
    .map((record) => observationFromBoundRecord(params.job.businessIntentId, record));

  if (params.indexView !== null) {
    records.push(graphObservation(params.job.businessIntentId, params.indexView));
  }
  records.push(
    decisionRecord(
      params.job.businessIntentId,
      params.job.requestedAt,
      params.recommendation,
      reconciliationCommand,
    ),
  );

  const appendCommands = records.map((record): AppendRecoveryRecordCommand => ({
    schemaVersion: APPEND_RECOVERY_RECORD_VERSION,
    commandId: `append:${stableDigest({
      eventId: params.job.eventId,
      stateVersion: params.snapshot.durable.stateVersion,
      recordId: record.recordId,
    })}`,
    operation: 'APPEND_RECOVERY_RECORD',
    businessIntentId: params.job.businessIntentId,
    expectedStateVersion: params.snapshot.durable.stateVersion,
    record,
  }));
  const packIdentity = {
    eventId: params.job.eventId,
    businessIntentId: params.job.businessIntentId,
    sourceStateVersion: params.snapshot.durable.stateVersion,
    commandIds: appendCommands.map((command) => command.commandId),
    reconciliationCommand,
  };

  return {
    schemaVersion: RECOVERY_COMMAND_PACK_VERSION,
    packId: `recovery-pack:${stableDigest(packIdentity)}`,
    eventId: params.job.eventId,
    businessIntentId: params.job.businessIntentId,
    sourceStateVersion: params.snapshot.durable.stateVersion,
    generatedAt: params.job.requestedAt,
    appendCommands,
    reconciliationCommand,
    recoveryView: evaluated.view,
    externalSubmissionCount: 0,
  };
}

export class RecoveryService {
  constructor(private readonly ports: RecoveryServicePorts) {}

  async handle(job: RecoveryJob): Promise<RecoveryServiceResult> {
    if (
      job.schemaVersion !== RECOVERY_JOB_VERSION ||
      job.eventId.length === 0 ||
      job.businessIntentId.length === 0 ||
      !Number.isFinite(Date.parse(job.requestedAt))
    ) {
      return held('INVALID_JOB');
    }

    let existing: RecoveryCommandPack | null;
    try {
      existing = await this.ports.commandStore.findByEventId(job.eventId);
    } catch {
      return held('COMMAND_STORE_UNAVAILABLE');
    }
    if (existing !== null) {
      if (existing.schemaVersion !== RECOVERY_COMMAND_PACK_VERSION) {
        return held('CONTRACT_VERSION_MISMATCH');
      }
      if (existing.businessIntentId !== job.businessIntentId) {
        return held('EVENT_ID_CONFLICT');
      }
      return {
        status: 'DUPLICATE',
        issues: ['DUPLICATE_EVENT'],
        pack: existing,
        externalSubmissionCount: 0,
      };
    }

    let snapshot: LocalRecoverySnapshot;
    try {
      snapshot = await this.ports.localState.read(job.businessIntentId);
    } catch {
      return held('LOCAL_STATE_UNAVAILABLE');
    }
    if (
      snapshot.schemaVersion !== LOCAL_RECOVERY_SNAPSHOT_VERSION ||
      snapshot.binding.businessIntentId !== job.businessIntentId
    ) {
      return held('CONTRACT_VERSION_MISMATCH');
    }
    if (hasForbiddenPayload(snapshot)) {
      return held('RAW_PROVIDER_PAYLOAD_REJECTED');
    }
    if (!sameBinding(snapshot.binding, snapshot.indexRequest.binding)) {
      return held('EVIDENCE_BINDING_MISMATCH');
    }

    let evidence: KnownIdentityRecoveryEvidence;
    try {
      evidence = await this.ports.knownIdentityEvidence.read(snapshot.binding);
    } catch {
      return held('EVIDENCE_UNAVAILABLE');
    }
    if (evidence.schemaVersion !== RECOVERY_EVIDENCE_VERSION) {
      return held('CONTRACT_VERSION_MISMATCH');
    }
    if (!sameBinding(snapshot.binding, evidence.binding)) {
      return held('EVIDENCE_BINDING_MISMATCH');
    }
    if (hasForbiddenPayload(evidence)) {
      return held('RAW_PROVIDER_PAYLOAD_REJECTED');
    }

    const issues: RecoveryServiceIssueCode[] = [];
    let indexView: IndexView | null = null;
    try {
      const indexOutcome = await this.ports.subgraphMcp.lookup(
        snapshot.indexRequest,
        snapshot.mcpPolicy,
      );
      if (indexOutcome.view.schemaVersion !== INDEX_VIEW_VERSION) {
        return held('CONTRACT_VERSION_MISMATCH');
      }
      if (!sameBinding(snapshot.binding, indexOutcome.view.binding)) {
        return held('EVIDENCE_BINDING_MISMATCH');
      }
      indexView = indexOutcome.view;
      if (!indexOutcome.accepted) issues.push('MCP_BOUNDARY_REJECTED');
      if (indexView.health === 'UNKNOWN_FRESHNESS') {
        issues.push('MISSING_FRESHNESS_METADATA');
      }
    } catch {
      issues.push('MCP_UNAVAILABLE');
    }

    // Graph results are search hints only. When known-identity evidence did
    // not resolve the intent, independently verify every matching candidate
    // against Arc before the deterministic core can see authoritative proof.
    if (indexView !== null && this.ports.candidateEvidence) {
      const knownEvidence = buildBoundEvidenceRecords(snapshot.binding, evidence, null);
      if (!knownEvidence.hasAuthoritativeSuccess && !knownEvidence.hasAuthoritativeRevert) {
        const matchingCandidates = indexView.candidates.filter(
          (candidate) => candidate.bindingStatus === 'MATCH',
        );
        const verifiedCandidates: KnownIdentityRecoveryEvidence[] = [];
        for (const candidate of matchingCandidates) {
          try {
            const candidateEvidence = await this.ports.candidateEvidence.verifyCandidate(
              snapshot.binding,
              candidate,
            );
            if (candidateEvidence === null) {
              issues.push('CANDIDATE_EVIDENCE_UNAVAILABLE');
              continue;
            }
            if (
              candidateEvidence.schemaVersion === RECOVERY_EVIDENCE_VERSION &&
              sameBinding(snapshot.binding, candidateEvidence.binding) &&
              !hasForbiddenPayload(candidateEvidence) &&
              buildBoundEvidenceRecords(snapshot.binding, candidateEvidence, null)
                .hasAuthoritativeSuccess
            ) {
              verifiedCandidates.push(candidateEvidence);
            }
          } catch {
            issues.push('CANDIDATE_EVIDENCE_UNAVAILABLE');
          }
        }
        if (matchingCandidates.length === 1 && verifiedCandidates.length === 1) {
          evidence = verifiedCandidates[0] as KnownIdentityRecoveryEvidence;
        } else if (matchingCandidates.length > 1) {
          // Multiple verified transfers are contradictory. Keep the original
          // non-authoritative evidence so this run cannot select one payment.
          issues.push('CANDIDATE_EVIDENCE_AMBIGUOUS');
        }
      }
    }

    const input = buildRecoveryAgentInput({
      binding: snapshot.binding,
      durableState: snapshot.durable,
      evidence,
      indexView,
    });
    const evidenceIds = [
      ...input.authoritativeEvidence.map((record) => record.id),
      ...input.providerObservations.map((record) => record.id),
      ...input.candidateObservations.map((candidate) => `thegraph:${candidate.id}`),
    ];

    let rawAdvisorOutcome: RecoveryRecommendationOutcome | null = null;
    try {
      rawAdvisorOutcome = await this.ports.advisor.recommend(input);
    } catch {
      issues.push('ADVISOR_UNAVAILABLE');
    }
    const normalized = validateAndNormalizeRecommendation(
      rawAdvisorOutcome?.recommendation ?? null,
      snapshot.binding,
      evidenceIds,
      () => job.requestedAt,
    );
    const recommendation: RecoveryRecommendationOutcome =
      rawAdvisorOutcome?.accepted === true && normalized.accepted
        ? normalized
        : {
            ...normalized,
            accepted: false,
            issues:
              rawAdvisorOutcome?.issues && rawAdvisorOutcome.issues.length > 0
                ? rawAdvisorOutcome.issues
                : normalized.issues,
          };
    if (!recommendation.accepted) issues.push('ADVISOR_BOUNDARY_REJECTED');

    const pack = buildCommandPack({ job, snapshot, evidence, indexView, recommendation });
    let stored: RecoveryCommandStoreResult;
    try {
      stored = await this.ports.commandStore.append(pack);
    } catch {
      return held('COMMAND_STORE_UNAVAILABLE');
    }
    if (stored.status === 'DUPLICATE') {
      if (
        stored.pack.businessIntentId !== job.businessIntentId ||
        stored.pack.packId !== pack.packId
      ) {
        return held('EVENT_ID_CONFLICT');
      }
      return {
        status: 'DUPLICATE',
        issues: [...new Set<RecoveryServiceIssueCode>([...issues, 'DUPLICATE_EVENT'])],
        pack: stored.pack,
        externalSubmissionCount: 0,
      };
    }
    return {
      status: 'PROCESSED',
      issues: [...new Set(issues)],
      pack: stored.pack,
      externalSubmissionCount: 0,
    };
  }
}
