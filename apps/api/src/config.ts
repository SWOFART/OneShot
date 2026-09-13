import { createPublicKey } from 'node:crypto';
import type { PoolConfig } from 'pg';
import { PRIVY_ALLOW_ALL, PRIVY_DID_PREFIX } from './privy-auth.js';

export interface PrivyAuthRuntimeConfig {
  readonly appId: string;
  readonly verificationKey: string;
  readonly allowedSubjects: readonly string[];
}

export interface ApiRuntimeConfig {
  readonly host: string;
  readonly port: number;
  readonly serviceBearerToken: string;
  readonly database: PoolConfig;
  readonly submissionsDisabled: boolean;
  readonly workspaceId?: string;
  readonly rateLimit: {
    readonly maxRequests: number;
    readonly windowMs: number;
  };
  readonly privyAuth?: PrivyAuthRuntimeConfig;
  readonly walletActivity?: {
    readonly endpoint: string;
    readonly wallet: string;
    readonly apiKey?: string;
  };
  /** Credential-free read-only RPC used to verify user-submitted receipts. */
  readonly userWalletRpcUrl?: string;
  readonly mcp?: {
    readonly bearerToken?: string;
    readonly workspaceId: string;
    /** НЕ УДАЛЯТЬ: disabled corporate server-wallet mode only. */
    readonly payerWallet?: string;
    readonly waitMs: number;
  };
}

