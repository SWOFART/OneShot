import { createHash, randomUUID } from 'node:crypto';
import { createServer, type Server } from 'node:http';
import { PrivyClient } from '@privy-io/node';
import { GoogleAuth } from 'google-auth-library';
import { Pool } from 'pg';
import { IntentLedger, migrate } from '@oneshot/storage-postgres';
import {
  ArcSettlementAdapter,
  PrivyArcWalletProvider,
  PrivyAuthorizationAdapter,
  type SettlementBaseline,
} from '@oneshot/privy-adapter';
import { lookupEvidence } from '@oneshot/arc-adapter';
import { LiveSubgraphMcpRecoveryPort, VertexAiRecoveryAdvisor } from '@oneshot/reconciliation';
import { composeWorker, type ComposedWorker } from './composition.js';
import { RestartRunner } from './restart-runner.js';
import { loadWorkerRuntimeConfig, type WorkerRuntimeConfig } from './runtime-config.js';

export interface WorkerRuntime {
  readonly address: string;
  readonly runner: RestartRunner;
  close(): Promise<void>;
}

export interface WorkerRuntimeDependencies {
  readonly pool?: Pool;
  readonly compose?: (
    pool: Pool,
    ledger: IntentLedger,
    config: WorkerRuntimeConfig,
  ) => Promise<ComposedWorker>;
}

