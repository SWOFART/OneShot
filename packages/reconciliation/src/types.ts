export const RECOVERY_EVIDENCE_VERSION = 'recovery-evidence-v1' as const;
export const INDEX_VIEW_VERSION = 'index-view-v1' as const;
export const MCP_RESULT_VERSION = 'subgraph-mcp-result-v1' as const;
export const MCP_TOOL_NAME = 'execute_query_by_deployment_id' as const;
export const MCP_QUERY_NAME = 'OneShotRecoveryCandidatesV1' as const;

export const MAX_CANDIDATES = 25;
export const MAX_MCP_RESULT_BYTES = 128 * 1024;
export const MAX_MCP_ENVELOPE_BYTES = 160 * 1024;

export type IndexHealth = 'FRESH' | 'LAGGING' | 'UNHEALTHY' | 'UNAVAILABLE' | 'UNKNOWN_FRESHNESS';

export type CorrelationStrategy = 'MEMO_ID' | 'TRANSFER_TUPLE_WINDOW';

export type IndexDiagnosticCode =
  | 'BOUNDARY_REJECTED'
  | 'CANDIDATE_LIMIT_EXCEEDED'
  | 'DUPLICATE_CANDIDATE'
  | 'INDEXING_ERRORS'
  | 'MCP_ERROR'
  | 'MCP_UNAVAILABLE'
  | 'MULTIPLE_CANDIDATES'
  | 'NO_CANDIDATES'
  | 'OUT_OF_ORDER_INPUT'
  | 'RESULT_TOO_LARGE'
  | 'UNKNOWN_FRESHNESS'
  | 'WRONG_DEPLOYMENT'
  | 'WRONG_TOOL';

export type ContradictionCode =
  | 'AMOUNT_MISMATCH'
  | 'BLOCK_OUTSIDE_WINDOW'
  | 'MEMO_MISMATCH'
  | 'MULTIPLE_DISTINCT_CANDIDATES'
  | 'NETWORK_MISMATCH'
  | 'RECIPIENT_MISMATCH'
  | 'SENDER_MISMATCH'
  | 'TOKEN_MISMATCH';

export interface EvidenceBinding {
  businessIntentId: string;
  requestFingerprint: string;
  network: string;
  tokenContract: string;
  recipient: string;
  amountAtomic: string;
}

export interface KnownIdentityRecoveryEvidence {
  schemaVersion: typeof RECOVERY_EVIDENCE_VERSION;
  binding: EvidenceBinding;
  local: {
    authority: 'AUTHORITATIVE_ONESHOT';
    stateVersion: string;
    settlementState: 'SUBMITTING' | 'UNKNOWN' | 'COMMITTED' | 'FAILED_SAFE';
    persistedAt: string;
    digest: string;
  };
  privy: null | {
    authority: 'PROVIDER_OBSERVATION';
    referenceId: string;
    requestFingerprint: string;
    requestStatus: 'PENDING' | 'SUCCEEDED' | 'FAILED' | 'NOT_FOUND' | 'UNAVAILABLE';
    transactionHash: string | null;
    retrievedAt: string;
    digest: string;
  };
  arc: null | {
    authority: 'AUTHORITATIVE_CHAIN_EVIDENCE';
    network: string;
    transactionHash: string;
    receiptStatus: 'SUCCESS' | 'REVERT' | 'PENDING' | 'NOT_FOUND' | 'UNAVAILABLE';
    finality: 'FINAL' | 'PENDING' | 'UNKNOWN';
    blockNumber: string | null;
    blockHash: string | null;
    blockTimestamp: string | null;
    transfer: null | {
      tokenContract: string;
      sender: string;
      recipient: string;
      amountAtomic: string;
      logIndex: string;
    };
    retrievedAt: string;
    digest: string;
  };
}

export interface TransferTupleWindowCorrelation {
  strategy: 'TRANSFER_TUPLE_WINDOW';
  sender: string;
  fromBlock: string;
  toBlock: string;
}

export interface MemoIdCorrelation {
  strategy: 'MEMO_ID';
  memoId: string;
  sender: string;
  fromBlock: string;
  toBlock: string;
}

