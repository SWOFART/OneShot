import { buildMcpToolArguments } from './query.js';
import {
  MCP_TOOL_NAME,
  type IndexLookupOutcome,
  type IndexLookupRequest,
  type GraphRetrieval,
  type SubgraphMcpPolicy,
  type SubgraphMcpTrace,
} from './types.js';
import { normalizeSubgraphMcpTrace } from './validation.js';
import type { SubgraphMcpRecoveryPort } from './service.js';

export interface LiveSubgraphMcpRecoveryPortOptions {
  readonly mcpEndpoint?: string | undefined;
  readonly graphGatewayBaseUrl?: string | undefined;
  readonly graphQueryUrl?: string | undefined;
  readonly graphApiKey?: string | undefined;
  readonly getChainHead?:
    (() => Promise<{ blockNumber: string; observedAt: string } | null>) | undefined;
  readonly fetchFn?: typeof fetch | undefined;
  readonly now?: (() => string) | undefined;
}

export class LiveSubgraphMcpRecoveryPort implements SubgraphMcpRecoveryPort {
  private readonly fetch: typeof fetch;
  private readonly now: () => string;

  constructor(private readonly options: LiveSubgraphMcpRecoveryPortOptions = {}) {
    this.fetch = options.fetchFn ?? fetch;
    this.now = options.now ?? (() => new Date().toISOString());
  }

  async lookup(
    request: IndexLookupRequest,
    policy: SubgraphMcpPolicy,
  ): Promise<IndexLookupOutcome> {
    const retrieval: GraphRetrieval = this.options.graphQueryUrl
      ? 'STUDIO_GRAPHQL'
      : (policy.retrieval ?? 'SUBGRAPH_MCP');
    const effectivePolicy =
      retrieval === 'STUDIO_GRAPHQL'
        ? {
            ...policy,
            retrieval,
            queryUrl: policy.queryUrl ?? this.options.graphQueryUrl,
          }
        : { ...policy, retrieval };
    const toolArgs = buildMcpToolArguments(request, effectivePolicy);
    const retrievedAt = this.now();

    let chainHead: { blockNumber: string; observedAt: string } | null = null;
    if (this.options.getChainHead) {
      try {
        chainHead = await this.options.getChainHead();
      } catch {
        chainHead = null;
      }
    }

    let rawResult: unknown;

    if (retrieval === 'SUBGRAPH_MCP' && this.options.mcpEndpoint) {
      // 1. Query via MCP JSON-RPC protocol
      const callId = `mcp-${this.now()}`;
      const rpcPayload = {
        jsonrpc: '2.0',
        id: callId,
        method: 'tools/call',
        params: {
          name: MCP_TOOL_NAME,
          arguments: toolArgs,
        },
      };

      const res = await this.fetch(this.options.mcpEndpoint, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(this.options.graphApiKey
            ? { Authorization: `Bearer ${this.options.graphApiKey}` }
            : {}),
        },
        body: JSON.stringify(rpcPayload),
      });

      if (!res.ok) {
        throw new Error(`Subgraph MCP server returned HTTP ${res.status}`);
      }

      const rpcResponse = (await res.json()) as {
        result?: unknown;
        error?: unknown;
      };

      if (rpcResponse.error) {
        throw new Error(`Subgraph MCP error: ${JSON.stringify(rpcResponse.error)}`);
      }

      rawResult = rpcResponse.result;
    } else if (retrieval === 'STUDIO_GRAPHQL' && this.options.graphQueryUrl) {
      // Direct Studio GraphQL is intentionally kept as a native response. It
      // must not be wrapped in an MCP envelope or reported as an MCP call.
      const endpoint = this.options.graphQueryUrl;

      const queryBody = {
        query: toolArgs.query,
        variables: toolArgs.variables,
      };

      const res = await this.fetch(endpoint, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(this.options.graphApiKey
            ? { Authorization: `Bearer ${this.options.graphApiKey}` }
            : {}),
        },
        body: JSON.stringify(queryBody),
      });

      if (!res.ok) {
        throw new Error(`The Graph provider returned HTTP ${res.status}`);
      }

      rawResult = await res.json();
    } else if (retrieval === 'SUBGRAPH_MCP') {
      const gatewayBase =
        this.options.graphGatewayBaseUrl ?? 'https://gateway-arbitrum.network.thegraph.com/api';
      const apiKeyPart = this.options.graphApiKey ? `/${this.options.graphApiKey}` : '';
      const endpoint =
        this.options.graphQueryUrl ??
        `${gatewayBase}${apiKeyPart}/deployments/id/${effectivePolicy.deploymentId}`;
      const queryBody = { query: toolArgs.query, variables: toolArgs.variables };
      const res = await this.fetch(endpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(queryBody),
      });
      if (!res.ok) throw new Error(`The Graph Gateway returned HTTP ${res.status}`);
      rawResult = {
        content: [{ type: 'text', text: JSON.stringify(await res.json()) }],
        isError: false,
      };
    } else {
      throw new Error('Graph recovery transport is not configured for the selected source');
    }

    const trace: SubgraphMcpTrace = {
      retrieval,
      endpointUrl:
        retrieval === 'STUDIO_GRAPHQL'
          ? this.options.graphQueryUrl
          : (this.options.mcpEndpoint ?? 'unavailable'),
      callId: `call-${retrievedAt}`,
      ...(retrieval === 'SUBGRAPH_MCP'
        ? {
            serverName: effectivePolicy.serverName,
            serverVersion: effectivePolicy.serverVersion,
            toolName: MCP_TOOL_NAME,
          }
        : {}),
      arguments: toolArgs,
      result: rawResult,
      retrievedAt,
      chainHead,
    };

    return normalizeSubgraphMcpTrace(request, effectivePolicy, trace);
  }
}
