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
      // 2. Query Gateway deployment or Studio endpoint directly, formatted as MCP result payload
      const gatewayBase =
        this.options.graphGatewayBaseUrl ?? 'https://gateway-arbitrum.network.thegraph.com/api';
      const apiKeyPart = this.options.graphApiKey ? `/${this.options.graphApiKey}` : '';
      const endpoint =
        this.options.graphQueryUrl ??
        `${gatewayBase}${apiKeyPart}/deployments/id/${policy.deploymentId}`;

      const queryBody =
        this.options.graphQueryUrl !== undefined
          ? {
              query: `query CandidateTransfers($sender: Bytes!, $recipient: Bytes!, $amount: BigInt!, $minBlock: BigInt!, $maxBlock: BigInt!) {
  usdcTransfers(
    where: {
      from: $sender
      to: $recipient
      amount: $amount
      blockNumber_gte: $minBlock
      blockNumber_lte: $maxBlock
    }
    orderBy: blockNumber
    orderDirection: asc
  ) {
    id
    transactionHash
    logIndex
    blockNumber
    blockTimestamp
    from
    to
    amount
  }
  _meta {
    deployment
    hasIndexingErrors
    block {
      number
      hash
      timestamp
    }
  }
}`,
              variables: {
                sender: request.correlation.sender,
                recipient: request.binding.recipient,
                amount: request.binding.amountAtomic,
                minBlock: request.correlation.fromBlock,
                maxBlock: request.correlation.toBlock,
              },
            }
          : {
              query: toolArgs.query,
              variables: toolArgs.variables,
            };

      const res = await this.fetch(endpoint, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(queryBody),
      });

      if (!res.ok) {
        throw new Error(`The Graph Gateway returned HTTP ${res.status}`);
      }

      const gatewayResponse = (await res.json()) as {
        data?: Record<string, unknown>;
        errors?: unknown;
      };

      let normalizedPayload = gatewayResponse;
      if (
        gatewayResponse.data &&
        Array.isArray(gatewayResponse.data.usdcTransfers) &&
        !gatewayResponse.data.settlementCandidates
      ) {
        const metaObj = (gatewayResponse.data._meta ?? {}) as Record<string, unknown>;
        const blockObj = (metaObj.block ?? {}) as Record<string, unknown>;
        const adaptedMeta = {
          ...metaObj,
          block: {
            ...blockObj,
            timestamp:
              blockObj.timestamp !== null && blockObj.timestamp !== undefined
                ? String(blockObj.timestamp)
                : null,
          },
        };

        const settlementCandidates = (
          gatewayResponse.data.usdcTransfers as Array<Record<string, unknown>>
        ).map((t) => ({
          id: String(t.id ?? ''),
          transactionHash: String(t.transactionHash ?? ''),
          logIndex: String(t.logIndex ?? '0'),
          blockNumber: String(t.blockNumber ?? '0'),
          blockHash: String(blockObj.hash ?? '0x' + '0'.repeat(64)),
          blockTimestamp: String(t.blockTimestamp ?? '0'),
          network: 'eip155:5042002',
          tokenContract: request.binding.tokenContract,
          sender: String(t.from ?? ''),
          recipient: String(t.to ?? ''),
          amountAtomic: String(t.amount ?? '0'),
          memoId: null,
        }));

        normalizedPayload = {
          ...gatewayResponse,
          data: {
            settlementCandidates,
            _meta: adaptedMeta,
          },
        };
      }

      rawResult = {
        content: [
          {
            type: 'text',
            text: JSON.stringify(normalizedPayload),
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