export type CandidateCorrelation = TransferTupleWindowCorrelation | MemoIdCorrelation;

export interface IndexLookupRequest {
  binding: EvidenceBinding;
  correlation: CandidateCorrelation;
}

export interface SubgraphMcpPolicy {
  serverName: string;
  serverVersion: string;
  deploymentId: string;
  manifestCid: string;
  maxLagBlocks: string;
  maxCandidates: number;
  maxResultBytes: number;
}

export interface SubgraphMcpTrace {
  callId: string;
  serverName: string;
  serverVersion: string;
  toolName: string;
  arguments: unknown;
  result: unknown;
  retrievedAt: string;
  chainHead: null | {
    blockNumber: string;
    observedAt: string;
  };
}

export interface McpQueryVariables {
  amountAtomic: string;
  fromBlock: string;
  recipient: string;
  sender: string;
  toBlock: string;
  tokenContract: string;
}

export interface McpToolArguments {
  deployment_id: string;
  query: string;
  variables: McpQueryVariables;
}

export interface GraphCandidatePayload {
  id: string;
  transactionHash: string;
  logIndex: string;
  blockNumber: string;
  blockHash: string;
  blockTimestamp: string;
  network: string;
  tokenContract: string;
  sender: string;
  recipient: string;
  amountAtomic: string;
  memoId: string | null;
}

export interface GraphMetaPayload {
  deployment: string;
  hasIndexingErrors: boolean;
  block: {
    number: number;
    hash: string;
    timestamp: string | null;
  };
}

export interface SubgraphMcpResultPayload {
  data: {
    settlementCandidates: GraphCandidatePayload[];
    _meta: GraphMetaPayload;
  };
}

export interface IndexedCandidate extends GraphCandidatePayload {
  evidenceId: string;
  bindingStatus: 'MATCH' | 'CONTRADICTORY';
  contradictionCodes: ContradictionCode[];
}

export interface IndexView {
  schemaVersion: typeof INDEX_VIEW_VERSION;
  source: {
    provider: 'THE_GRAPH';
    retrieval: 'SUBGRAPH_MCP';
    authority: 'NON_AUTHORITATIVE_CANDIDATE_DISCOVERY';
  };
  binding: EvidenceBinding;
  correlation: CandidateCorrelation;
  mcp: {
    callId: string;
    serverName: string;
    serverVersion: string;
    toolName: typeof MCP_TOOL_NAME;
    deploymentId: string;
    manifestCid: string;
    queryName: typeof MCP_QUERY_NAME;
    queryDigest: string;
  };
  observedThrough: null | {
    blockNumber: string;
    blockHash: string;
    blockTimestamp: string | null;
  };
  chainHead: null | {
    blockNumber: string;
    observedAt: string;
  };
  lagBlocks: string | null;
  health: IndexHealth;
  retrievedAt: string;
  candidates: IndexedCandidate[];
  candidateCount: number;
  contradiction: boolean;
  contradictionCodes: ContradictionCode[];
  diagnostics: IndexDiagnosticCode[];
  settlementPermission: 'NEVER';
}

export type BoundaryIssueCode =
  'INVALID_ENVELOPE' | 'INVALID_IDENTITY' | 'INVALID_JSON' | 'INVALID_RESULT' | 'RESULT_TOO_LARGE';

export interface BoundaryIssue {
  code: BoundaryIssueCode;
  path: string;
}

export interface IndexLookupOutcome {
  accepted: boolean;
  view: IndexView;
  issues: BoundaryIssue[];
}

export const RECOVERY_ADVISOR_VERSION = 'recovery-advisor-v1' as const;
export const RECONCILIATION_COMMAND_VERSION = 'reconciliation-command-v1' as const;
export const RECOVERY_VIEW_VERSION = 'recovery-view-v1' as const;

export type EvidenceAuthorityClass =
  | 'AUTHORITATIVE_ONESHOT'
  | 'AUTHORITATIVE_CHAIN_EVIDENCE'
  | 'PROVIDER_OBSERVATION'
  | 'NON_AUTHORITATIVE_CANDIDATE_DISCOVERY'
  | 'ADVISORY_AGENT_OBSERVATION';

