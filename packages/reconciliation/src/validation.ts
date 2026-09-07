import { Buffer } from 'node:buffer';

import {
  INDEX_VIEW_VERSION,
  MAX_CANDIDATES,
  MAX_MCP_ENVELOPE_BYTES,
  MAX_MCP_RESULT_BYTES,
  MCP_QUERY_NAME,
  MCP_TOOL_NAME,
  RECOVERY_EVIDENCE_VERSION,
  type BoundaryIssue,
  type BoundaryIssueCode,
  type CandidateCorrelation,
  type ContradictionCode,
  type EvidenceBinding,
  type GraphCandidatePayload,
  type GraphMetaPayload,
  type IndexDiagnosticCode,
  type IndexHealth,
  type IndexedCandidate,
  type IndexLookupOutcome,
  type IndexLookupRequest,
  type IndexView,
  type KnownIdentityRecoveryEvidence,
  type McpQueryVariables,
  type SubgraphMcpPolicy,
  type SubgraphMcpResultPayload,
  type SubgraphMcpTrace,
} from './types.js';
import { buildMcpToolArguments, RECOVERY_CANDIDATE_QUERY_DIGEST, sha256 } from './query.js';

const ADDRESS = /^0x[0-9a-fA-F]{40}$/;
const HEX_32 = /^0x[0-9a-fA-F]{64}$/;
const HASH = /^[0-9a-f]{64}$/;
const UINT = /^(0|[1-9][0-9]*)$/;
const SAFE_ID = /^[A-Za-z0-9][A-Za-z0-9:._-]{0,127}$/;
const NETWORK = /^[a-z0-9][a-z0-9-]{0,31}:[A-Za-z0-9][A-Za-z0-9-]{0,63}$/;
const CID = /^(Qm[1-9A-HJ-NP-Za-km-z]{44}|bafy[a-z2-7]{20,})$/;

type UnknownRecord = Record<string, unknown>;

function isRecord(value: unknown): value is UnknownRecord {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function hasExactKeys(
  value: UnknownRecord,
  required: readonly string[],
  optional: readonly string[] = [],
): boolean {
  const actual = Object.keys(value).sort();
  const allowed = new Set([...required, ...optional]);
  return required.every((key) => key in value) && actual.every((key) => allowed.has(key));
}

function isBoundedString(value: unknown, maximum: number, pattern?: RegExp): value is string {
  return (
    typeof value === 'string' &&
    value.length > 0 &&
    value.length <= maximum &&
    (pattern === undefined || pattern.test(value))
  );
}

function isIsoInstant(value: unknown): value is string {
  return (
    typeof value === 'string' &&
    value.length <= 35 &&
    /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,9})?Z$/.test(value) &&
    !Number.isNaN(Date.parse(value))
  );
}

function isUint(value: unknown): value is string {
  return typeof value === 'string' && value.length <= 78 && UINT.test(value);
}

function isPositiveUint(value: unknown): value is string {
  return isUint(value) && BigInt(value) > 0n;
}

function sameAddress(left: string, right: string): boolean {
  return left.toLowerCase() === right.toLowerCase();
}

function addUnique<T>(values: T[], value: T): void {
  if (!values.includes(value)) values.push(value);
}

function issue(code: BoundaryIssueCode, path: string): BoundaryIssue {
  return { code, path };
}

function validBinding(value: unknown): value is EvidenceBinding {
  if (
    !isRecord(value) ||
    !hasExactKeys(value, [
      'businessIntentId',
      'requestFingerprint',
      'network',
      'tokenContract',
      'recipient',
      'amountAtomic',
    ])
  )
    return false;
  return (
    isBoundedString(value.businessIntentId, 128, SAFE_ID) &&
    isBoundedString(value.requestFingerprint, 64, HASH) &&
    isBoundedString(value.network, 96, NETWORK) &&
    isBoundedString(value.tokenContract, 42, ADDRESS) &&
    isBoundedString(value.recipient, 42, ADDRESS) &&
    isPositiveUint(value.amountAtomic)
  );
}

