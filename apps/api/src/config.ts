import type { PoolConfig } from 'pg';

export interface ApiRuntimeConfig {
  readonly host: string;
  readonly port: number;
  readonly serviceBearerToken: string;
  readonly database: PoolConfig;
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

export function loadApiRuntimeConfig(
  environment: NodeJS.ProcessEnv = process.env,
): ApiRuntimeConfig {
  return {
    host: environment.HOST?.trim() || '0.0.0.0',
    port: integer(environment, 'PORT', 3000, 1, 65_535),
    serviceBearerToken: required(environment, 'SERVICE_BEARER_TOKEN'),
    database: databaseConfig(environment),
    submissionsDisabled: environment.ONESHOT_SUBMISSIONS_DISABLED === 'true',
  };
}
