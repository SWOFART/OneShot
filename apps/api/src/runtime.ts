import { randomUUID } from 'node:crypto';
import { IntentLedger, migrate } from '@oneshot/storage-postgres';
import { Pool } from 'pg';
import { buildApi } from './app.js';
import { staticBearerAuthenticator } from './auth.js';
import { loadApiRuntimeConfig, type ApiRuntimeConfig } from './config.js';

export interface ApiRuntime {
  readonly address: string;
  close(): Promise<void>;
}

export async function startApiRuntime(config: ApiRuntimeConfig): Promise<ApiRuntime> {
  const pool = new Pool(config.database);
  try {
    await migrate(pool);
    const ledger = new IntentLedger(pool, {
      now: () => new Date(),
      nextAttemptId: randomUUID,
    });
    const app = buildApi({
      ledger,
      authenticator: staticBearerAuthenticator(config.serviceBearerToken),
      config: {
        submissionsDisabled: config.submissionsDisabled,
        chainId: '5042002',
        network: 'eip155:5042002',
        contractVersion: '1.0.0',
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