function validCorrelation(value: unknown): value is CandidateCorrelation {
  if (!isRecord(value)) return false;
  const common =
    isBoundedString(value.sender, 42, ADDRESS) &&
    isUint(value.fromBlock) &&
    isUint(value.toBlock) &&
    BigInt(value.fromBlock) <= BigInt(value.toBlock);

  if (value.strategy === 'TRANSFER_TUPLE_WINDOW') {
    return hasExactKeys(value, ['strategy', 'sender', 'fromBlock', 'toBlock']) && common;
  }
  if (value.strategy === 'MEMO_ID') {
    return (
      hasExactKeys(value, ['strategy', 'memoId', 'sender', 'fromBlock', 'toBlock']) &&
      common &&
      isBoundedString(value.memoId, 66, HEX_32)
    );
  }
  return false;
}

function validPolicy(policy: SubgraphMcpPolicy): boolean {
  return (
    policy.serverName === 'subgraph-mcp' &&
    isBoundedString(policy.serverVersion, 32, /^[A-Za-z0-9._+-]+$/) &&
    isBoundedString(policy.deploymentId, 66, HEX_32) &&
    isBoundedString(policy.manifestCid, 128, CID) &&
    isUint(policy.maxLagBlocks) &&
    Number.isInteger(policy.maxCandidates) &&
    policy.maxCandidates > 0 &&
    policy.maxCandidates <= MAX_CANDIDATES &&
    Number.isInteger(policy.maxResultBytes) &&
    policy.maxResultBytes > 0 &&
    policy.maxResultBytes <= MAX_MCP_RESULT_BYTES
  );
}