function required(environment: NodeJS.ProcessEnv, name: string, minimumLength = 1): string {
  const value = environment[name]?.trim();
  if (!value) throw new Error(`Missing required environment variable: ${name}`);
  if (value.length < minimumLength) {
    throw new Error(`Environment variable ${name} must be at least ${minimumLength} characters`);
  }
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

function mcpConfig(environment: NodeJS.ProcessEnv, workspaceId: string): ApiRuntimeConfig['mcp'] {
  const names = [
    'ONESHOT_MCP_BEARER_TOKEN',
    'ONESHOT_MCP_PAYER_ADDRESS',
    'ONESHOT_MCP_WAIT_MS',
  ] as const;
  if (names.every((name) => !environment[name]?.trim())) return undefined;
  if (!environment.ONESHOT_WORKSPACE_ID?.trim()) {
    throw new Error('ONESHOT_WORKSPACE_ID is required when MCP is enabled');
  }
  const bearerToken = environment.ONESHOT_MCP_BEARER_TOKEN?.trim();
  if (bearerToken && bearerToken.length < 32) {
    throw new Error('Environment variable ONESHOT_MCP_BEARER_TOKEN must be at least 32 characters');
  }
  /*
   * НЕ УДАЛЯТЬ: this optional value belongs only to the disabled corporate
   * server-wallet mode. Personal MCP payments bind the wallet supplied by the
   * user and never read this address.
   */
  const payerWallet = environment.ONESHOT_MCP_PAYER_ADDRESS?.trim().toLowerCase();
  if (payerWallet && !/^0x[0-9a-f]{40}$/u.test(payerWallet)) {
    throw new Error('Invalid environment variable: ONESHOT_MCP_PAYER_ADDRESS');
  }
  return {
    ...(bearerToken ? { bearerToken } : {}),
    workspaceId,
    ...(payerWallet ? { payerWallet } : {}),
    waitMs: integer(environment, 'ONESHOT_MCP_WAIT_MS', 2_500, 0, 5_000),
  };
}

function optionalRpcUrl(environment: NodeJS.ProcessEnv, name: string): string | undefined {
  return optionalHttpsUrl(environment, name);
}

function databaseConfig(environment: NodeJS.ProcessEnv): PoolConfig {
  const max = integer(environment, 'DB_POOL_MAX', 10, 1, 100);
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

function normalizeVerificationKey(raw: string): string {
  const normalized = raw.replace(/\\n/g, '\n').trim();
  const key = createPublicKey(normalized);
  if (key.asymmetricKeyType !== 'ec' || key.asymmetricKeyDetails?.namedCurve !== 'prime256v1') {
    throw new Error('PRIVY_AUTH_VERIFICATION_KEY must be an EC P-256 (ES256) public key');
  }
  return normalized;
}

function privyAuthConfig(environment: NodeJS.ProcessEnv): PrivyAuthRuntimeConfig | undefined {
  const appId = environment.PRIVY_AUTH_APP_ID?.trim() ?? '';
  const rawKey = environment.PRIVY_AUTH_VERIFICATION_KEY?.trim() ?? '';
  const rawSubjects = environment.PRIVY_AUTH_ALLOWED_SUBJECTS?.trim() ?? '';
  const allowAllSubjects = environment.PRIVY_AUTH_ALLOW_ALL_SUBJECTS?.trim() === 'true';
  if (appId.length === 0 && rawKey.length === 0 && rawSubjects.length === 0) return undefined;

  if (appId.length === 0)
    throw new Error('Missing required environment variable: PRIVY_AUTH_APP_ID');
  if (rawKey.length === 0) {
    throw new Error('Missing required environment variable: PRIVY_AUTH_VERIFICATION_KEY');
  }
  if (rawSubjects.length === 0) {
    throw new Error('Missing required environment variable: PRIVY_AUTH_ALLOWED_SUBJECTS');
  }

  if (rawSubjects === '*') {
    if (!allowAllSubjects) {
      throw new Error('PRIVY_AUTH_ALLOWED_SUBJECTS=* requires PRIVY_AUTH_ALLOW_ALL_SUBJECTS=true');
    }
    return { appId, verificationKey: normalizeVerificationKey(rawKey), allowedSubjects: ['*'] };
  }

  const allowedSubjects = [
    ...new Set(
      rawSubjects
        .split(',')
        .map((subject) => subject.trim())
        .filter((subject) => subject.length > 0),
    ),
  ];
  if (allowedSubjects.length === 0) {
    throw new Error('PRIVY_AUTH_ALLOWED_SUBJECTS must list at least one Privy DID');
  }
  if (allowedSubjects.includes(PRIVY_ALLOW_ALL)) {
    if (!allowAllSubjects) {
      throw new Error('PRIVY_AUTH_ALLOWED_SUBJECTS=* requires PRIVY_AUTH_ALLOW_ALL_SUBJECTS=true');
    }
    return { appId, verificationKey: normalizeVerificationKey(rawKey), allowedSubjects: ['*'] };
  }
  for (const subject of allowedSubjects) {
    if (!subject.startsWith(PRIVY_DID_PREFIX)) {
      throw new Error(`PRIVY_AUTH_ALLOWED_SUBJECTS entries must start with ${PRIVY_DID_PREFIX}`);
    }
  }

  return { appId, verificationKey: normalizeVerificationKey(rawKey), allowedSubjects };
}

export function loadApiRuntimeConfig(
  environment: NodeJS.ProcessEnv = process.env,
): ApiRuntimeConfig {
  const workspaceId = environment.ONESHOT_WORKSPACE_ID?.trim() || 'default-workspace';
  const privyAuth = privyAuthConfig(environment);
  const activityEndpoint = environment.ONESHOT_GRAPH_QUERY_URL?.trim();
  const activityWallet = environment.ONESHOT_ACTIVITY_WALLET_ADDRESS?.trim();
  const userWalletRpcUrl = optionalRpcUrl(environment, 'ONESHOT_ARC_RPC_URL');
  const mcp = mcpConfig(environment, workspaceId);
  if ((activityEndpoint && !activityWallet) || (!activityEndpoint && activityWallet)) {
    throw new Error(
      'ONESHOT_GRAPH_QUERY_URL and ONESHOT_ACTIVITY_WALLET_ADDRESS must be configured together',
    );
  }
  if (activityEndpoint) {
    const url = new URL(activityEndpoint);
    if (url.protocol !== 'https:' || url.username || url.password || url.search || url.hash) {
      throw new Error('ONESHOT_GRAPH_QUERY_URL must be a credential-free HTTPS URL');
    }
  }
  return {
    host: environment.HOST?.trim() || '0.0.0.0',
    port: integer(environment, 'PORT', 3000, 1, 65_535),
    serviceBearerToken: required(environment, 'SERVICE_BEARER_TOKEN', 16),
    database: databaseConfig(environment),
    submissionsDisabled: environment.ONESHOT_SUBMISSIONS_DISABLED === 'true',
    // One fixed workspace is safer than accepting a caller-selected tenant.
    // Deployments should configure this explicit value; the default keeps local
    // development and existing single-workspace installations closed to one scope.
    workspaceId,
    rateLimit: {
      maxRequests: integer(environment, 'ONESHOT_API_RATE_LIMIT_MAX_REQUESTS', 60, 1, 10_000),
      windowMs: integer(environment, 'ONESHOT_API_RATE_LIMIT_WINDOW_MS', 60_000, 1_000, 3_600_000),
    },
    ...(privyAuth ? { privyAuth } : {}),
    ...(activityEndpoint && activityWallet
      ? {
          walletActivity: {
            endpoint: activityEndpoint,
            wallet: activityWallet,
            ...(environment.ONESHOT_GRAPH_API_KEY?.trim()
              ? { apiKey: environment.ONESHOT_GRAPH_API_KEY.trim() }
              : {}),
          },
        }
      : {}),
    ...(userWalletRpcUrl ? { userWalletRpcUrl } : {}),
    ...(mcp ? { mcp } : {}),
  };
}