function stableJson(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(stableJson).join(',')}]`;
  if (value && typeof value === 'object') {
    const record = value as Record<string, unknown>;
    return `{${Object.keys(record)
      .sort()
      .map((key) => `${JSON.stringify(key)}:${stableJson(record[key])}`)
      .join(',')}}`;
  }
  return JSON.stringify(value) ?? 'null';
}

function firstAllowedRecipient(config: WorkerRuntimeConfig): `0x${string}` {
  const recipient = config.settlement.recipientAllowlist[0];
  if (!recipient) throw new Error('Settlement configuration has no allowed recipient');
  return recipient;
}

async function composeProduction(
  pool: Pool,
  ledger: IntentLedger,
  config: WorkerRuntimeConfig,
): Promise<ComposedWorker> {
  const privy = new PrivyClient({
    appId: config.settlement.privyAppId,
    appSecret: config.privyAppSecret,
    timeout: config.settlement.rpcTimeoutMs,
    maxRetries: 0,
  });
  const baseline: SettlementBaseline = {
    policyDigest: config.policyDigest,
    policyId: config.settlement.privyPolicyId,
    walletId: config.settlement.privyWalletId,
    walletAddress: config.walletAddress,
    chainId: config.settlement.profile.chainId,
    tokenContract: config.settlement.profile.tokenContract,
    settlementCapAtomic: BigInt(config.settlement.settlementCapAtomic),
  };
  const observePrivyIdentity = async (): Promise<SettlementBaseline> => {
    const [wallet, policy] = await Promise.all([
      privy.wallets().get(config.settlement.privyWalletId),
      privy.policies().get(config.settlement.privyPolicyId),
    ]);
    return {
      ...baseline,
      walletId: wallet.id,
      walletAddress: wallet.address,
      policyId: wallet.policy_ids.includes(config.settlement.privyPolicyId)
        ? config.settlement.privyPolicyId
        : 'unattached-policy',
      policyDigest: createHash('sha256').update(stableJson(policy)).digest('hex'),
    };
  };
  const startupIdentity = await observePrivyIdentity();
  const startupAuthorization = new PrivyAuthorizationAdapter(
    config.settlement,
    baseline,
    () => startupIdentity,
  );
  const startupDecision = await startupAuthorization.authorize({
    business_intent_id: 'runtime-readiness-probe',
    recipient: firstAllowedRecipient(config),
    amount_atomic: '1',
    asset: 'USDC',
    network: 'eip155:5042002',
    purpose: 'Runtime identity readiness probe',
  });
  if (startupDecision.kind !== 'AUTHORIZED') {
    throw new Error('Privy wallet or policy identity does not match the reviewed baseline');
  }
  const provider = new PrivyArcWalletProvider({
    appId: config.settlement.privyAppId,
    appSecret: config.privyAppSecret,
    walletId: config.settlement.privyWalletId,
    walletAddress: config.walletAddress,
    chainId: config.settlement.profile.chainId,
    rpcUrl: config.settlement.rpcUrl,
    nativeDecimals: config.settlement.profile.nativeDecimals,
    rpcTimeoutMs: config.settlement.rpcTimeoutMs,
  });
  const settlementPort = new ArcSettlementAdapter(config.settlement, provider);
  const authorizationPort = {
    name: 'PrivyAuthorizationAdapter',
    contractVersion: '1.0.0',
    authorize: async (request: Parameters<PrivyAuthorizationAdapter['authorize']>[0]) => {
      try {
        const observed = await observePrivyIdentity();
        return new PrivyAuthorizationAdapter(config.settlement, baseline, () => observed).authorize(
          request,
        );
      } catch {
        return { kind: 'UNAVAILABLE' as const, reason: 'Privy identity could not be observed' };
      }
    },
  };
  const boundedFetch: typeof fetch = (input, init = {}) =>
    fetch(input, {
      ...init,
      signal: init.signal
        ? AbortSignal.any([init.signal, AbortSignal.timeout(config.settlement.rpcTimeoutMs)])
        : AbortSignal.timeout(config.settlement.rpcTimeoutMs),
    });
  const subgraphMcp = new LiveSubgraphMcpRecoveryPort({
    mcpEndpoint: config.recovery.mcpEndpoint,
    graphQueryUrl: config.recovery.graphQueryUrl,
    ...(config.recovery.graphApiKey ? { graphApiKey: config.recovery.graphApiKey } : {}),
    fetchFn: boundedFetch,
    getChainHead: async () => ({
      blockNumber: (await provider.getBlockNumber()).toString(10),
      observedAt: new Date().toISOString(),
    }),
  });
  const googleAuth = new GoogleAuth({
    scopes: ['https://www.googleapis.com/auth/cloud-platform'],
  });
  const advisor = new VertexAiRecoveryAdvisor({
    projectId: config.recovery.vertexProjectId,
    location: config.recovery.vertexLocation,
    modelName: config.recovery.vertexModel,
    fetchFn: boundedFetch,
    getAuthToken: async () => {
      const token = await googleAuth.getAccessToken();
      if (!token) throw new Error('Google Application Default Credentials returned no token');
      return token;
    },
  });
  const evidencePort = {
    lookup: async (request: {
      businessIntentId: string;
      transactionHash?: string;
      chainId: number;
      tokenContract: string;
      recipient: string;
      amountAtomic: bigint;
    }) =>
      (
        await lookupEvidence(
          {
            transactionHash: request.transactionHash,
            walletAddress: config.walletAddress,
            chainId: request.chainId,
            tokenContract: request.tokenContract,
            recipient: request.recipient,
            amountAtomic: request.amountAtomic,
          },
          provider,
        )
      ).result,
  };

  const composed = composeWorker(pool, ledger, {
    profile: 'production',
    settlementPort,
    authorizationPort,
    submissionsDisabled: config.submissionsDisabled,
    recovery: {
      localState: {
        tokenContract: config.settlement.profile.tokenContract,
        correlationSender: config.walletAddress,
        fromBlock: config.recovery.fromBlock,
        toBlock: config.recovery.toBlock,
        getToBlock: async () => (await provider.getBlockNumber()).toString(10),
        mcpPolicy: config.recovery.policy,
      },
      bridge: {
        evidencePort,
        receiptSource: provider,
        walletAddress: config.walletAddress,
        chainId: config.settlement.profile.chainId,
      },
      subgraphMcp,
      advisor,
    },
  });
  return {
    options: composed.options,
    checkReadiness: async () => {
      const base = await composed.checkReadiness();
      if (!base.ready) return base;
      try {
        const observed = await observePrivyIdentity();
        const driftCheck = await new PrivyAuthorizationAdapter(
          config.settlement,
          baseline,
          () => observed,
        ).authorize({
          business_intent_id: 'runtime-readiness-probe',
          recipient: firstAllowedRecipient(config),
          amount_atomic: '1',
          asset: 'USDC',
          network: 'eip155:5042002',
          purpose: 'Runtime identity readiness probe',
        });
        if (driftCheck.kind !== 'AUTHORIZED') {
          return { ready: false, reason: 'Privy wallet or policy identity drifted' };
        }
        await provider.getBlockNumber();
      } catch {
        return { ready: false, reason: 'Privy or Arc provider is unavailable' };
      }
      try {
        const token = await googleAuth.getAccessToken();
        if (!token) return { ready: false, reason: 'Vertex credentials are unavailable' };
      } catch {
        return { ready: false, reason: 'Vertex credentials are unavailable' };
      }
      return { ready: true };
    },
  };
}

function listen(server: Server, host: string, port: number): Promise<string> {
  return new Promise((resolve, reject) => {
    server.once('error', reject);
    server.listen(port, host, () => {
      server.off('error', reject);
      const address = server.address();
      if (!address || typeof address === 'string')
        return reject(new Error('Worker address unavailable'));
      resolve(`http://${address.address}:${address.port}`);
    });
  });
}