function stableJson(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(stableJson).join(',')}]`;
  if (isRecord(value)) {
    return `{${Object.keys(value)
      .sort()
      .map((key) => `${JSON.stringify(key)}:${stableJson(value[key])}`)
      .join(',')}}`;
  }
  const primitive = JSON.stringify(value);
  return typeof primitive === 'string' ? primitive : 'null';
}

function validQueryVariables(value: unknown): value is McpQueryVariables {
  if (
    !isRecord(value) ||
    !hasExactKeys(value, [
      'amountAtomic',
      'fromBlock',
      'recipient',
      'sender',
      'toBlock',
      'tokenContract',
    ])
  )
    return false;
  return (
    isPositiveUint(value.amountAtomic) &&
    isUint(value.fromBlock) &&
    isBoundedString(value.recipient, 42, ADDRESS) &&
    isBoundedString(value.sender, 42, ADDRESS) &&
    isUint(value.toBlock) &&
    isBoundedString(value.tokenContract, 42, ADDRESS)
  );
}

function parseToolArguments(value: unknown): null | {
  deployment_id: string;
  query: string;
  variables: McpQueryVariables;
} {
  if (!isRecord(value) || !hasExactKeys(value, ['deployment_id', 'query', 'variables']))
    return null;
  if (
    !isBoundedString(value.deployment_id, 66, HEX_32) ||
    !isBoundedString(value.query, 16_384) ||
    !validQueryVariables(value.variables)
  )
    return null;
  return {
    deployment_id: value.deployment_id,
    query: value.query,
    variables: value.variables,
  };
}

function parseMeta(value: unknown): GraphMetaPayload | null {
  if (!isRecord(value) || !hasExactKeys(value, ['deployment', 'hasIndexingErrors', 'block']))
    return null;
  if (!isRecord(value.block) || !hasExactKeys(value.block, ['number', 'hash', 'timestamp']))
    return null;
  if (
    !isBoundedString(value.deployment, 128, CID) ||
    typeof value.hasIndexingErrors !== 'boolean' ||
    !Number.isSafeInteger(value.block.number) ||
    (value.block.number as number) < 0 ||
    !isBoundedString(value.block.hash, 66, HEX_32) ||
    !(value.block.timestamp === null || isUint(value.block.timestamp))
  )
    return null;
  return {
    deployment: value.deployment,
    hasIndexingErrors: value.hasIndexingErrors,
    block: {
      number: value.block.number as number,
      hash: value.block.hash,
      timestamp: value.block.timestamp,
    },
  };
}

function parseCandidate(value: unknown): GraphCandidatePayload | null {
  const keys = [
    'id',
    'transactionHash',
    'logIndex',
    'blockNumber',
    'blockHash',
    'blockTimestamp',
    'network',
    'tokenContract',
    'sender',
    'recipient',
    'amountAtomic',
    'memoId',
  ];
  if (!isRecord(value) || !hasExactKeys(value, keys)) return null;
  if (
    !isBoundedString(value.id, 128, SAFE_ID) ||
    !isBoundedString(value.transactionHash, 66, HEX_32) ||
    !isUint(value.logIndex) ||
    !isUint(value.blockNumber) ||
    !isBoundedString(value.blockHash, 66, HEX_32) ||
    !isUint(value.blockTimestamp) ||
    !isBoundedString(value.network, 96, NETWORK) ||
    !isBoundedString(value.tokenContract, 42, ADDRESS) ||
    !isBoundedString(value.sender, 42, ADDRESS) ||
    !isBoundedString(value.recipient, 42, ADDRESS) ||
    !isPositiveUint(value.amountAtomic) ||
    !(value.memoId === null || isBoundedString(value.memoId, 66, HEX_32))
  )
    return null;
  return value as unknown as GraphCandidatePayload;
}

function parsePayload(value: unknown): SubgraphMcpResultPayload | null {
  if (!isRecord(value) || !hasExactKeys(value, ['data'])) return null;
  if (!isRecord(value.data) || !hasExactKeys(value.data, ['settlementCandidates', '_meta']))
    return null;
  if (!Array.isArray(value.data.settlementCandidates)) return null;
  const candidates = value.data.settlementCandidates.map(parseCandidate);
  const meta = parseMeta(value.data._meta);
  if (meta === null || candidates.some((candidate) => candidate === null)) return null;
  return {
    data: {
      settlementCandidates: candidates as GraphCandidatePayload[],
      _meta: meta,
    },
  };
}

function safeCallId(trace: SubgraphMcpTrace): string {
  return isBoundedString(trace.callId, 128, SAFE_ID) ? trace.callId : 'unavailable';
}

function baseView(
  request: IndexLookupRequest,
  policy: SubgraphMcpPolicy,
  trace: SubgraphMcpTrace,
): IndexView {
  return {
    schemaVersion: INDEX_VIEW_VERSION,
    source: {
      provider: 'THE_GRAPH',
      retrieval: 'SUBGRAPH_MCP',
      authority: 'NON_AUTHORITATIVE_CANDIDATE_DISCOVERY',
    },
    binding: request.binding,
    correlation: request.correlation,
    mcp: {
      callId: safeCallId(trace),
      serverName: policy.serverName,
      serverVersion: policy.serverVersion,
      toolName: MCP_TOOL_NAME,
      deploymentId: policy.deploymentId,
      manifestCid: policy.manifestCid,
      queryName: MCP_QUERY_NAME,
      queryDigest: RECOVERY_CANDIDATE_QUERY_DIGEST,
    },
    observedThrough: null,
    chainHead: null,
    lagBlocks: null,
    health: 'UNAVAILABLE',
    retrievedAt: isIsoInstant(trace.retrievedAt) ? trace.retrievedAt : '1970-01-01T00:00:00Z',
    candidates: [],
    candidateCount: 0,
    contradiction: false,
    contradictionCodes: [],
    diagnostics: [],
    settlementPermission: 'NEVER',
  };
}

function rejected(
  request: IndexLookupRequest,
  policy: SubgraphMcpPolicy,
  trace: SubgraphMcpTrace,
  diagnostic: IndexDiagnosticCode,
  boundaryIssue: BoundaryIssue,
): IndexLookupOutcome {
  const view = baseView(request, policy, trace);
  view.diagnostics = [diagnostic, 'BOUNDARY_REJECTED'];
  return { accepted: false, view, issues: [boundaryIssue] };
}

function candidateContradictions(
  candidate: GraphCandidatePayload,
  binding: EvidenceBinding,
  correlation: CandidateCorrelation,
): ContradictionCode[] {
  const codes: ContradictionCode[] = [];
  if (candidate.network !== binding.network) addUnique(codes, 'NETWORK_MISMATCH');
  if (!sameAddress(candidate.tokenContract, binding.tokenContract))
    addUnique(codes, 'TOKEN_MISMATCH');
  if (!sameAddress(candidate.recipient, binding.recipient)) addUnique(codes, 'RECIPIENT_MISMATCH');
  if (candidate.amountAtomic !== binding.amountAtomic) addUnique(codes, 'AMOUNT_MISMATCH');
  if (!sameAddress(candidate.sender, correlation.sender)) addUnique(codes, 'SENDER_MISMATCH');
  if (
    BigInt(candidate.blockNumber) < BigInt(correlation.fromBlock) ||
    BigInt(candidate.blockNumber) > BigInt(correlation.toBlock)
  )
    addUnique(codes, 'BLOCK_OUTSIDE_WINDOW');
  if (
    correlation.strategy === 'MEMO_ID' &&
    candidate.memoId?.toLowerCase() !== correlation.memoId.toLowerCase()
  )
    addUnique(codes, 'MEMO_MISMATCH');
  return codes;
}

function candidateOrder(left: GraphCandidatePayload, right: GraphCandidatePayload): number {
  const block = BigInt(left.blockNumber) - BigInt(right.blockNumber);
  if (block !== 0n) return block < 0n ? -1 : 1;
  const log = BigInt(left.logIndex) - BigInt(right.logIndex);
  if (log !== 0n) return log < 0n ? -1 : 1;
  return left.transactionHash.localeCompare(right.transactionHash);
}

function toIndexedCandidate(
  candidate: GraphCandidatePayload,
  request: IndexLookupRequest,
): IndexedCandidate {
  const contradictionCodes = candidateContradictions(
    candidate,
    request.binding,
    request.correlation,
  );
  return {
    ...candidate,
    evidenceId: `graph:${candidate.transactionHash.toLowerCase()}:${candidate.logIndex}`,
    bindingStatus: contradictionCodes.length === 0 ? 'MATCH' : 'CONTRADICTORY',
    contradictionCodes,
  };
}

function validChainHead(value: SubgraphMcpTrace['chainHead']): boolean {
  return value === null || (isUint(value.blockNumber) && isIsoInstant(value.observedAt));
}

export function normalizeSubgraphMcpTrace(
  request: IndexLookupRequest,
  policy: SubgraphMcpPolicy,
  trace: SubgraphMcpTrace,
): IndexLookupOutcome {
  if (
    !validBinding(request.binding) ||
    !validCorrelation(request.correlation) ||
    !validPolicy(policy)
  ) {
    return rejected(
      request,
      policy,
      trace,
      'BOUNDARY_REJECTED',
      issue('INVALID_IDENTITY', '$input'),
    );
  }
  if (
    !isIsoInstant(trace.retrievedAt) ||
    !validChainHead(trace.chainHead) ||
    trace.serverName !== policy.serverName ||
    trace.serverVersion !== policy.serverVersion
  ) {
    return rejected(
      request,
      policy,
      trace,
      'BOUNDARY_REJECTED',
      issue('INVALID_IDENTITY', '$trace'),
    );
  }
  if (trace.toolName !== MCP_TOOL_NAME) {
    return rejected(
      request,
      policy,
      trace,
      'WRONG_TOOL',
      issue('INVALID_IDENTITY', '$trace.toolName'),
    );
  }

  if (trace.result === null) {
    return rejected(
      request,
      policy,
      trace,
      'MCP_UNAVAILABLE',
      issue('INVALID_ENVELOPE', '$trace.result'),
    );
  }

  const actualArguments = parseToolArguments(trace.arguments);
  const expectedArguments = buildMcpToolArguments(request, policy);
  if (
    actualArguments === null ||
    sha256(actualArguments.query) !== RECOVERY_CANDIDATE_QUERY_DIGEST
  ) {
    return rejected(
      request,
      policy,
      trace,
      'BOUNDARY_REJECTED',
      issue('INVALID_IDENTITY', '$trace.arguments'),
    );
  }
  if (actualArguments.deployment_id !== policy.deploymentId) {
    return rejected(
      request,
      policy,
      trace,
      'WRONG_DEPLOYMENT',
      issue('INVALID_IDENTITY', '$trace.arguments.deployment_id'),
    );
  }
  if (stableJson(actualArguments) !== stableJson(expectedArguments)) {
    return rejected(
      request,
      policy,
      trace,
      'BOUNDARY_REJECTED',
      issue('INVALID_IDENTITY', '$trace.arguments.variables'),
    );
  }

  let envelopeSize: number;
  try {
    envelopeSize = Buffer.byteLength(JSON.stringify(trace.result), 'utf8');
  } catch {
    return rejected(
      request,
      policy,
      trace,
      'BOUNDARY_REJECTED',
      issue('INVALID_ENVELOPE', '$trace.result'),
    );
  }
  if (envelopeSize > MAX_MCP_ENVELOPE_BYTES) {
    return rejected(
      request,
      policy,
      trace,
      'RESULT_TOO_LARGE',
      issue('RESULT_TOO_LARGE', '$trace.result'),
    );
  }
  if (!isRecord(trace.result) || !hasExactKeys(trace.result, ['content'], ['isError'])) {
    return rejected(
      request,
      policy,
      trace,
      'BOUNDARY_REJECTED',
      issue('INVALID_ENVELOPE', '$trace.result'),
    );
  }
  if (trace.result.isError === true) {
    return rejected(
      request,
      policy,
      trace,
      'MCP_ERROR',
      issue('INVALID_ENVELOPE', '$trace.result.isError'),
    );
  }
  if (trace.result.isError !== undefined && trace.result.isError !== false) {
    return rejected(
      request,
      policy,
      trace,
      'BOUNDARY_REJECTED',
      issue('INVALID_ENVELOPE', '$trace.result.isError'),
    );
  }
  if (!Array.isArray(trace.result.content) || trace.result.content.length !== 1) {
    return rejected(
      request,
      policy,
      trace,
      'BOUNDARY_REJECTED',
      issue('INVALID_ENVELOPE', '$trace.result.content'),
    );
  }
  const content = (trace.result.content as unknown[])[0];
  if (
    !isRecord(content) ||
    !hasExactKeys(content, ['type', 'text']) ||
    content.type !== 'text' ||
    typeof content.text !== 'string'
  ) {
    return rejected(
      request,
      policy,
      trace,
      'BOUNDARY_REJECTED',
      issue('INVALID_ENVELOPE', '$trace.result.content[0]'),
    );
  }
  if (Buffer.byteLength(content.text, 'utf8') > policy.maxResultBytes) {
    return rejected(
      request,
      policy,
      trace,
      'RESULT_TOO_LARGE',
      issue('RESULT_TOO_LARGE', '$trace.result.content[0].text'),
    );
  }

  let rawPayload: unknown;
  try {
    rawPayload = JSON.parse(content.text);
  } catch {
    return rejected(
      request,
      policy,
      trace,
      'BOUNDARY_REJECTED',
      issue('INVALID_JSON', '$trace.result.content[0].text'),
    );
  }
  const payload = parsePayload(rawPayload);
  if (payload === null) {
    return rejected(
      request,
      policy,
      trace,
      'BOUNDARY_REJECTED',
      issue('INVALID_RESULT', '$trace.result.content[0].text'),
    );
  }
  if (payload.data._meta.deployment !== policy.manifestCid) {
    return rejected(
      request,
      policy,
      trace,
      'WRONG_DEPLOYMENT',
      issue('INVALID_IDENTITY', '$data._meta.deployment'),
    );
  }
  if (payload.data.settlementCandidates.length > policy.maxCandidates) {
    return rejected(
      request,
      policy,
      trace,
      'CANDIDATE_LIMIT_EXCEEDED',
      issue('INVALID_RESULT', '$data.settlementCandidates'),
    );
  }

  const view = baseView(request, policy, trace);
  const diagnostics: IndexDiagnosticCode[] = [];
  const meta = payload.data._meta;
  view.observedThrough = {
    blockNumber: String(meta.block.number),
    blockHash: meta.block.hash,
    blockTimestamp: meta.block.timestamp,
  };
  view.chainHead = trace.chainHead;

  const seen = new Set<string>();
  const unique: GraphCandidatePayload[] = [];
  for (const candidate of payload.data.settlementCandidates) {
    const key = `${candidate.transactionHash.toLowerCase()}:${candidate.logIndex}`;
    if (seen.has(key)) {
      addUnique(diagnostics, 'DUPLICATE_CANDIDATE');
      continue;
    }
    seen.add(key);
    unique.push(candidate);
  }
  const sorted = [...unique].sort(candidateOrder);
  if (unique.some((candidate, index) => candidate !== sorted[index]))
    addUnique(diagnostics, 'OUT_OF_ORDER_INPUT');
  view.candidates = sorted.map((candidate) => toIndexedCandidate(candidate, request));
  view.candidateCount = view.candidates.length;

  const contradictions: ContradictionCode[] = [];
  for (const candidate of view.candidates) {
    for (const code of candidate.contradictionCodes) addUnique(contradictions, code);
  }
  if (view.candidates.length > 1) {
    addUnique(contradictions, 'MULTIPLE_DISTINCT_CANDIDATES');
    addUnique(diagnostics, 'MULTIPLE_CANDIDATES');
  }
  if (view.candidates.length === 0) addUnique(diagnostics, 'NO_CANDIDATES');

  let health: IndexHealth;
  if (meta.hasIndexingErrors) {
    health = 'UNHEALTHY';
    addUnique(diagnostics, 'INDEXING_ERRORS');
  } else if (
    trace.chainHead === null ||
    meta.block.timestamp === null ||
    BigInt(trace.chainHead.blockNumber) < BigInt(meta.block.number)
  ) {
    health = 'UNKNOWN_FRESHNESS';
    addUnique(diagnostics, 'UNKNOWN_FRESHNESS');
  } else {
    const lag = BigInt(trace.chainHead.blockNumber) - BigInt(meta.block.number);
    view.lagBlocks = String(lag);
    health = lag > BigInt(policy.maxLagBlocks) ? 'LAGGING' : 'FRESH';
  }

  view.health = health;
  view.contradictionCodes = contradictions;
  view.contradiction = contradictions.length > 0;
  view.diagnostics = diagnostics;
  return { accepted: true, view, issues: [] };
}

export function validateKnownIdentityEvidence(value: unknown): BoundaryIssue[] {
  if (
    !isRecord(value) ||
    !hasExactKeys(value, ['schemaVersion', 'binding', 'local', 'privy', 'arc']) ||
    value.schemaVersion !== RECOVERY_EVIDENCE_VERSION ||
    !validBinding(value.binding)
  ) {
    return [issue('INVALID_RESULT', '$')];
  }
  if (
    !isRecord(value.local) ||
    !hasExactKeys(value.local, [
      'authority',
      'stateVersion',
      'submissionReference',
      'settlementState',
      'persistedAt',
      'digest',
    ]) ||
    value.local.authority !== 'AUTHORITATIVE_ONESHOT' ||
    !isUint(value.local.stateVersion) ||
    !isBoundedString(value.local.submissionReference, 128, SAFE_ID) ||
    !['SUBMITTING', 'UNKNOWN', 'COMMITTED', 'FAILED_SAFE'].includes(
      String(value.local.settlementState),
    ) ||
    !isIsoInstant(value.local.persistedAt) ||
    !isBoundedString(value.local.digest, 64, HASH)
  ) {
    return [issue('INVALID_RESULT', '$.local')];
  }
  if (value.privy !== null) {
    if (
      !isRecord(value.privy) ||
      !hasExactKeys(value.privy, [
        'authority',
        'referenceId',
        'requestFingerprint',
        'requestStatus',
        'transactionHash',
        'retrievedAt',
        'digest',
      ]) ||
      value.privy.authority !== 'PROVIDER_OBSERVATION' ||
      !isBoundedString(value.privy.referenceId, 128, SAFE_ID) ||
      !isBoundedString(value.privy.requestFingerprint, 64, HASH) ||
      value.privy.requestFingerprint !== value.binding.requestFingerprint ||
      !['PENDING', 'SUCCEEDED', 'FAILED', 'NOT_FOUND', 'UNAVAILABLE'].includes(
        String(value.privy.requestStatus),
      ) ||
      !(
        value.privy.transactionHash === null ||
        isBoundedString(value.privy.transactionHash, 66, HEX_32)
      ) ||
      !isIsoInstant(value.privy.retrievedAt) ||
      !isBoundedString(value.privy.digest, 64, HASH)
    ) {
      return [issue('INVALID_RESULT', '$.privy')];
    }
  }
  if (value.arc !== null) {
    if (
      !isRecord(value.arc) ||
      !hasExactKeys(value.arc, [
        'authority',
        'network',
        'transactionHash',
        'submissionReference',
        'receiptStatus',
        'finality',
        'blockNumber',
        'blockHash',
        'blockTimestamp',
        'transfer',
        'retrievedAt',
        'digest',
      ]) ||
      value.arc.authority !== 'AUTHORITATIVE_CHAIN_EVIDENCE' ||
      value.arc.network !== value.binding.network ||
      !isBoundedString(value.arc.transactionHash, 66, HEX_32) ||
      !isBoundedString(value.arc.submissionReference, 128, SAFE_ID) ||
      !['SUCCESS', 'REVERT', 'PENDING', 'NOT_FOUND', 'UNAVAILABLE'].includes(
        String(value.arc.receiptStatus),
      ) ||
      !['FINAL', 'PENDING', 'UNKNOWN'].includes(String(value.arc.finality)) ||
      !(value.arc.blockNumber === null || isUint(value.arc.blockNumber)) ||
      !(value.arc.blockHash === null || isBoundedString(value.arc.blockHash, 66, HEX_32)) ||
      !(value.arc.blockTimestamp === null || isUint(value.arc.blockTimestamp)) ||
      !isIsoInstant(value.arc.retrievedAt) ||
      !isBoundedString(value.arc.digest, 64, HASH)
    ) {
      return [issue('INVALID_RESULT', '$.arc')];
    }
    if (value.arc.transfer !== null) {
      if (
        !isRecord(value.arc.transfer) ||
        !hasExactKeys(value.arc.transfer, [
          'tokenContract',
          'sender',
          'recipient',
          'amountAtomic',
          'logIndex',
        ]) ||
        !isBoundedString(value.arc.transfer.tokenContract, 42, ADDRESS) ||
        !isBoundedString(value.arc.transfer.sender, 42, ADDRESS) ||
        !isBoundedString(value.arc.transfer.recipient, 42, ADDRESS) ||
        !isPositiveUint(value.arc.transfer.amountAtomic) ||
        !isUint(value.arc.transfer.logIndex)
      ) {
        return [issue('INVALID_RESULT', '$.arc.transfer')];
      }
      const binding = value.binding;
      if (
        !sameAddress(value.arc.transfer.tokenContract, binding.tokenContract) ||
        !sameAddress(value.arc.transfer.recipient, binding.recipient) ||
        value.arc.transfer.amountAtomic !== binding.amountAtomic
      ) {
        return [issue('INVALID_IDENTITY', '$.arc.transfer')];
      }
    }
    if (value.arc.submissionReference !== value.local.submissionReference) {
      return [issue('INVALID_IDENTITY', '$.arc.submissionReference')];
    }
    if (
      value.arc.receiptStatus === 'SUCCESS' &&
      (value.arc.finality !== 'FINAL' ||
        value.arc.transfer === null ||
        value.arc.blockNumber === null ||
        value.arc.blockHash === null)
    ) {
      return [issue('INVALID_RESULT', '$.arc')];
    }
    const privyTransactionHash =
      isRecord(value.privy) && isBoundedString(value.privy.transactionHash, 66, HEX_32)
        ? value.privy.transactionHash
        : null;
    if (
      privyTransactionHash !== null &&
      privyTransactionHash.toLowerCase() !== value.arc.transactionHash.toLowerCase()
    ) {
      return [issue('INVALID_IDENTITY', '$.arc.transactionHash')];
    }
  }
  return [];
}

export type { KnownIdentityRecoveryEvidence };