export type EvidenceSource = 'ONESHOT' | 'PRIVY' | 'ARC' | 'THE_GRAPH' | 'LLM';

export interface BoundEvidenceRecord {
  id: string;
  source: EvidenceSource;
  authorityClass: EvidenceAuthorityClass;
  binding: EvidenceBinding;
  retrievedAt: string;
  digest: string;
  finality?: 'FINAL' | 'PENDING' | 'UNKNOWN' | undefined;
  freshness?: IndexHealth | undefined;
  blockNumber?: string | null | undefined;
  blockHash?: string | null | undefined;
  sanitizedReason?: string | undefined;
  details?: Record<string, unknown> | undefined;
}

export const RECOVERY_ADVISOR_ACTIONS = [
  'WAIT',
  'RECONCILE',
  'ESCALATE',
  'RETURN_EXISTING_RESULT',
] as const;
export type RecoveryAdvisorAction = (typeof RECOVERY_ADVISOR_ACTIONS)[number];

export interface ModelIdentity {
  modelName: string;
  modelVersion: string;
  promptVersion: string;
}

export interface RecoveryRecommendation {
  action: RecoveryAdvisorAction;
  decisionId: string;
  reason: string;
  referencedEvidenceIds: readonly string[];
  modelIdentity: ModelIdentity;
  timestamp: string;
}

export interface RecoveryAgentInput {
  binding: EvidenceBinding;
  durableState: {
    state: 'SUBMITTING' | 'UNKNOWN' | 'COMMITTED' | 'FAILED_SAFE';
    stateVersion: string;
    attemptCount: number;
    persistedAt: string;
  };
  authoritativeEvidence: readonly BoundEvidenceRecord[];
  providerObservations: readonly BoundEvidenceRecord[];
  candidateObservations: readonly IndexedCandidate[];
  indexSummary: {
    health: IndexHealth;
    lagBlocks: string | null;
    observedThroughBlock: string | null;
    candidateCount: number;
    contradiction: boolean;
  };
  untrustedDataNotice: string;
  sanitized: true;
}

export interface RecoveryRecommendationOutcome {
  accepted: boolean;
  recommendation: RecoveryRecommendation;
  issues: readonly BoundaryIssue[];
}

export interface RecoveryAdvisorPort {
  recommend(
    input: RecoveryAgentInput,
  ): Promise<RecoveryRecommendationOutcome> | RecoveryRecommendationOutcome;
}

export const RECONCILIATION_COMMAND_TYPES = [
  'HOLD_UNKNOWN',
  'READ_ONLY_LOOKUP',
  'ESCALATE_UNKNOWN',
  'MARK_COMMITTED',
  'MARK_FAILED_SAFE',
] as const;
export type ReconciliationCommandType = (typeof RECONCILIATION_COMMAND_TYPES)[number];

export interface ReconciliationCommand {
  schemaVersion: typeof RECONCILIATION_COMMAND_VERSION;
  commandType: ReconciliationCommandType;
  businessIntentId: string;
  requestFingerprint: string;
  targetState: 'UNKNOWN' | 'COMMITTED' | 'FAILED_SAFE';
  reason: string;
  evidenceReferences: readonly string[];
  disposition: string;
  advisoryAction: RecoveryAdvisorAction;
  authoritativeProofPresent: boolean;
  issuedAt: string;
  settlementPermission: 'NEVER';
}

export interface DetailedRecoveryView {
  schemaVersion: typeof RECOVERY_VIEW_VERSION;
  businessIntentId: string;
  authoritativeState: 'SUBMITTING' | 'UNKNOWN' | 'COMMITTED' | 'FAILED_SAFE';
  coreDisposition: ReconciliationCommandType;
  recommendedAction: RecoveryAdvisorAction;
  authoritativeEvidence: readonly BoundEvidenceRecord[];
  providerObservations: readonly BoundEvidenceRecord[];
  indexedCandidates: readonly IndexedCandidate[];
  indexHealth: IndexHealth;
  contradiction: boolean;
  contradictionCodes: readonly ContradictionCode[];
  diagnostics: readonly string[];
  settlementPermission: 'NEVER';
  evaluatedAt: string;
  summary: string;
}
