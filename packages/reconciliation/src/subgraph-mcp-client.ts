import { buildMcpToolArguments } from './query.js';
import {
  MCP_TOOL_NAME,
  type IndexLookupOutcome,
  type IndexLookupRequest,
  type SubgraphMcpPolicy,
  type SubgraphMcpTrace,
} from './types.js';
import { normalizeSubgraphMcpTrace } from './validation.js';
import type { SubgraphMcpRecoveryPort } from './service.js';

export interface LiveSubgraphMcpRecoveryPortOptions {
  readonly mcpEndpoint?: string | undefined;
  readonly graphGatewayBaseUrl?: string | undefined;
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
    const toolArgs = buildMcpToolArguments(request, policy);
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

    if (this.options.mcpEndpoint) {
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
    } else {
      // 2. Query Gateway deployment endpoint directly, formatted as MCP result payload
      const gatewayBase =
        this.options.graphGatewayBaseUrl ?? 'https://gateway-arbitrum.network.thegraph.com/api';
      const apiKeyPart = this.options.graphApiKey ? `/${this.options.graphApiKey}` : '';
      const endpoint = `${gatewayBase}${apiKeyPart}/deployments/id/${policy.deploymentId}`;

      const res = await this.fetch(endpoint, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          query: toolArgs.query,
          variables: toolArgs.variables,
        }),
      });

      if (!res.ok) {
        throw new Error(`The Graph Gateway returned HTTP ${res.status}`);
      }

      const gatewayResponse = (await res.json()) as {
        data?: unknown;
        errors?: unknown;
      };

      rawResult = {
        content: [
          {
            type: 'text',
            text: JSON.stringify(gatewayResponse),
          },
        ],
        isError: false,
      };
    }

    const trace: SubgraphMcpTrace = {
      callId: `call-${retrievedAt}`,
      serverName: policy.serverName,
      serverVersion: policy.serverVersion,
      toolName: MCP_TOOL_NAME,
      arguments: toolArgs,
      result: rawResult,
      retrievedAt,
      chainHead,
    };

    return normalizeSubgraphMcpTrace(request, policy, trace);
  }
}
