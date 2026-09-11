import type { PoolConfig } from 'pg';
import { loadSettlementConfig, type SettlementConfig } from '@oneshot/arc-adapter';
import type { GraphRetrieval, SubgraphMcpPolicy } from '@oneshot/reconciliation';

export interface WorkerRuntimeConfig {
  readonly host: string;
  readonly port: number;
  readonly database: PoolConfig;
  readonly settlement: SettlementConfig;
  readonly paidApi?: {
    readonly url: string;
    readonly maxAmountAtomic: bigint;
  };
  readonly privyAppSecret: string;
  readonly walletAddress: `0x${string}`;
  readonly policyDigest: string;
  readonly recovery: {
    readonly mcpEndpoint?: string;
    readonly graphQueryUrl?: string;
    readonly graphApiKey?: string;
    readonly fromBlock: string;
    readonly toBlock: string;
    readonly policy: SubgraphMcpPolicy;
    readonly vertexProjectId: string;
    readonly vertexLocation: string;
    readonly vertexModel: string;
  };
  readonly pollIntervalMs: number;
  readonly submissionLeaseMs: number;
  readonly maxJobsPerCycle: number;
  readonly submissionsDisabled: boolean;
  readonly demoResponseLossAfterBroadcast: boolean;
}

function required(environment: NodeJS.ProcessEnv, name: string): string {
  const value = environment[name]?.trim();
  if (!value) throw new Error(`Missing required environment variable: ${name}`);
  return value;
}

function integer(
  environment: NodeJS.ProcessEnv,
  name: string,
  fallback: number,
  minimum: number,
  maximum: number,
): number {
  const raw = environment[name]?.trim();
  if (!raw) return fallback;
  const value = Number(raw);
  if (!Number.isSafeInteger(value) || value < minimum || value > maximum) {
    throw new Error(`Invalid environment variable: ${name}`);
  }
  return value;
}

function unsigned(environment: NodeJS.ProcessEnv, name: string): string {
  const value = required(environment, name);
  if (!/^(0|[1-9][0-9]*)$/.test(value)) {
    throw new Error(`Invalid environment variable: ${name}`);
  }
  return value;
}

function optionalHttpsUrl(environment: NodeJS.ProcessEnv, name: string): string | undefined {
  const raw = environment[name]?.trim();
  if (!raw) return undefined;
  let parsed: URL;
  try {
    parsed = new URL(raw);
  } catch {
    throw new Error(`${name} must be a valid URL`);
  }
  const loopback = parsed.hostname === 'localhost' || parsed.hostname === '127.0.0.1';
  if (parsed.protocol !== 'https:' && !(loopback && parsed.protocol === 'http:')) {
    throw new Error(`${name} must use HTTPS (HTTP is allowed only for loopback)`);
  }
  if (parsed.username || parsed.password || parsed.search || parsed.hash) {
    throw new Error(`${name} must not contain credentials, query parameters, or fragments`);
  }
  return parsed.toString();
}

function optionalAtomicAmount(environment: NodeJS.ProcessEnv, name: string): bigint {
  const raw = environment[name]?.trim() || '10000';
  if (!/^(0|[1-9][0-9]*)$/.test(raw) || raw === '0') {
    throw new Error(`Invalid environment variable: ${name}`);
  }
  return BigInt(raw);
}

function httpsUrl(environment: NodeJS.ProcessEnv, name: string): string {
  const value = required(environment, name);
  let parsed: URL;
  try {
    parsed = new URL(value);
  } catch {
    throw new Error(`${name} must be a valid URL`);
  }
  const loopback = parsed.hostname === 'localhost' || parsed.hostname === '127.0.0.1';
  if (parsed.protocol !== 'https:' && !(loopback && parsed.protocol === 'http:')) {
    throw new Error(`${name} must use HTTPS (HTTP is allowed only for loopback)`);
  }
  if (parsed.username || parsed.password || parsed.search || parsed.hash) {
    throw new Error(`${name} must not contain credentials, query parameters, or fragments`);
  }
  return parsed.toString();
}

function databaseConfig(environment: NodeJS.ProcessEnv): PoolConfig {
  // One connection holds the claimed outbox row while the handler uses the
  // ledger through a second connection. A pool of one would self-deadlock.
  const max = integer(environment, 'DB_POOL_MAX', 10, 2, 100);
  const connectionString = environment.DATABASE_URL?.trim();
  if (connectionString) return { connectionString, max };
  const explicitSocket = environment.INSTANCE_UNIX_SOCKET?.trim();
  const connectionName = environment.INSTANCE_CONNECTION_NAME?.trim();
  const host = explicitSocket ?? (connectionName ? `/cloudsql/${connectionName}` : undefined);
  if (!host) {
    throw new Error(
      'Database configuration requires DATABASE_URL, INSTANCE_UNIX_SOCKET, or INSTANCE_CONNECTION_NAME',
    );
  }
  return {
    host,
    user: required(environment, 'DB_USER'),
    password: required(environment, 'DB_PASS'),
    database: required(environment, 'DB_NAME'),
    max,
  };
}

