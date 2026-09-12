import type { EvidenceView, IntentResponse, RecoveryView } from '@oneshot/contracts';
import {
  parseRecoveryTimelinePage,
  type CoreDisposition,
  type EvidenceSummary,
  type GraphObservationSummary,
  type RecoveryClient,
  type RecoveryState,
  type RecoveryTimelinePage,
} from '@oneshot/recovery-ui';

export interface ApiRecoveryClientOptions {
  readonly baseUrl?: string;
  readonly getAuthToken?: () => string | null;
  readonly fetcher?: typeof fetch;
}

function recoveryState(state: IntentResponse['state']): RecoveryState {
  if (
    state === 'SUBMITTING' ||
    state === 'UNKNOWN' ||
    state === 'COMMITTED' ||
    state === 'FAILED_SAFE'
  ) {
    return state;
  }
  throw new Error(`Recovery view is unavailable for authoritative state ${state}`);
}

function authorityFor(evidence: EvidenceView): EvidenceSummary['authorityClass'] {
  if (evidence.source === 'ONESHOT' && evidence.authority_class === 'AUTHORITATIVE') {
    return 'AUTHORITATIVE_ONESHOT';
  }
  if (evidence.source === 'ARC' && evidence.authority_class === 'AUTHORITATIVE') {
    return 'AUTHORITATIVE_CHAIN_EVIDENCE';
  }
  if (evidence.source === 'THE_GRAPH') return 'NON_AUTHORITATIVE_CANDIDATE_DISCOVERY';
  if (evidence.source === 'LLM') return 'ADVISORY_AGENT_OBSERVATION';
  return 'PROVIDER_OBSERVATION';
}

function maxBlock(evidence: readonly EvidenceView[]): string | null {
  let highest: bigint | null = null;
  for (const item of evidence) {
    if (item.block_number === undefined) continue;
    const current = BigInt(item.block_number);
    if (highest === null || current > highest) highest = current;
  }
  return highest?.toString() ?? null;
}

function graphSummary(view: RecoveryView): GraphObservationSummary | null {
  if (view.graph_observation) {
    const graph = view.graph_observation;
    return {
      retrievalPath: graph.retrieval_path,
      endpointUrl: graph.endpoint_url,
      serverName: graph.server_name ?? null,
      serverVersion: graph.server_version ?? null,
      toolName: graph.tool_name ?? null,
      deploymentId: graph.deployment_id,
      manifestCid: graph.manifest_cid,
      observedThroughBlock: graph.observed_through_block ?? null,
      observedThroughTime: graph.observed_through_time ?? null,
      chainHeadBlock: null,
      lagBlocks: null,
      health: graph.health,
      available: graph.available,
      candidateCount: graph.candidate_count,
      diagnostics: graph.diagnostics,
      candidates: graph.candidates.map((candidate) => ({
        candidateId: candidate.candidate_id,
        transactionHash: candidate.transaction_hash,
        blockNumber: candidate.block_number,
        bindingStatus: candidate.binding_status,
        contradictionCodes: candidate.contradiction_codes,
      })),
    };
  }
  const observations = view.evidence.filter((item) => item.source === 'THE_GRAPH');
  if (observations.length === 0) return null;
  const health = observations.some((item) => item.freshness === 'UNAVAILABLE')
    ? 'UNAVAILABLE'
    : observations.some((item) => item.freshness === 'UNHEALTHY')
      ? 'UNHEALTHY'
      : observations.some((item) => item.freshness === 'LAGGING')
        ? 'LAGGING'
        : observations.some((item) => item.freshness === 'UNKNOWN_FRESHNESS')
          ? 'UNKNOWN_FRESHNESS'
          : 'FRESH';
  const diagnostics = [
    'CANDIDATE_DETAILS_WITHHELD',
    ...(observations.length > 1 ? ['MULTIPLE_CANDIDATES'] : []),
  ];
  return {
    retrievalPath: 'UNKNOWN',
    endpointUrl: 'Identity not exposed by frozen API',
    serverName: null,
    serverVersion: null,
    toolName: null,
    deploymentId: 'Not exposed by frozen API',
    manifestCid: 'Not exposed by frozen API',
    observedThroughBlock: maxBlock(observations),
    observedThroughTime: null,
    chainHeadBlock: null,
    lagBlocks: null,
    health,
    available: health !== 'UNAVAILABLE',
    candidateCount: 0,
    diagnostics,
    candidates: [],
  };
}

function coreDisposition(view: RecoveryView): CoreDisposition {
  if (view.core_disposition !== undefined) return view.core_disposition;
  if (view.authoritative_state === 'COMMITTED') return 'MARK_COMMITTED';
  if (view.authoritative_state === 'FAILED_SAFE') return 'MARK_FAILED_SAFE';
  return 'HOLD_UNKNOWN';
}

