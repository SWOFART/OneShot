import {
  RECOVERY_MOCK_SERVER_VERSION,
  RECOVERY_TIMELINE_VERSION,
  type CoreDisposition,
  type GraphObservationSummary,
  type IndexHealth,
  type RecoveryAction,
  type RecoveryState,
  type RecoveryTimelinePage,
} from './contract.js';

export const RECOVERY_SCENARIOS = [
  'fresh-wait',
  'fresh-reconcile',
  'fresh-escalate',
  'committed-return-existing',
  'invalid-output',
  'empty',
  'lagging',
  'unhealthy',
  'unavailable',
  'fallback-disabled',
  'contradictory',
  'pending',
  'committed',
  'failed-safe',
  'aged-unknown',
] as const;

export type RecoveryScenario = (typeof RECOVERY_SCENARIOS)[number];

export function isRecoveryScenario(value: string | null): value is RecoveryScenario {
  return value !== null && RECOVERY_SCENARIOS.some((scenario) => scenario === value);
}

const INTENT_ID = 'intent_demo_018f';
const EVALUATED_AT = '2026-09-08T06:00:30.000Z';
const TX_HASH = `0x${'a'.repeat(64)}`;

interface ScenarioOptions {
  readonly state?: RecoveryState;
  readonly action?: RecoveryAction;
  readonly accepted?: boolean;
  readonly commandType?: CoreDisposition;
  readonly targetState?: 'UNKNOWN' | 'COMMITTED' | 'FAILED_SAFE';
  readonly proof?: boolean;
  readonly graphHealth?: IndexHealth;
  readonly graphAvailable?: boolean;
  readonly observedThroughBlock?: string | null;
  readonly lagBlocks?: string | null;
  readonly candidateMode?: 'MATCH' | 'EMPTY' | 'CONTRADICTORY';
  readonly graphHidden?: boolean;
  readonly contradiction?: boolean;
  readonly diagnostics?: readonly string[];
  readonly aged?: boolean;
}

function graphFixture(options: ScenarioOptions): GraphObservationSummary | null {
  if (options.graphHidden) return null;
  const mode = options.candidateMode ?? 'MATCH';
  const candidates =
    mode === 'EMPTY'
      ? []
      : [
          {
            candidateId: 'candidate_arc_701',
            transactionHash: TX_HASH,
            blockNumber: '701',
            bindingStatus:
              mode === 'CONTRADICTORY' ? ('CONTRADICTORY' as const) : ('MATCH' as const),
            contradictionCodes:
              mode === 'CONTRADICTORY' ? (['RECIPIENT_MISMATCH'] as const) : ([] as const),
          },
        ];
  return {
    retrievalPath: 'SUBGRAPH_MCP',
    serverName: 'graph-mcp',
    serverVersion: '1.4.0',
    toolName: 'execute_query_by_deployment_id',
    deploymentId: 'QmOneShotArcRecoveryV1',
    manifestCid: 'QmOneShotManifestV1',
    observedThroughBlock:
      options.observedThroughBlock === undefined ? '704' : options.observedThroughBlock,
    observedThroughTime: '2026-09-08T06:00:18.000Z',
    chainHeadBlock: '706',
    lagBlocks: options.lagBlocks === undefined ? '2' : options.lagBlocks,
    health: options.graphHealth ?? 'FRESH',
    available: options.graphAvailable ?? true,
    candidateCount: candidates.length,
    diagnostics: options.diagnostics ?? [],
    candidates,
  };
}

