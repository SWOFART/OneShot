import { createPublicKey } from 'node:crypto';
import type { PoolConfig } from 'pg';
import { PRIVY_DID_PREFIX } from './privy-auth.js';

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
  readonly privyAuth?: PrivyAuthRuntimeConfig;
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
  if (appId.length === 0 && rawKey.length === 0 && rawSubjects.length === 0) return undefined;

  if (appId.length === 0)
    throw new Error('Missing required environment variable: PRIVY_AUTH_APP_ID');
  if (rawKey.length === 0) {
    throw new Error('Missing required environment variable: PRIVY_AUTH_VERIFICATION_KEY');
  }
  if (rawSubjects.length === 0) {
    throw new Error('Missing required environment variable: PRIVY_AUTH_ALLOWED_SUBJECTS');
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
  const privyAuth = privyAuthConfig(environment);
  return {
    host: environment.HOST?.trim() || '0.0.0.0',
    port: integer(environment, 'PORT', 3000, 1, 65_535),
    serviceBearerToken: required(environment, 'SERVICE_BEARER_TOKEN'),
    database: databaseConfig(environment),
    submissionsDisabled: environment.ONESHOT_SUBMISSIONS_DISABLED === 'true',
    ...(privyAuth ? { privyAuth } : {}),
  };
}
