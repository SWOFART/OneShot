import type { IntentResponse, RecoveryView } from '@oneshot/contracts';
import { describe, expect, it } from 'vitest';

import { createApiRecoveryClient } from '../src/api/recovery-client.js';

const intent: IntentResponse = {
  business_intent_id: 'intent-recovery-1',
  recipient: '0x1111111111111111111111111111111111111111',
  amount_atomic: '1000000',
  asset: 'USDC',
  network: 'eip155:5042002',
  purpose: 'Recovery test',
  payload_fingerprint: 'a'.repeat(64),
  state: 'UNKNOWN',
  version: 7,
  attempts: [
    {
      attempt_id: 'attempt-1',
      stage: 'UNKNOWN',
      created_at: '2026-09-09T08:00:00.000Z',
      sanitized_error: 'Provider response unavailable.',
    },
  ],
  evidence: [],
};

const recovery: RecoveryView = {
  business_intent_id: intent.business_intent_id,
  authoritative_state: 'UNKNOWN',
  recommended_action: 'RECONCILE',
  recommendation_source: 'RECOVERY_AGENT',
  core_disposition: 'READ_ONLY_LOOKUP',
  settlement_permission: 'NEVER',
  agent_decision: {
    accepted: true,
    reason: 'Use read-only discovery.',
    model_name: 'gemini',
    model_version: '2.5-flash',
    prompt_version: 'recovery-v1',
    evidence_references: ['graph-observation-1'],
  },
  core_decision: {
    disposition: 'READ_ONLY_LOOKUP',
    target_state: 'UNKNOWN',
    reason: 'No authoritative Arc proof exists.',
    authoritative_proof_present: false,
    evidence_references: [],
  },
  graph_observation: {
    retrieval_path: 'SUBGRAPH_MCP',
    endpoint_url: 'https://mcp.example.invalid',
    server_name: 'subgraph-mcp',
    server_version: '1.0.0',
    tool_name: 'execute_query_by_deployment_id',
    deployment_id: 'QmDeployment',
    manifest_cid: 'QmManifest',
    observed_through_block: '101',
    observed_through_time: '2026-09-09T08:01:01.000Z',
    health: 'LAGGING',
    available: true,
    candidate_count: 2,
    diagnostics: ['MULTIPLE_CANDIDATES'],
    candidates: [1, 2].map((value) => ({
      candidate_id: `candidate-${value}`,
      transaction_hash: `0x${String(value).repeat(64)}`,
      block_number: String(99 + value),
      binding_status: 'MATCH',
      contradiction_codes: [],
    })),
  },
  evidence: [
    {
      source: 'THE_GRAPH',
      authority_class: 'OBSERVATION',
      retrieved_at: '2026-09-09T08:01:00.000Z',
      digest: 'graph-observation-1',
      block_number: '100',
      freshness: 'LAGGING',
    },
    {
      source: 'THE_GRAPH',
      authority_class: 'OBSERVATION',
      retrieved_at: '2026-09-09T08:01:01.000Z',
      digest: 'graph-observation-2',
      block_number: '101',
      freshness: 'LAGGING',
    },
  ],
};

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json' },
  });
}

describe('createApiRecoveryClient', () => {
  it('projects the frozen API without inventing settlement authority', async () => {
    const headers: Headers[] = [];
    const client = createApiRecoveryClient({
      baseUrl: 'https://api.example',
      getAuthToken: () => 'memory-only-token',
      fetcher: async (input, init) => {
        headers.push(new Headers(init?.headers));
        return String(input).endsWith('/recovery-view') ? json(recovery) : json(intent);
      },
    });

    const page = await client.readPage(intent.business_intent_id, null);
    expect(page).toMatchObject({
      authoritativeState: 'UNKNOWN',
      settlementPermission: 'NEVER',
      recommendation: { accepted: true, action: 'RECONCILE' },
      coreDisposition: { commandType: 'READ_ONLY_LOOKUP', targetState: 'UNKNOWN' },
      graph: { health: 'LAGGING', candidateCount: 2, serverName: 'subgraph-mcp' },
    });
    expect(page.recommendation.modelName).toBe('gemini 2.5-flash');
    expect(page.graph?.diagnostics).toContain('MULTIPLE_CANDIDATES');
    expect(
      headers.every((value) => value.get('authorization') === 'Bearer memory-only-token'),
    ).toBe(true);
    expect(client.supportsEscalation).toBe(false);
  });

  it('fails closed when the service is unavailable', async () => {
    const client = createApiRecoveryClient({ fetcher: async () => json({}, 503) });
    await expect(client.readPage(intent.business_intent_id, null)).rejects.toThrow(
      'Recovery API request failed with 503',
    );
  });

  it('does not infer that an omitted Agent decision was accepted', async () => {
    const incompleteRecovery = Object.fromEntries(
      Object.entries(recovery).filter(([key]) => key !== 'agent_decision'),
    ) as unknown as RecoveryView;
    const client = createApiRecoveryClient({
      fetcher: async (input) =>
        String(input).endsWith('/recovery-view') ? json(incompleteRecovery) : json(intent),
    });

    const page = await client.readPage(intent.business_intent_id, null);
    expect(page.recommendation.accepted).toBe(false);
  });
});