function makeScenario(options: ScenarioOptions = {}): readonly RecoveryTimelinePage[] {
  const state = options.state ?? 'UNKNOWN';
  const action = options.action ?? 'WAIT';
  const accepted = options.accepted ?? true;
  const commandType = options.commandType ?? 'HOLD_UNKNOWN';
  const targetState = options.targetState ?? 'UNKNOWN';
  const proof = options.proof ?? false;
  const contradiction = options.contradiction ?? options.candidateMode === 'CONTRADICTORY';
  const graph = graphFixture(options);
  const diagnostics = options.diagnostics ?? [];
  const ageMessage = options.aged
    ? 'UNKNOWN for 46 minutes. Settlement remains blocked; operator escalation is recommended.'
    : 'Submission outcome is unresolved. Settlement remains blocked while evidence is reconciled.';

  const common = {
    schemaVersion: RECOVERY_TIMELINE_VERSION,
    mockServerVersion: RECOVERY_MOCK_SERVER_VERSION,
    businessIntentId: INTENT_ID,
    authoritativeState: state,
    stateVersion: '12',
    settlementPermission: 'NEVER' as const,
    evaluatedAt: EVALUATED_AT,
    summary: state === 'UNKNOWN' ? ageMessage : `Intent is ${state}.`,
    attempts: [
      {
        attemptId: 'attempt_01',
        stage: 'UNKNOWN',
        createdAt: '2026-09-08T05:58:00.000Z',
        completedAt: null,
        sanitizedError: 'Provider response was not received after possible submission.',
      },
      {
        attemptId: 'attempt_00',
        stage: 'FAILED_SAFE',
        createdAt: '2026-09-08T05:55:00.000Z',
        completedAt: '2026-09-08T05:55:02.000Z',
        sanitizedError: 'Authorization was unavailable before submission.',
      },
    ],
    evidence: [
      {
        evidenceId: 'oneshot:state:12',
        source: 'ONESHOT' as const,
        authorityClass: 'AUTHORITATIVE_ONESHOT' as const,
        retrievedAt: '2026-09-08T06:00:00.000Z',
        finality: null,
        blockNumber: null,
        digest: 'sha256:local-state-12',
        summary: `Durable state version 12 records ${state}.`,
        verifiedBinding: true,
        contradictionCodes: [] as const,
      },
      {
        evidenceId: 'privy:request:89',
        source: 'PRIVY' as const,
        authorityClass: 'PROVIDER_OBSERVATION' as const,
        retrievedAt: '2026-09-08T06:00:04.000Z',
        finality: 'UNKNOWN' as const,
        blockNumber: null,
        digest: 'sha256:privy-request-89',
        summary: 'Privy request accepted; transaction identity was not returned.',
        verifiedBinding: true,
        contradictionCodes: [] as const,
      },
      ...(proof
        ? [
            {
              evidenceId: 'arc:receipt:701',
              source: 'ARC' as const,
              authorityClass: 'AUTHORITATIVE_CHAIN_EVIDENCE' as const,
              retrievedAt: '2026-09-08T06:00:24.000Z',
              finality: 'FINAL' as const,
              blockNumber: '701',
              digest: 'sha256:arc-receipt-701',
              summary: 'Arc receipt and transfer log match the durable intent binding.',
              verifiedBinding: true,
              contradictionCodes: [] as const,
            },
          ]
        : []),
    ],
    graph,
    recommendation: {
      accepted,
      action,
      reason: accepted
        ? `Advisor recommends ${action} from referenced sanitized evidence.`
        : 'Advisor output was rejected at the recovery boundary; safe fallback applied.',
      modelName: 'recovery-advisor-demo',
      promptVersion: 'recovery-prompt-v1',
      evidenceReferences: ['oneshot:state:12'],
    },
    coreDisposition: {
      commandType,
      targetState,
      reason: proof
        ? 'Deterministic core found independently verified Arc proof.'
        : 'Deterministic core found no authoritative proof for a terminal transition.',
      authoritativeProofPresent: proof,
      evidenceReferences: proof ? ['oneshot:state:12', 'arc:receipt:701'] : ['oneshot:state:12'],
    },
    contradiction,
    contradictionCodes: contradiction ? (['RECIPIENT_MISMATCH'] as const) : ([] as const),
    diagnostics,
  };

  const recent: RecoveryTimelinePage = {
    ...common,
    timeline: [
      {
        eventId: 'decision-12',
        kind: 'DECISION',
        timestamp: '2026-09-08T06:00:30.000Z',
        sequence: '12',
        title: `Core disposition: ${commandType}`,
        summary: common.coreDisposition.reason,
        source: 'ONESHOT',
        authorityClass: 'AUTHORITATIVE_ONESHOT',
        evidenceReferences: common.coreDisposition.evidenceReferences,
      },
      {
        eventId: 'advisor-12',
        kind: 'DECISION',
        timestamp: '2026-09-08T06:00:28.000Z',
        sequence: '11',
        title: `Advisor: ${action}`,
        summary: common.recommendation.reason,
        source: 'LLM',
        authorityClass: 'ADVISORY_AGENT_OBSERVATION',
        evidenceReferences: common.recommendation.evidenceReferences,
      },
      {
        eventId: 'graph-observation-10',
        kind: 'EVIDENCE',
        timestamp: '2026-09-08T06:00:18.000Z',
        sequence: null,
        title: 'Subgraph MCP observation',
        summary: graph === null ? 'Graph discovery disabled.' : `Graph health: ${graph.health}.`,
        source: 'THE_GRAPH',
        authorityClass: 'NON_AUTHORITATIVE_CANDIDATE_DISCOVERY',
        evidenceReferences: graph?.candidates.map((candidate) => candidate.candidateId) ?? [],
      },
    ],
    page: { cursor: null, nextCursor: 'older', totalEntries: 5 },
  };

  const older: RecoveryTimelinePage = {
    ...common,
    timeline: [
      {
        eventId: 'graph-observation-10',
        kind: 'EVIDENCE',
        timestamp: '2026-09-08T06:00:18.000Z',
        sequence: null,
        title: 'Subgraph MCP observation',
        summary: graph === null ? 'Graph discovery disabled.' : `Graph health: ${graph.health}.`,
        source: 'THE_GRAPH',
        authorityClass: 'NON_AUTHORITATIVE_CANDIDATE_DISCOVERY',
        evidenceReferences: graph?.candidates.map((candidate) => candidate.candidateId) ?? [],
      },
      {
        eventId: 'privy-observation-09',
        kind: 'EVIDENCE',
        timestamp: '2026-09-08T06:00:04.000Z',
        sequence: null,
        title: 'Privy lookup',
        summary: 'Provider observation has no transaction hash.',
        source: 'PRIVY',
        authorityClass: 'PROVIDER_OBSERVATION',
        evidenceReferences: ['privy:request:89'],
      },
      {
        eventId: 'submission-unknown-08',
        kind: 'TRANSITION',
        timestamp: '2026-09-08T06:00:04.000Z',
        sequence: null,
        title: 'State changed to UNKNOWN',
        summary: 'Response was lost after possible submission. No retry right was granted.',
        source: 'ONESHOT',
        authorityClass: 'AUTHORITATIVE_ONESHOT',
        evidenceReferences: ['oneshot:state:12'],
      },
    ],
    page: { cursor: 'older', nextCursor: null, totalEntries: 5 },
  };
  return [recent, older];
}

