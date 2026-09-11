import { describe, expect, it, vi } from 'vitest';

import { createScenario, LiveSubgraphMcpRecoveryPort, MCP_TOOL_NAME } from '../src/index.js';

const STUDIO_URL = 'https://api.studio.thegraph.com/query/1758917/oneshot-arc-testnet/v0.2.1';

function studioPayload(scenario: ReturnType<typeof createScenario>): Record<string, unknown> {
  return JSON.parse(
    (scenario.trace.result as { content: Array<{ text: string }> }).content[0].text,
  ) as Record<string, unknown>;
}

function studioPort(
  scenario: ReturnType<typeof createScenario>,
  payload: unknown,
  fetchFn?: typeof fetch,
) {
  return new LiveSubgraphMcpRecoveryPort({
    graphQueryUrl: STUDIO_URL,
    graphApiKey: 'studio-secret-test-only',
    getChainHead: async () => scenario.trace.chainHead,
    fetchFn:
      fetchFn ??
      (vi.fn().mockResolvedValue({
        ok: true,
        status: 200,
        json: async () => payload,
      }) as unknown as typeof fetch),
    now: () => '2026-09-08T22:00:00.000Z',
  });
}

describe('LiveSubgraphMcpRecoveryPort', () => {
  it('performs lookup via MCP endpoint and normalizes trace', async () => {
    const freshScenario = createScenario('fresh');
    const mockFetch = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({
        jsonrpc: '2.0',
        id: 'call-1',
        result: freshScenario.trace.result,
      }),
    } as Response);

    const port = new LiveSubgraphMcpRecoveryPort({
      mcpEndpoint: 'http://localhost:3001/mcp',
      graphApiKey: 'test-api-key',
      getChainHead: async () => freshScenario.trace.chainHead,
      fetchFn: mockFetch as unknown as typeof fetch,
      now: () => '2026-09-08T22:00:00.000Z',
    });

    const outcome = await port.lookup(freshScenario.request, freshScenario.policy);

    expect(mockFetch).toHaveBeenCalledTimes(1);
    const [url, init] = mockFetch.mock.calls[0];
    expect(url).toBe('http://localhost:3001/mcp');
    expect(init.headers.Authorization).toBe('Bearer test-api-key');

    const parsedBody = JSON.parse(init.body as string);
    expect(parsedBody.method).toBe('tools/call');
    expect(parsedBody.params.name).toBe(MCP_TOOL_NAME);

    expect(outcome.accepted).toBe(true);
    expect(outcome.view.health).toBe('FRESH');
    expect(outcome.view.settlementPermission).toBe('NEVER');
  });

  it('performs lookup via Graph Gateway endpoint when mcpEndpoint is omitted', async () => {
    const freshScenario = createScenario('fresh');
    const rawGraphQLPayload = JSON.parse(
      (freshScenario.trace.result as { content: Array<{ text: string }> }).content[0].text,
    );
    const mockFetch = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => rawGraphQLPayload,
    } as Response);

    const port = new LiveSubgraphMcpRecoveryPort({
      graphApiKey: 'test-key-123',
      getChainHead: async () => freshScenario.trace.chainHead,
      fetchFn: mockFetch as unknown as typeof fetch,
      now: () => '2026-09-08T22:00:00.000Z',
    });

    const outcome = await port.lookup(freshScenario.request, freshScenario.policy);

    expect(mockFetch).toHaveBeenCalledTimes(1);
    const [url, init] = mockFetch.mock.calls[0];
    expect(url).toContain(
      'https://gateway-arbitrum.network.thegraph.com/api/test-key-123/deployments/id/',
    );
    const parsedBody = JSON.parse(init.body as string);
    expect(parsedBody.query).toContain('query OneShotRecoveryCandidatesV1');

    expect(outcome.accepted).toBe(true);
    expect(outcome.view.health).toBe('FRESH');
  });

  it('throws an error when the server returns an HTTP error status', async () => {
    const freshScenario = createScenario('fresh');
    const mockFetch = vi.fn().mockResolvedValue({
      ok: false,
      status: 502,
      json: async () => ({}),
    } as Response);

    const port = new LiveSubgraphMcpRecoveryPort({
      mcpEndpoint: 'http://localhost:3001/mcp',
      fetchFn: mockFetch as unknown as typeof fetch,
      now: () => '2026-09-08T22:00:00.000Z',
    });

    await expect(port.lookup(freshScenario.request, freshScenario.policy)).rejects.toThrow(
      'Subgraph MCP server returned HTTP 502',
    );
  });

  it('performs lookup via direct graphQueryUrl with native settlementCandidates', async () => {
    const freshScenario = createScenario('fresh');
    const mockStudioResponse = {
      data: {
        settlementCandidates: [
          {
            id: '0x72ab1e93c95e5295b2dfa9b3abc8cc5130330f3bba07ad18af2c5b7784f57cf717000000',
            transactionHash: '0x72ab1e93c95e5295b2dfa9b3abc8cc5130330f3bba07ad18af2c5b7784f57cf7',
            logIndex: '23',
            blockNumber: '61116056',
            blockHash: '0xc2e18d2ee52e8e046a5f70329265aba27285f7d257bb765d417a7c5613bf4b1b',
            blockTimestamp: '1788893876',
            network: 'eip155:5042002',
            tokenContract: freshScenario.request.binding.tokenContract,
            sender: freshScenario.request.correlation.sender,
            recipient: freshScenario.request.binding.recipient,
            amountAtomic: freshScenario.request.binding.amountAtomic,
            memoId: null,
          },
        ],
        _meta: {
          deployment: freshScenario.policy.manifestCid,
          hasIndexingErrors: false,
          block: {
            number: 114,
            hash: '0x' + '1'.repeat(64),
            timestamp: 1788913000,
          },
        },
      },
    };

    const mockFetch = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => mockStudioResponse,
    } as Response);

    const studioUrl = STUDIO_URL;
    const port = new LiveSubgraphMcpRecoveryPort({
      graphQueryUrl: studioUrl,
      graphApiKey: 'studio-secret-test-only',
      getChainHead: async () => freshScenario.trace.chainHead,
      fetchFn: mockFetch as unknown as typeof fetch,
      now: () => '2026-09-08T22:00:00.000Z',
    });

    const outcome = await port.lookup(freshScenario.request, freshScenario.policy);

    expect(mockFetch).toHaveBeenCalledTimes(1);
    const [url, init] = mockFetch.mock.calls[0];
    expect(url).toBe(studioUrl);
    const parsedBody = JSON.parse(init.body as string);
    expect(parsedBody.query).toContain('query OneShotRecoveryCandidatesV1');
    expect(init.headers.Authorization).toBe('Bearer studio-secret-test-only');
    expect(init.body).not.toContain('studio-secret-test-only');

    expect(outcome.accepted).toBe(true);
    expect(outcome.view.health).toBe('FRESH');
    expect(outcome.view.candidateCount).toBe(1);
    expect(outcome.view.candidates[0].transactionHash).toBe(
      '0x72ab1e93c95e5295b2dfa9b3abc8cc5130330f3bba07ad18af2c5b7784f57cf7',
    );
    expect(outcome.view.candidates[0].blockHash).toBe(
      '0xc2e18d2ee52e8e046a5f70329265aba27285f7d257bb765d417a7c5613bf4b1b',
    );
    expect(outcome.view.source.retrieval).toBe('STUDIO_GRAPHQL');
    expect(outcome.view.graph.endpointUrl).toBe(studioUrl);
    expect(outcome.view.graph.serverName).toBeUndefined();
    expect(outcome.view.graph.toolName).toBeUndefined();
  });

  it('keeps an empty direct Studio result accepted as non-authoritative absence', async () => {
    const scenario = createScenario('fresh');
    const payload = studioPayload(scenario);
    const data = payload.data as Record<string, unknown>;
    data.settlementCandidates = [];
    const outcome = await studioPort(scenario, payload).lookup(scenario.request, {
      ...scenario.policy,
      retrieval: 'STUDIO_GRAPHQL',
      queryUrl: STUDIO_URL,
    });

    expect(outcome.accepted).toBe(true);
    expect(outcome.view.health).toBe('FRESH');
    expect(outcome.view.diagnostics).toContain('NO_CANDIDATES');
    expect(outcome.view.settlementPermission).toBe('NEVER');
  });

  it('classifies stale Studio metadata as lagging', async () => {
    const scenario = createScenario('fresh');
    const payload = studioPayload(scenario);
    const meta = (payload.data as Record<string, unknown>)._meta as Record<string, unknown>;
    meta.block = { ...(meta.block as object), number: 100 };
    const outcome = await studioPort(scenario, payload).lookup(scenario.request, {
      ...scenario.policy,
      retrieval: 'STUDIO_GRAPHQL',
      queryUrl: STUDIO_URL,
      maxLagBlocks: '5',
    });
    expect(outcome.view.health).toBe('LAGGING');
    expect(outcome.view.lagBlocks).toBe('14');
  });

  it('rejects wrong deployment and malformed Studio responses', async () => {
    const scenario = createScenario('fresh');
    const wrongDeployment = studioPayload(scenario);
    (wrongDeployment.data as Record<string, unknown>)._meta = {
      ...(wrongDeployment.data as Record<string, unknown>)._meta,
      deployment: `Qm${'b'.repeat(44)}`,
    };
    const wrong = await studioPort(scenario, wrongDeployment).lookup(scenario.request, {
      ...scenario.policy,
      retrieval: 'STUDIO_GRAPHQL',
      queryUrl: STUDIO_URL,
    });
    expect(wrong.accepted).toBe(false);
    expect(wrong.view.diagnostics).toContain('WRONG_DEPLOYMENT');

    const malformed = await studioPort(scenario, { data: {} }).lookup(scenario.request, {
      ...scenario.policy,
      retrieval: 'STUDIO_GRAPHQL',
      queryUrl: STUDIO_URL,
    });
    expect(malformed.accepted).toBe(false);
    expect(malformed.issues[0]?.code).toBe('INVALID_RESULT');
  });

  it('rejects oversized, timed-out, and ambiguous Studio responses', async () => {
    const scenario = createScenario('fresh');
    const oversized = { ...studioPayload(scenario), padding: 'x'.repeat(70_000) };
    const tooLarge = await studioPort(scenario, oversized).lookup(scenario.request, {
      ...scenario.policy,
      retrieval: 'STUDIO_GRAPHQL',
      queryUrl: STUDIO_URL,
      maxResultBytes: 1_024,
    });
    expect(tooLarge.accepted).toBe(false);
    expect(tooLarge.issues[0]?.code).toBe('RESULT_TOO_LARGE');

    const timeout = studioPort(
      scenario,
      studioPayload(scenario),
      vi.fn().mockRejectedValue(new Error('timeout')) as unknown as typeof fetch,
    );
    await expect(
      timeout.lookup(scenario.request, {
        ...scenario.policy,
        retrieval: 'STUDIO_GRAPHQL',
        queryUrl: STUDIO_URL,
      }),
    ).rejects.toThrow('timeout');

    const ambiguous = studioPayload(scenario);
    const candidates = (ambiguous.data as Record<string, unknown>)
      .settlementCandidates as unknown[];
    (ambiguous.data as Record<string, unknown>).settlementCandidates = [
      ...candidates,
      { ...(candidates[0] as Record<string, unknown>), id: 'candidate-2', logIndex: '24' },
    ];
    const multiple = await studioPort(scenario, ambiguous).lookup(scenario.request, {
      ...scenario.policy,
      retrieval: 'STUDIO_GRAPHQL',
      queryUrl: STUDIO_URL,
    });
    expect(multiple.accepted).toBe(true);
    expect(multiple.view.diagnostics).toContain('MULTIPLE_CANDIDATES');
    expect(multiple.view.contradictionCodes).toContain('MULTIPLE_DISTINCT_CANDIDATES');
  });
});