function project(intent: IntentResponse, view: RecoveryView): RecoveryTimelinePage {
  if (intent.business_intent_id !== view.business_intent_id) {
    throw new Error('Recovery response identity mismatch');
  }
  const state = recoveryState(intent.state);
  const evaluatedAt =
    view.evidence.at(-1)?.retrieved_at ??
    intent.attempts.at(-1)?.created_at ??
    new Date().toISOString();
  const evidence = view.evidence.map((item, index): EvidenceSummary => ({
    evidenceId: `${item.source.toLowerCase()}:${index}:${item.digest}`,
    source: item.source,
    authorityClass: authorityFor(item),
    retrievedAt: item.retrieved_at,
    finality:
      item.source === 'ARC' && item.authority_class === 'AUTHORITATIVE' && state === 'COMMITTED'
        ? 'FINAL'
        : null,
    blockNumber: item.block_number ?? null,
    digest: item.digest,
    summary: `${item.source} ${item.authority_class.toLowerCase()} evidence recorded by OneShot.`,
    verifiedBinding: item.authority_class === 'AUTHORITATIVE',
    contradictionCodes: [],
  }));
  const disposition = coreDisposition(view);
  const agentDecision = view.recommendation_source === 'RECOVERY_AGENT';
  const proofPresent = evidence.some(
    (item) => item.authorityClass === 'AUTHORITATIVE_CHAIN_EVIDENCE' && item.finality === 'FINAL',
  );
  const page: RecoveryTimelinePage = {
    schemaVersion: 'recovery-timeline-v1',
    businessIntentId: intent.business_intent_id,
    authoritativeState: state,
    stateVersion: String(intent.version),
    settlementPermission: 'NEVER',
    evaluatedAt,
    summary:
      state === 'UNKNOWN'
        ? 'Settlement outcome remains unknown. New settlement is blocked while evidence is reconciled.'
        : `Intent is ${state}.`,
    attempts: intent.attempts.map((attempt) => ({
      attemptId: attempt.attempt_id,
      stage: attempt.stage,
      createdAt: attempt.created_at,
      completedAt: null,
      sanitizedError: attempt.sanitized_error ?? null,
    })),
    timeline: evidence.map((item, index) => ({
      eventId: item.evidenceId,
      kind: 'EVIDENCE',
      timestamp: item.retrievedAt,
      sequence: String(index + 1),
      title: `${item.source} evidence`,
      summary: item.summary,
      source: item.source,
      authorityClass: item.authorityClass,
      evidenceReferences: [item.evidenceId],
    })),
    evidence,
    graph: graphSummary(view),
    recommendation: {
      accepted: view.agent_decision?.accepted ?? false,
      action: view.recommended_action,
      reason:
        view.agent_decision?.reason ??
        (agentDecision
          ? 'Persisted Recovery Agent recommendation returned by the frozen API.'
          : 'No persisted Recovery Agent decision exists; the API returned its fail-closed fallback.'),
      modelName: view.agent_decision
        ? `${view.agent_decision.model_name} ${view.agent_decision.model_version}`
        : agentDecision
          ? 'Identity not exposed by frozen API'
          : 'Unavailable',
      promptVersion: view.agent_decision?.prompt_version ?? 'Not exposed by frozen API',
      evidenceReferences:
        view.agent_decision?.evidence_references ?? evidence.map((item) => item.evidenceId),
    },
    coreDisposition: {
      commandType: view.core_decision?.disposition ?? disposition,
      targetState:
        view.core_decision?.target_state ??
        (disposition === 'MARK_COMMITTED'
          ? 'COMMITTED'
          : disposition === 'MARK_FAILED_SAFE'
            ? 'FAILED_SAFE'
            : 'UNKNOWN'),
      reason:
        view.core_decision?.reason ??
        (view.core_disposition === undefined
          ? 'No persisted core decision was exposed; the UI applied a fail-closed display fallback.'
          : 'Persisted deterministic core disposition returned by the frozen API.'),
      authoritativeProofPresent: view.core_decision?.authoritative_proof_present ?? proofPresent,
      evidenceReferences:
        view.core_decision?.evidence_references ??
        evidence
          .filter((item) => item.authorityClass.startsWith('AUTHORITATIVE'))
          .map((item) => item.evidenceId),
    },
    contradiction: view.contradiction ?? false,
    contradictionCodes: view.contradiction_codes ?? [],
    diagnostics: [
      ...(view.diagnostics ?? []),
      ...(view.recommendation_source === undefined ? ['LEGACY_RECOVERY_VIEW'] : []),
    ],
    page: { cursor: null, nextCursor: null, totalEntries: evidence.length },
  };
  return parseRecoveryTimelinePage(page);
}

export function createApiRecoveryClient(options: ApiRecoveryClientOptions = {}): RecoveryClient {
  const baseUrl = (options.baseUrl ?? '').replace(/\/+$/u, '');
  const fetcher = options.fetcher ?? globalThis.fetch;

  async function readJson<T>(path: string): Promise<T> {
    const token = options.getAuthToken?.();
    const response = await fetcher(`${baseUrl}${path}`, {
      headers: {
        accept: 'application/json',
        ...(token ? { authorization: `Bearer ${token}` } : {}),
      },
    });
    if (!response.ok) throw new Error(`Recovery API request failed with ${response.status}`);
    return response.json() as Promise<T>;
  }

  return {
    supportsEscalation: false,
    async readPage(businessIntentId, cursor) {
      if (cursor !== null) throw new Error('The frozen recovery API is not paginated');
      const id = encodeURIComponent(businessIntentId);
      const [intent, view] = await Promise.all([
        readJson<IntentResponse>(`/v1/intents/${id}`),
        readJson<RecoveryView>(`/v1/intents/${id}/recovery-view`),
      ]);
      return project(intent, view);
    },
    async refresh(businessIntentId) {
      await readJson<RecoveryView>(
        `/v1/intents/${encodeURIComponent(businessIntentId)}/recovery-view`,
      );
      return {
        schemaVersion: 'recovery-action-receipt-v1',
        businessIntentId,
        action: 'REFRESH_STATUS',
        accepted: true,
        message: 'Status refreshed. No settlement action was created.',
      };
    },
    async escalate() {
      throw new Error('Operator escalation is not exposed by the frozen API');
    },
  };
}