export const recoveryScenarioPages: Readonly<
  Record<RecoveryScenario, readonly RecoveryTimelinePage[]>
> = {
  'fresh-wait': makeScenario(),
  'fresh-reconcile': makeScenario({ action: 'RECONCILE', commandType: 'READ_ONLY_LOOKUP' }),
  'fresh-escalate': makeScenario({ action: 'ESCALATE', commandType: 'ESCALATE_UNKNOWN' }),
  'committed-return-existing': makeScenario({
    state: 'COMMITTED',
    action: 'RETURN_EXISTING_RESULT',
    commandType: 'MARK_COMMITTED',
    targetState: 'COMMITTED',
    proof: true,
  }),
  'invalid-output': makeScenario({ accepted: false, diagnostics: ['ADVISOR_BOUNDARY_REJECTED'] }),
  empty: makeScenario({
    candidateMode: 'EMPTY',
    observedThroughBlock: '704',
    diagnostics: ['NO_CANDIDATES'],
  }),
  lagging: makeScenario({ graphHealth: 'LAGGING', lagBlocks: '42', diagnostics: ['INDEX_LAG'] }),
  unhealthy: makeScenario({ graphHealth: 'UNHEALTHY', diagnostics: ['INDEXING_ERRORS'] }),
  unavailable: makeScenario({
    graphHealth: 'UNAVAILABLE',
    graphAvailable: false,
    observedThroughBlock: null,
    lagBlocks: null,
    candidateMode: 'EMPTY',
    diagnostics: ['MCP_UNAVAILABLE'],
  }),
  'fallback-disabled': makeScenario({
    graphHidden: true,
    diagnostics: ['GRAPH_FALLBACK_SELECTED'],
  }),
  contradictory: makeScenario({
    candidateMode: 'CONTRADICTORY',
    contradiction: true,
    diagnostics: ['MULTIPLE_CANDIDATES'],
  }),
  pending: makeScenario({ state: 'SUBMITTING', commandType: 'HOLD_UNKNOWN' }),
  committed: makeScenario({
    state: 'COMMITTED',
    action: 'RETURN_EXISTING_RESULT',
    commandType: 'MARK_COMMITTED',
    targetState: 'COMMITTED',
    proof: true,
  }),
  'failed-safe': makeScenario({
    state: 'FAILED_SAFE',
    commandType: 'MARK_FAILED_SAFE',
    targetState: 'FAILED_SAFE',
  }),
  'aged-unknown': makeScenario({
    action: 'ESCALATE',
    commandType: 'ESCALATE_UNKNOWN',
    aged: true,
    diagnostics: ['AGED_UNKNOWN'],
  }),
};

export function scenarioPage(
  scenario: RecoveryScenario,
  cursor: string | null,
): RecoveryTimelinePage | null {
  return recoveryScenarioPages[scenario].find((page) => page.page.cursor === cursor) ?? null;
}
