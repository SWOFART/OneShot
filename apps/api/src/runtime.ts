import { randomUUID } from 'node:crypto';
import { IntentLedger, JobLedger, migrate } from '@oneshot/storage-postgres';
import { TeamReportSupplier } from '@oneshot/supplier-adapter';
import { Pool } from 'pg';
import { buildApi } from './app.js';
import { StudioWalletActivityPort } from './wallet-activity.js';
import {
  compositeAuthenticator,
  staticBearerAuthenticator,
  type ServiceAuthenticator,
} from './auth.js';
import { loadApiRuntimeConfig, type ApiRuntimeConfig } from './config.js';
import { createPrivyAccessTokenAuthenticator, isJwtCredential } from './privy-auth.js';
import { PostgresRateLimiter } from './rate-limit.js';

export interface ApiRuntime {
  readonly address: string;
  close(): Promise<void>;
}

export function buildApiAuthenticator(
  config: ApiRuntimeConfig,
  log: (line: string) => void = (line) => process.stderr.write(line),
): ServiceAuthenticator {
  const bearer = staticBearerAuthenticator(config.serviceBearerToken);
  if (!config.privyAuth) return bearer;

  const privy = createPrivyAccessTokenAuthenticator({
    ...config.privyAuth,
    onForbiddenSubject: (subject) => {
      log(`privy operator is not allowlisted: ${subject}\n`);
    },
  });

  return compositeAuthenticator([
    { matches: isJwtCredential, authenticator: privy },
    { matches: (authorization) => !isJwtCredential(authorization), authenticator: bearer },
  ]);
}

export async function startApiRuntime(config: ApiRuntimeConfig): Promise<ApiRuntime> {
  const pool = new Pool(config.database);
  try {
    await migrate(pool);
    const ledger = new IntentLedger(pool, {
      now: () => new Date(),
      nextAttemptId: randomUUID,
    });
    const jobs = new JobLedger(pool, { now: () => new Date(), nextAttemptId: randomUUID });
    const app = buildApi({
      ledger,
      jobs,
      ...(config.supplier ? { supplier: new TeamReportSupplier(config.supplier) } : {}),
      ...(config.walletActivity
        ? { walletActivity: new StudioWalletActivityPort(config.walletActivity) }
        : {}),
      authenticator: buildApiAuthenticator(config),
      rateLimiter: new PostgresRateLimiter(pool, config.rateLimit),
      config: {
        submissionsDisabled: config.submissionsDisabled,
        chainId: '5042002',
        network: 'eip155:5042002',
        contractVersion: '1.0.0',
        ...(config.workspaceId ? { workspaceId: config.workspaceId } : {}),
      },
    });
    const address = await app.listen({ host: config.host, port: config.port });
    return {
      address,
      async close() {
        await app.close();
        await pool.end();
      },
    };
  } catch (error) {
    await pool.end();
    throw error;
  }
}

export async function startApiFromEnvironment(
  environment: NodeJS.ProcessEnv = process.env,
): Promise<ApiRuntime> {
  return startApiRuntime(loadApiRuntimeConfig(environment));
}
