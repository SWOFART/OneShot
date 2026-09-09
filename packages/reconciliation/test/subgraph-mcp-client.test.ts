import { describe, expect, it, vi } from 'vitest';

import { createScenario, LiveSubgraphMcpRecoveryPort, MCP_TOOL_NAME } from '../src/index.js';

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

  it('performs lookup via direct graphQueryUrl and adapts Studio usdcTransfers', async () => {
    const freshScenario = createScenario('fresh');
    const mockStudioResponse = {
      data: {
        usdcTransfers: [
          {
            id: '0x72ab1e93c95e5295b2dfa9b3abc8cc5130330f3bba07ad18af2c5b7784f57cf717000000',
            transactionHash: '0x72ab1e93c95e5295b2dfa9b3abc8cc5130330f3bba07ad18af2c5b7784f57cf7',
            logIndex: '23',
            blockNumber: '61116056',
            blockTimestamp: '1788893876',
            from: freshScenario.request.correlation.sender,
            to: freshScenario.request.binding.recipient,
            amount: freshScenario.request.binding.amountAtomic,
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

    const studioUrl =
      'https://api.studio.thegraph.com/query/1758917/oneshot-arc-testnet/version/latest';
    const port = new LiveSubgraphMcpRecoveryPort({
      graphQueryUrl: studioUrl,
      getChainHead: async () => freshScenario.trace.chainHead,
      fetchFn: mockFetch as unknown as typeof fetch,
      now: () => '2026-09-08T22:00:00.000Z',
    });

    const outcome = await port.lookup(freshScenario.request, freshScenario.policy);

    expect(mockFetch).toHaveBeenCalledTimes(1);
    const [url, init] = mockFetch.mock.calls[0];
    expect(url).toBe(studioUrl);
    const parsedBody = JSON.parse(init.body as string);
    expect(parsedBody.query).toContain('query CandidateTransfers');

    expect(outcome.accepted).toBe(true);
    expect(outcome.view.health).toBe('FRESH');
    expect(outcome.view.candidateCount).toBe(1);
    expect(outcome.view.candidates[0].transactionHash).toBe(
      '0x72ab1e93c95e5295b2dfa9b3abc8cc5130330f3bba07ad18af2c5b7784f57cf7',
    );
  });
});
