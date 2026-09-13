import { createHash } from 'node:crypto';

import {
  MCP_QUERY_NAME,
  MCP_TOOL_NAME,
  type IndexLookupRequest,
  type McpQueryVariables,
  type McpToolArguments,
  type SubgraphMcpPolicy,
} from './types.js';

export const RECOVERY_CANDIDATE_QUERY = `query OneShotRecoveryCandidatesV1(
  $tokenContract: Bytes!
  $recipient: Bytes!
  $amountAtomic: BigInt!
  $sender: Bytes
  $fromBlock: BigInt!
  $toBlock: BigInt!
) {
  settlementCandidates(
    first: 26
    orderBy: blockNumber
    orderDirection: asc
    where: {
      tokenContract: $tokenContract
      recipient: $recipient
      amountAtomic: $amountAtomic
      sender: $sender
      blockNumber_gte: $fromBlock
      blockNumber_lte: $toBlock
    }
  ) {
    id
    transactionHash
    logIndex
    blockNumber
    blockHash
    blockTimestamp
    network
    tokenContract
    sender
    recipient
    amountAtomic
    memoId
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
}`;

export function sha256(value: string): string {
  return createHash('sha256').update(value, 'utf8').digest('hex');
}

export const RECOVERY_CANDIDATE_QUERY_DIGEST = sha256(RECOVERY_CANDIDATE_QUERY);

export function buildQueryVariables(request: IndexLookupRequest): McpQueryVariables {
  return {
    amountAtomic: request.binding.amountAtomic,
    fromBlock: request.correlation.fromBlock,
    recipient: request.binding.recipient,
    sender: request.correlation.sender,
    toBlock: request.correlation.toBlock,
    tokenContract: request.binding.tokenContract,
  };
}

export function buildMcpToolArguments(
  request: IndexLookupRequest,
  policy: SubgraphMcpPolicy,
): McpToolArguments {
  return {
    deployment_id: policy.deploymentId,
    query: RECOVERY_CANDIDATE_QUERY,
    variables: buildQueryVariables(request),
  };
}

export const MCP_QUERY_IDENTITY = {
  name: MCP_QUERY_NAME,
  tool: MCP_TOOL_NAME,
  digest: RECOVERY_CANDIDATE_QUERY_DIGEST,
} as const;
