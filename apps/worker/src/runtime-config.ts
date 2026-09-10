import type { PoolConfig } from 'pg';
import { loadSettlementConfig, type SettlementConfig } from '@oneshot/arc-adapter';
import type { SubgraphMcpPolicy } from '@oneshot/reconciliation';

export interface WorkerRuntimeConfig {
  readonly host: string;
  readonly port: number;
  readonly database: PoolConfig;
  readonly settlement: SettlementConfig;
  readonly privyAppSecret: string;
  readonly walletAddress: `0x${string}`;
  readonly policyDigest: string;
  readonly recovery: {
    readonly mcpEndpoint: string;
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

function httpsUrl(environment: NodeJS.ProcessEnv, name: string): string {
  const value = required(environment, name);
  const parsed = new URL(value);
  const loopback = parsed.hostname === 'localhost' || parsed.hostname === '127.0.0.1';
  if (parsed.protocol !== 'https:' && !(loopback && parsed.protocol === 'http:')) {
    throw new Error(`${name} must use HTTPS (HTTP is allowed only for loopback)`);
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
  const walletAddress = required(environment, 'ONESHOT_PRIVY_WALLET_ADDRESS');
  if (!/^0x[0-9a-fA-F]{40}$/.test(walletAddress)) {
    throw new Error('Invalid environment variable: ONESHOT_PRIVY_WALLET_ADDRESS');
  }
  const policyDigest = required(environment, 'ONESHOT_PRIVY_POLICY_DIGEST').toLowerCase();
  if (!/^[0-9a-f]{64}$/.test(policyDigest)) {
    throw new Error('Invalid environment variable: ONESHOT_PRIVY_POLICY_DIGEST');
  }

  const policy: SubgraphMcpPolicy = {
    serverName: 'subgraph-mcp',
    serverVersion: required(environment, 'ONESHOT_SUBGRAPH_MCP_SERVER_VERSION'),
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
  if (!/^[A-Za-z0-9._+-]{1,32}$/.test(policy.serverVersion)) {
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

  return {
    host: environment.HOST?.trim() || '0.0.0.0',
    port: integer(environment, 'PORT', 8080, 1, 65_535),
    database: databaseConfig(environment),
    settlement,
    privyAppSecret: required(environment, 'ONESHOT_PRIVY_APP_SECRET'),
    walletAddress: walletAddress.toLowerCase() as `0x${string}`,
    policyDigest,
    recovery: {
      mcpEndpoint: httpsUrl(environment, 'ONESHOT_SUBGRAPH_MCP_ENDPOINT'),
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
  };
}