function closeServer(server: Server): Promise<void> {
  return new Promise((resolve, reject) => {
    server.close((error) => (error ? reject(error) : resolve()));
  });
}

export async function startWorkerRuntime(
  config: WorkerRuntimeConfig,
  dependencies: WorkerRuntimeDependencies = {},
): Promise<WorkerRuntime> {
  const pool = dependencies.pool ?? new Pool(config.database);
  const ownsPool = dependencies.pool === undefined;
  let runner: RestartRunner | undefined;
  let healthServer: Server | undefined;
  try {
    await migrate(pool);
    const ledger = new IntentLedger(pool, { now: () => new Date(), nextAttemptId: randomUUID });
    const composed = await (dependencies.compose ?? composeProduction)(pool, ledger, config);
    runner = new RestartRunner({
      workerOptions: {
        ...composed.options,
        config: { ...composed.options.config, submissionLeaseMs: config.submissionLeaseMs },
      },
      leaseExpiryIntervalMs: config.pollIntervalMs,
      maxJobsPerCycle: config.maxJobsPerCycle,
    });
    await runner.start();

    healthServer = createServer((request, response) => {
      response.setHeader('content-type', 'application/json');
      if (request.method !== 'GET') {
        response.statusCode = 405;
        response.end(JSON.stringify({ status: 'method_not_allowed' }));
        return;
      }
      if (request.url === '/health/live') {
        response.statusCode = 200;
        response.end(JSON.stringify({ status: 'ok' }));
        return;
      }
      if (request.url === '/health/ready') {
        void composed
          .checkReadiness()
          .then((check) => {
            const status = runner?.status;
            const ready = check.ready && status?.running === true && !status.lastError;
            response.statusCode = ready ? 200 : 503;
            response.end(
              JSON.stringify({
                status: ready ? 'ok' : 'not_ready',
                ...(check.reason ? { reason: check.reason } : {}),
                ...(status?.lastError ? { reason: 'Worker cycle failed' } : {}),
              }),
            );
          })
          .catch(() => {
            response.statusCode = 503;
            response.end(JSON.stringify({ status: 'not_ready', reason: 'Readiness check failed' }));
          });
        return;
      }
      response.statusCode = 404;
      response.end(JSON.stringify({ status: 'not_found' }));
    });
    const address = await listen(healthServer, config.host, config.port);
    let closed = false;
    return {
      address,
      runner,
      async close() {
        if (closed) return;
        closed = true;
        if (healthServer) await closeServer(healthServer);
        if (runner) await runner.stop();
        if (ownsPool) await pool.end();
      },
    };
  } catch (error) {
    if (healthServer?.listening) await closeServer(healthServer);
    if (runner) await runner.stop();
    if (ownsPool) await pool.end();
    throw error;
  }
}

export async function startWorkerFromEnvironment(
  environment: NodeJS.ProcessEnv = process.env,
): Promise<WorkerRuntime> {
  return startWorkerRuntime(loadWorkerRuntimeConfig(environment));
}