export function loadWorkerRuntimeConfig(
  environment: NodeJS.ProcessEnv = process.env,
): WorkerRuntimeConfig {
  const settlement = loadSettlementConfig(environment);
  const paidApiUrl = optionalHttpsUrl(environment, 'ONESHOT_X402_URL');
  const paidApiMaxAmount = optionalAtomicAmount(environment, 'ONESHOT_X402_MAX_AMOUNT_ATOMIC');
  const walletAddress = required(environment, 'ONESHOT_PRIVY_WALLET_ADDRESS');
  if (!/^0x[0-9a-fA-F]{40}$/.test(walletAddress)) {
    throw new Error('Invalid environment variable: ONESHOT_PRIVY_WALLET_ADDRESS');
  }
  const policyDigest = required(environment, 'ONESHOT_PRIVY_POLICY_DIGEST').toLowerCase();
  if (!/^[0-9a-f]{64}$/.test(policyDigest)) {
    throw new Error('Invalid environment variable: ONESHOT_PRIVY_POLICY_DIGEST');
  }

  const mcpEndpoint = environment.ONESHOT_SUBGRAPH_MCP_ENDPOINT?.trim()
    ? httpsUrl(environment, 'ONESHOT_SUBGRAPH_MCP_ENDPOINT')
    : undefined;
  const graphQueryUrl = environment.ONESHOT_SUBGRAPH_QUERY_URL?.trim()
    ? httpsUrl(environment, 'ONESHOT_SUBGRAPH_QUERY_URL')
    : undefined;
  const configuredRetrieval = environment.ONESHOT_SUBGRAPH_SOURCE?.trim() as
    GraphRetrieval | undefined;
  const retrieval: GraphRetrieval =
    configuredRetrieval ?? (graphQueryUrl ? 'STUDIO_GRAPHQL' : 'SUBGRAPH_MCP');
  if (retrieval !== 'STUDIO_GRAPHQL' && retrieval !== 'SUBGRAPH_MCP') {
    throw new Error('ONESHOT_SUBGRAPH_SOURCE must be STUDIO_GRAPHQL or SUBGRAPH_MCP');
  }
  if (retrieval === 'STUDIO_GRAPHQL' && !graphQueryUrl) {
    throw new Error('STUDIO_GRAPHQL recovery requires ONESHOT_SUBGRAPH_QUERY_URL');
  }
  if (retrieval === 'SUBGRAPH_MCP' && !mcpEndpoint) {
    throw new Error('SUBGRAPH_MCP recovery requires ONESHOT_SUBGRAPH_MCP_ENDPOINT');
  }

  const policy: SubgraphMcpPolicy = {
    retrieval,
    ...(retrieval === 'SUBGRAPH_MCP'
      ? {
          serverName: 'subgraph-mcp',
          serverVersion: required(environment, 'ONESHOT_SUBGRAPH_MCP_SERVER_VERSION'),
        }
      : {}),
    ...(graphQueryUrl ? { queryUrl: graphQueryUrl } : {}),
    deploymentId: required(environment, 'ONESHOT_SUBGRAPH_DEPLOYMENT_ID'),
    manifestCid: required(environment, 'ONESHOT_SUBGRAPH_MANIFEST_CID'),
    maxLagBlocks: unsigned(environment, 'ONESHOT_SUBGRAPH_MAX_LAG_BLOCKS'),
    maxCandidates: integer(environment, 'ONESHOT_SUBGRAPH_MAX_CANDIDATES', 5, 1, 25),
    maxResultBytes: integer(
      environment,
      'ONESHOT_SUBGRAPH_MAX_RESULT_BYTES',
      65_536,
      1,
      128 * 1024,
    ),
  };
  if (
    retrieval === 'SUBGRAPH_MCP' &&
    (!policy.serverVersion || !/^[A-Za-z0-9._+-]{1,32}$/.test(policy.serverVersion))
  ) {
    throw new Error('Invalid environment variable: ONESHOT_SUBGRAPH_MCP_SERVER_VERSION');
  }
  if (!/^0x[0-9a-fA-F]{64}$/.test(policy.deploymentId)) {
    throw new Error('Invalid environment variable: ONESHOT_SUBGRAPH_DEPLOYMENT_ID');
  }
  if (!/^(Qm[1-9A-HJ-NP-Za-km-z]{44}|bafy[a-z2-7]{20,})$/.test(policy.manifestCid)) {
    throw new Error('Invalid environment variable: ONESHOT_SUBGRAPH_MANIFEST_CID');
  }

  const fromBlock = unsigned(environment, 'ONESHOT_RECOVERY_FROM_BLOCK');
  const toBlock = unsigned(environment, 'ONESHOT_RECOVERY_TO_BLOCK');
  if (BigInt(fromBlock) > BigInt(toBlock)) {
    throw new Error('ONESHOT_RECOVERY_FROM_BLOCK must not exceed ONESHOT_RECOVERY_TO_BLOCK');
  }
  const vertexProjectId = required(environment, 'ONESHOT_VERTEX_PROJECT_ID');
  const vertexLocation = environment.ONESHOT_VERTEX_LOCATION?.trim() || 'europe-west1';
  const vertexModel = environment.ONESHOT_VERTEX_MODEL?.trim() || 'gemini-2.5-flash';
  if (!/^[a-z][a-z0-9-]{4,28}[a-z0-9]$/.test(vertexProjectId)) {
    throw new Error('Invalid environment variable: ONESHOT_VERTEX_PROJECT_ID');
  }
  if (!/^[a-z]+-[a-z]+[0-9]$/.test(vertexLocation)) {
    throw new Error('Invalid environment variable: ONESHOT_VERTEX_LOCATION');
  }
  if (!/^[A-Za-z0-9._-]{1,128}$/.test(vertexModel)) {
    throw new Error('Invalid environment variable: ONESHOT_VERTEX_MODEL');
  }

  const demoResponseLoss = environment.ONESHOT_DEMO_RESPONSE_LOSS_AFTER_BROADCAST?.trim();
  if (
    demoResponseLoss !== undefined &&
    demoResponseLoss !== '' &&
    !['true', 'false'].includes(demoResponseLoss)
  ) {
    throw new Error('ONESHOT_DEMO_RESPONSE_LOSS_AFTER_BROADCAST must be true or false');
  }
  const demoResponseLossAfterBroadcast = demoResponseLoss === 'true';
  if (demoResponseLossAfterBroadcast) {
    if (settlement.profile.caip2 !== 'eip155:5042002') {
      throw new Error('Response-loss demo is restricted to Arc Testnet');
    }
    if (environment.ONESHOT_DEMO_CONFIRM_TESTNET?.trim() !== 'true') {
      throw new Error(
        'ONESHOT_DEMO_CONFIRM_TESTNET=true is required to enable the response-loss demo',
      );
    }
  }

  return {
    host: environment.HOST?.trim() || '0.0.0.0',
    port: integer(environment, 'PORT', 8080, 1, 65_535),
    database: databaseConfig(environment),
    settlement,
    ...(paidApiUrl ? { paidApi: { url: paidApiUrl, maxAmountAtomic: paidApiMaxAmount } } : {}),
    privyAppSecret: required(environment, 'ONESHOT_PRIVY_APP_SECRET'),
    walletAddress: walletAddress.toLowerCase() as `0x${string}`,
    policyDigest,
    recovery: {
      ...(retrieval === 'SUBGRAPH_MCP' && mcpEndpoint ? { mcpEndpoint } : {}),
      ...(retrieval === 'STUDIO_GRAPHQL' && graphQueryUrl ? { graphQueryUrl } : {}),
      ...(environment.ONESHOT_GRAPH_API_KEY?.trim()
        ? { graphApiKey: environment.ONESHOT_GRAPH_API_KEY.trim() }
        : {}),
      fromBlock,
      toBlock,
      policy,
      vertexProjectId,
      vertexLocation,
      vertexModel,
    },
    pollIntervalMs: integer(environment, 'ONESHOT_WORKER_POLL_INTERVAL_MS', 1_000, 100, 60_000),
    submissionLeaseMs: integer(
      environment,
      'ONESHOT_SUBMISSION_LEASE_MS',
      30_000,
      1_000,
      3_600_000,
    ),
    maxJobsPerCycle: integer(environment, 'ONESHOT_WORKER_MAX_JOBS', 50, 1, 1_000),
    submissionsDisabled: environment.ONESHOT_SUBMISSIONS_DISABLED === 'true',
    demoResponseLossAfterBroadcast,
  };
}
