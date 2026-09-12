import { randomUUID } from 'node:crypto';
import {
  asCorrelationId,
  asBlockNumber,
  asProviderReferenceId,
  asTransactionHash,
  ContractValidationError,
  parseCreatePaidApiRequest,
  parseCreateJobRequest,
  parseCreateUserWalletJobRequest,
  type SupplierPort,
  type ErrorCode,
  type ErrorResponse,
  type SupplierQuote,
} from '@oneshot/contracts';
import { derivedJobId } from '@oneshot/domain';
import type { IntentLedger, JobLedger } from '@oneshot/storage-postgres';
import Fastify, { type FastifyReply, type FastifyRequest } from 'fastify';
import type { ServiceAuthenticator } from './auth.js';
import { allowAllRateLimiter, type RateLimiter } from './rate-limit.js';
import { UnavailableWalletActivityPort, type WalletActivityPort } from './wallet-activity.js';
import type { PaidApiService } from './paid-api.js';
import type { UserWalletVerificationPort } from './user-wallet.js';

export interface ServiceConfig {
  readonly submissionsDisabled?: boolean;
  readonly chainId?: string;
  readonly network?: string;
  readonly contractVersion?: string;
  readonly workspaceId?: string;
}

export interface SanitizedApiError {
  readonly correlationId: string;
  readonly method: string;
  readonly path: string;
  readonly code: string;
}

export interface ApiDependencies {
  readonly ledger: Pick<
    IntentLedger,
    | 'createOrReplay'
    | 'enqueueReconciliation'
    | 'getIntent'
    | 'getRecoveryView'
    | 'getSystemMetrics'
    | 'ping'
    | 'beginUserWalletSubmission'
    | 'recordUserWalletTransaction'
    | 'completeSubmission'
    | 'markUserWalletUnknown'
  >;
  readonly jobs?: Pick<
    JobLedger,
    | 'createOrReplay'
    | 'createUserWalletOrReplay'
    | 'get'
    | 'list'
    | 'resumeDelivery'
    | 'recordActivityObservation'
    | 'activity'
  >;
  readonly supplier?: SupplierPort;
  readonly paidApi?: PaidApiService;
  readonly walletActivity?: WalletActivityPort;
  readonly userWalletVerifier?: UserWalletVerificationPort;
  readonly authenticator: ServiceAuthenticator;
  readonly rateLimiter?: RateLimiter;
  readonly nextCorrelationId?: () => string;
  readonly bodyLimitBytes?: number;
  readonly config?: ServiceConfig;
  readonly readinessCheck?: () => Promise<{ ready: boolean; reason?: string }>;
  readonly onError?: (error: SanitizedApiError) => void;
}

const createIntentBodySchema = {
  type: 'object',
  additionalProperties: false,
  required: ['business_intent_id', 'recipient', 'amount_atomic', 'asset', 'network', 'purpose'],
  properties: {
    business_intent_id: { type: 'string', minLength: 1, maxLength: 128 },
    recipient: { type: 'string', pattern: '^0x[0-9a-fA-F]{40}$' },
    amount_atomic: { type: 'string', pattern: '^(0|[1-9][0-9]*)$', maxLength: 78 },
    asset: { type: 'string', const: 'USDC' },
    network: { type: 'string', const: 'eip155:5042002' },
    purpose: { type: 'string', minLength: 1, maxLength: 256 },
  },
} as const;

const createJobBodySchema = {
  type: 'object',
  additionalProperties: false,
  required: ['task_key', 'tool_id', 'report_subject', 'recipient', 'amount_atomic'],
  properties: {
    task_key: { type: 'string', minLength: 1, maxLength: 128 },
    tool_id: { type: 'string', const: 'team-report-v1' },
    report_subject: { type: 'string', minLength: 1, maxLength: 256 },
    recipient: { type: 'string', pattern: '^0x[0-9a-fA-F]{40}$' },
    amount_atomic: { type: 'string', pattern: '^(0|[1-9][0-9]*)$', maxLength: 78 },
  },
} as const;

const createPaidApiBodySchema = {
  type: 'object',
  additionalProperties: false,
  required: ['task_key', 'tool_id'],
  properties: {
    task_key: { type: 'string', minLength: 1, maxLength: 128 },
    tool_id: { type: 'string', const: 'circle-x402-api-v1' },
  },
} as const;

const createUserWalletJobBodySchema = {
  ...createJobBodySchema,
  required: [...createJobBodySchema.required, 'payer_wallet'],
  properties: {
    ...createJobBodySchema.properties,
    payer_wallet: { type: 'string', pattern: '^0x[0-9a-fA-F]{40}$' },
  },
} as const;

const userWalletPaymentBodySchema = {
  type: 'object',
  additionalProperties: false,
  required: ['transaction_hash'],
  properties: {
    transaction_hash: { type: 'string', pattern: '^0x[0-9a-fA-F]{64}$' },
  },
} as const;

function sendError(
  reply: FastifyReply,
  status: number,
  code: ErrorCode,
  message: string,
  correlationId: string,
): void {
  const body: ErrorResponse = { code, message, correlation_id: correlationId };
  void reply.code(status).send(body);
}

export function buildApi(dependencies: ApiDependencies) {
  const app = Fastify({ bodyLimit: dependencies.bodyLimitBytes ?? 16 * 1024, logger: false });
  const correlations = new WeakMap<FastifyRequest, string>();
  const nextCorrelationId = dependencies.nextCorrelationId ?? randomUUID;
  const rateLimiter = dependencies.rateLimiter ?? allowAllRateLimiter;
  const workspaceId = dependencies.config?.workspaceId ?? 'local-test-workspace';
  const walletActivity = dependencies.walletActivity ?? new UnavailableWalletActivityPort();
  const jobsUnavailable = (reply: FastifyReply, request: FastifyRequest): void =>
    sendError(
      reply,
      503,
      'NOT_READY',
      'Resumable jobs are not configured',
      correlationFor(request),
    );
  const paidApiUnavailable = (reply: FastifyReply, request: FastifyRequest): void =>
    sendError(
      reply,
      503,
      'NOT_READY',
      'Paid API integration is not configured',
      correlationFor(request),
    );
  const userWalletUnavailable = (reply: FastifyReply, request: FastifyRequest): void =>
    sendError(
      reply,
      503,
      'NOT_READY',
      'User-wallet payment verification is not configured',
      correlationFor(request),
    );
  const onError =
    dependencies.onError ??
    ((error: SanitizedApiError) => {
      process.stderr.write(`${JSON.stringify({ event: 'api_error', ...error })}\n`);
    });

  const correlationFor = (request: FastifyRequest): string => {
    const existing = correlations.get(request);
    if (existing) return existing;
    const inbound = request.headers['x-correlation-id'];
    const value = asCorrelationId(typeof inbound === 'string' ? inbound : nextCorrelationId());
    correlations.set(request, value);
    return value;
  };

  app.addHook('onRequest', async (request, reply) => {
    let correlationId: string;
    try {
      correlationId = correlationFor(request);
    } catch {
      correlationId = asCorrelationId(nextCorrelationId());
      correlations.set(request, correlationId);
      sendError(reply, 400, 'INVALID_REQUEST', 'Invalid correlation identifier', correlationId);
      return reply;
    }
    void reply.header('x-correlation-id', correlationId);
    void reply.header('access-control-allow-origin', '*');
    void reply.header('access-control-allow-methods', 'GET, POST, OPTIONS');
    void reply.header(
      'access-control-allow-headers',
      'authorization, content-type, x-correlation-id',
    );

    if (request.method === 'OPTIONS') {
      void reply.code(204).send();
      return reply;
    }

    if (!request.url.startsWith('/v1/')) return;
    const decision = await dependencies.authenticator.authenticate(request.headers.authorization);
    if (decision !== 'AUTHORIZED') {
      sendError(
        reply,
        decision === 'FORBIDDEN' ? 403 : 401,
        decision === 'FORBIDDEN' ? 'FORBIDDEN' : 'UNAUTHORIZED',
        'Service authentication failed',
        correlationId,
      );
      return reply;
    }
    if (
      request.method === 'POST' &&
      !(await rateLimiter.allow({
        correlationId,
        key: request.ip || 'unknown-client',
        route: request.url.split('?')[0] ?? request.url,
      }))
    ) {
      sendError(reply, 429, 'RATE_LIMITED', 'Request rate limit exceeded', correlationId);
      return reply;
    }
  });

  app.post('/v1/intents', { schema: { body: createIntentBodySchema } }, async (request, reply) => {
    const result = await dependencies.ledger.createOrReplay(request.body, correlationFor(request));
    if (result.kind === 'INTENT_PAYLOAD_CONFLICT') {
      sendError(
        reply,
        409,
        'INTENT_PAYLOAD_CONFLICT',
        'Business Intent already exists with a different immutable payload',
        correlationFor(request),
      );
      return;
    }
    return reply.code(result.kind === 'ACCEPTED' ? 202 : 200).send(result.intent);
  });

  app.post('/v1/jobs', { schema: { body: createJobBodySchema } }, async (request, reply) => {
    if (!dependencies.jobs || !dependencies.supplier) {
      jobsUnavailable(reply, request);
      return;
    }
    const parsed = parseCreateJobRequest(request.body);
    // Supplier creation is non-chargeable and uses the same durable task scope
    // as its idempotency key. The database transaction binds that order and the
    // settlement intent before the worker can observe payment work.
    const jobId = derivedJobId(workspaceId, parsed);
    const order = await dependencies.supplier.createOrder(parsed, jobId);
    const result = await dependencies.jobs.createOrReplay({
      workspaceId,
      request: parsed,
      supplierOrder: order,
      correlationId: correlationFor(request),
    });
    if (result.kind === 'TASK_PAYLOAD_CONFLICT') {
      sendError(
        reply,
        409,
        'INTENT_PAYLOAD_CONFLICT',
        'Task key already has a different immutable payload',
        correlationFor(request),
      );
      return;
    }
    return reply.code(result.kind === 'ACCEPTED' ? 202 : 200).send(result.job);
  });

  app.post('/v1/jobs/quote', { schema: { body: createJobBodySchema } }, async (request, reply) => {
    if (!dependencies.supplier) {
      jobsUnavailable(reply, request);
      return;
    }
    const parsed = parseCreateJobRequest(request.body);
    // Quoting is deliberately non-chargeable: no intent, attempt, settlement,
    // or outbox row is created until the caller explicitly approves via POST /v1/jobs.
    const jobId = derivedJobId(workspaceId, parsed);
    const order = await dependencies.supplier.createOrder(parsed, jobId);
    const quote: SupplierQuote = {
      supplier_id: order.supplier_id,
      order_reference: order.order_reference,
      recipient: order.recipient,
      amount_atomic: order.amount_atomic,
      asset: order.asset,
      network: order.network,
      expires_at: order.expires_at,
    };
    return reply.code(200).send(quote);
  });

  app.post(
    '/v1/jobs/user-wallet/prepare',
    { schema: { body: createUserWalletJobBodySchema } },
    async (request, reply) => {
      if (!dependencies.jobs || !dependencies.supplier) {
        jobsUnavailable(reply, request);
        return;
      }
      const parsed = parseCreateUserWalletJobRequest(request.body);
      const jobRequest = {
        task_key: parsed.task_key,
        tool_id: parsed.tool_id,
        report_subject: parsed.report_subject,
        recipient: parsed.recipient,
        amount_atomic: parsed.amount_atomic,
      } as const;
      const jobId = derivedJobId(workspaceId, jobRequest);
      const order = await dependencies.supplier.createOrder(jobRequest, jobId);
      const result = await dependencies.jobs.createUserWalletOrReplay({
        workspaceId,
        request: parsed,
        supplierOrder: order,
        correlationId: correlationFor(request),
      });
      if (result.kind === 'TASK_PAYLOAD_CONFLICT') {
        sendError(
          reply,
          409,
          'INTENT_PAYLOAD_CONFLICT',
          'Task key already has a different immutable payer or payload',
          correlationFor(request),
        );
        return;
      }
      return reply.code(result.kind === 'ACCEPTED' ? 202 : 200).send(result.job);
    },
  );

  app.post(
    '/v1/paid-api/quote',
    { schema: { body: createPaidApiBodySchema } },
    async (request, reply) => {
      if (!dependencies.paidApi) {
        paidApiUnavailable(reply, request);
        return;
      }
      const parsed = parseCreatePaidApiRequest(request.body);
      try {
        return reply.code(200).send(await dependencies.paidApi.quote(parsed));
      } catch {
        sendError(
          reply,
          503,
          'NOT_READY',
          'Paid API quote is unavailable',
          correlationFor(request),
        );
      }
    },
  );

  app.post(
    '/v1/paid-api',
    { schema: { body: createPaidApiBodySchema } },
    async (request, reply) => {
      if (!dependencies.paidApi) {
        paidApiUnavailable(reply, request);
        return;
      }
      const parsed = parseCreatePaidApiRequest(request.body);
      try {
        const result = await dependencies.paidApi.start(parsed, correlationFor(request));
        if (result.kind === 'INTENT_PAYLOAD_CONFLICT') {
          sendError(
            reply,
            409,
            'INTENT_PAYLOAD_CONFLICT',
            'Task key already has a different immutable paid API quote',
            correlationFor(request),
          );
          return;
        }
        return reply.code(result.kind === 'ACCEPTED' ? 202 : 200).send(result.request);
      } catch {
        sendError(
          reply,
          503,
          'NOT_READY',
          'Paid API request could not be created',
          correlationFor(request),
        );
      }
    },
  );

  app.get<{ Params: { id: string } }>('/v1/paid-api/:id', async (request, reply) => {
    if (!dependencies.paidApi) {
      paidApiUnavailable(reply, request);
      return;
    }
    const paidApi = await dependencies.paidApi.get(request.params.id);
    if (!paidApi) {
      sendError(
        reply,
        404,
        'INTENT_NOT_FOUND',
        'Paid API request was not found in this workspace',
        correlationFor(request),
      );
      return;
    }
    return paidApi;
  });

  app.get('/v1/jobs', async (request, reply) => {
    if (!dependencies.jobs) {
      jobsUnavailable(reply, request);
      return;
    }
    return { jobs: await dependencies.jobs.list(workspaceId) };
  });

  app.get<{ Params: { jobId: string } }>('/v1/jobs/:jobId', async (request, reply) => {
    if (!dependencies.jobs) {
      jobsUnavailable(reply, request);
      return;
    }
    const job = await dependencies.jobs.get(workspaceId, request.params.jobId);
    if (!job) {
      sendError(
        reply,
        404,
        'INTENT_NOT_FOUND',
        'Job was not found in this workspace',
        correlationFor(request),
      );
      return;
    }
    return job;
  });

  app.post<{ Params: { jobId: string } }>(
    '/v1/jobs/:jobId/user-wallet/submit',
    { schema: { body: userWalletPaymentBodySchema } },
    async (request, reply) => {
      if (!dependencies.jobs || !dependencies.userWalletVerifier) {
        userWalletUnavailable(reply, request);
        return;
      }
      const job = await dependencies.jobs.get(workspaceId, request.params.jobId);
      if (!job) {
        sendError(
          reply,
          404,
          'INTENT_NOT_FOUND',
          'Job was not found in this workspace',
          correlationFor(request),
        );
        return;
      }
      if (job.payment_mode !== 'USER_WALLET' || !job.user_payment) {
        sendError(
          reply,
          409,
          'RECONCILIATION_NOT_ALLOWED',
          'This job is not configured for a user-wallet payment',
          correlationFor(request),
        );
        return;
      }
      const transactionHash = asTransactionHash(
        (request.body as { readonly transaction_hash: string }).transaction_hash,
      );
      const begun = await dependencies.ledger.beginUserWalletSubmission(
        job.business_intent_id,
        job.user_payment.payer_wallet,
        correlationFor(request),
      );
      if (!begun.begun) {
        if (begun.currentState === 'COMMITTED' || begun.currentState === 'FAILED_SAFE') {
          const current = await dependencies.jobs.get(workspaceId, request.params.jobId);
          if (current) return reply.code(200).send(current);
        }
        sendError(
          reply,
          begun.reason === 'NOT_FOUND' ? 404 : 409,
          begun.reason === 'NOT_FOUND' ? 'INTENT_NOT_FOUND' : 'RECONCILIATION_NOT_ALLOWED',
          begun.reason === 'NOT_USER_WALLET'
            ? 'The payer wallet does not match the durable user-wallet authorization'
            : 'This user-wallet payment is no longer available for a new submission',
          correlationFor(request),
        );
        return;
      }
      if (begun.transactionHash && begun.transactionHash !== transactionHash) {
        sendError(
          reply,
          409,
          'RECONCILIATION_NOT_ALLOWED',
          'A different transaction hash is already bound to this payment intent',
          correlationFor(request),
        );
        return;
      }
      const recorded = await dependencies.ledger.recordUserWalletTransaction(
        begun.attemptId,
        transactionHash,
      );
      if (recorded === 'CONFLICT' || recorded === 'NOT_FOUND') {
        sendError(
          reply,
          409,
          'RECONCILIATION_NOT_ALLOWED',
          'The transaction could not be bound to the durable payment attempt',
          correlationFor(request),
        );
        return;
      }

      let verification;
      try {
        verification = await dependencies.userWalletVerifier.verify({
          transactionHash,
          walletAddress: job.user_payment.payer_wallet,
          recipient: job.user_payment.recipient,
          amountAtomic: job.user_payment.amount_atomic,
        });
      } catch {
        // Do not classify an RPC outage as no payment. The attempt remains
        // durable and the same hash can be submitted to this endpoint again.
        sendError(
          reply,
          503,
          'NOT_READY',
          'Arc receipt verification is temporarily unavailable; no retry was submitted',
          correlationFor(request),
        );
        return;
      }

      if (verification.kind === 'CONFIRMED') {
        await dependencies.ledger.completeSubmission(job.business_intent_id, begun.attemptId, {
          kind: 'CONFIRMED',
          provider_reference_id: asProviderReferenceId(`user-wallet:${transactionHash}`),
          transaction_hash: asTransactionHash(verification.transactionHash),
          block_number: asBlockNumber(verification.blockNumber),
          transfer_log_index: verification.transferLogIndex,
        });
      } else if (verification.kind === 'FINAL_REVERT') {
        await dependencies.ledger.completeSubmission(job.business_intent_id, begun.attemptId, {
          kind: 'DEFINITELY_NOT_SUBMITTED',
          reason: verification.reason,
        });
      } else {
        await dependencies.ledger.markUserWalletUnknown(
          job.business_intent_id,
          begun.attemptId,
          verification.kind === 'PENDING'
            ? 'User wallet transaction is not final; receipt is not available yet'
            : verification.reason,
        );
      }
      const updated = await dependencies.jobs.get(workspaceId, request.params.jobId);
      if (!updated) {
        sendError(
          reply,
          500,
          'INTERNAL_ERROR',
          'Updated job could not be read',
          correlationFor(request),
        );
        return;
      }
      return reply.code(updated.payment_state === 'UNKNOWN' ? 202 : 200).send(updated);
    },
  );

  app.post<{ Params: { jobId: string } }>('/v1/jobs/:jobId/resume', async (request, reply) => {
    if (!dependencies.jobs) {
      jobsUnavailable(reply, request);
      return;
    }
    const job = await dependencies.jobs.resumeDelivery(workspaceId, request.params.jobId);
    if (!job) {
      sendError(
        reply,
        404,
        'INTENT_NOT_FOUND',
        'Job was not found in this workspace',
        correlationFor(request),
      );
      return;
    }
    return reply.code(202).send(job);
  });

  app.get<{ Params: { jobId: string } }>('/v1/jobs/:jobId/result', async (request, reply) => {
    if (!dependencies.jobs) {
      jobsUnavailable(reply, request);
      return;
    }
    const job = await dependencies.jobs.get(workspaceId, request.params.jobId);
    if (!job) {
      sendError(
        reply,
        404,
        'INTENT_NOT_FOUND',
        'Job was not found in this workspace',
        correlationFor(request),
      );
      return;
    }
    if (!job.result) {
      sendError(
        reply,
        409,
        'RECONCILIATION_NOT_ALLOWED',
        'Result is not available; this endpoint never submits payment',
        correlationFor(request),
      );
      return;
    }
    return job.result;
  });

  app.get('/v1/activity', async (request, reply) => {
    if (!dependencies.jobs) {
      jobsUnavailable(reply, request);
      return;
    }
    return dependencies.jobs.activity(workspaceId);
  });

  app.post('/v1/activity/refresh', async (request, reply) => {
    if (!dependencies.jobs) {
      jobsUnavailable(reply, request);
      return;
    }
    const observation = await walletActivity.refresh();
    await dependencies.jobs.recordActivityObservation({
      workspaceId,
      freshness: observation.freshness,
      coverageNote: observation.coverageNote,
      payload: observation.payload,
    });
    return reply.code(202).send(await dependencies.jobs.activity(workspaceId));
  });

  app.get<{ Params: { id: string } }>('/v1/intents/:id', async (request, reply) => {
    const intent = await dependencies.ledger.getIntent(request.params.id);
    if (!intent) {
      sendError(
        reply,
        404,
        'INTENT_NOT_FOUND',
        'Business Intent was not found',
        correlationFor(request),
      );
      return;
    }
    return intent;
  });

  app.post<{ Params: { id: string } }>('/v1/intents/:id/reconcile', async (request, reply) => {
    const result = await dependencies.ledger.enqueueReconciliation(request.params.id);
    if (!result) {
      sendError(
        reply,
        404,
        'INTENT_NOT_FOUND',
        'Business Intent was not found',
        correlationFor(request),
      );
      return;
    }
    if (!result.queued) {
      sendError(
        reply,
        409,
        'RECONCILIATION_NOT_ALLOWED',
        'Intent state does not permit reconciliation',
        correlationFor(request),
      );
      return;
    }
    return reply.code(202).send(result);
  });

  app.get<{ Params: { id: string } }>('/v1/intents/:id/recovery-view', async (request, reply) => {
    const view = await dependencies.ledger.getRecoveryView(request.params.id);
    if (!view) {
      sendError(
        reply,
        404,
        'INTENT_NOT_FOUND',
        'Business Intent was not found',
        correlationFor(request),
      );
      return;
    }
    return view;
  });

  app.get('/health/live', async () => ({ status: 'ok' as const }));

  app.get('/health/ready', async (request, reply) => {
    const correlationId = correlationFor(request);
    try {
      await dependencies.ledger.ping();

      if (dependencies.config) {
        if (dependencies.config.network && dependencies.config.network !== 'eip155:5042002') {
          sendError(
            reply,
            503,
            'NOT_READY',
            'Invalid network configuration identity',
            correlationId,
          );
          return;
        }
        if (
          dependencies.config.contractVersion &&
          dependencies.config.contractVersion !== '1.0.0'
        ) {
          sendError(reply, 503, 'NOT_READY', 'Incompatible contract version', correlationId);
          return;
        }
      }

      if (dependencies.readinessCheck) {
        const check = await dependencies.readinessCheck();
        if (!check.ready) {
          sendError(
            reply,
            503,
            'NOT_READY',
            check.reason ?? 'Service component not ready',
            correlationId,
          );
          return;
        }
      }

      return {
        status: 'ok' as const,
        ...(dependencies.config?.submissionsDisabled ? { submissions_disabled: true } : {}),
      };
    } catch {
      sendError(reply, 503, 'NOT_READY', 'Database is unavailable', correlationId);
      return;
    }
  });

  app.get('/v1/metrics', async (request, reply) => {
    try {
      const metrics = await dependencies.ledger.getSystemMetrics();
      return metrics;
    } catch {
      sendError(
        reply,
        500,
        'INTERNAL_ERROR',
        'Failed to retrieve system metrics',
        correlationFor(request),
      );
      return;
    }
  });

  app.setErrorHandler((error, request, reply) => {
    const correlationId = correlationFor(request);
    const fastifyError = error as { readonly code?: string; readonly validation?: unknown };
    const errorCode =
      fastifyError.code ??
      (error instanceof ContractValidationError ? 'CONTRACT_VALIDATION' : 'INTERNAL_ERROR');
    const path = request.url.split('?')[0]?.slice(0, 256) ?? '/';
    onError({
      correlationId,
      method: request.method,
      path,
      code: errorCode,
    });
    if (
      error instanceof ContractValidationError ||
      fastifyError.validation ||
      fastifyError.code === 'FST_ERR_CTP_BODY_TOO_LARGE' ||
      fastifyError.code === 'FST_ERR_CTP_EMPTY_JSON_BODY'
    ) {
      sendError(reply, 400, 'INVALID_REQUEST', 'Request failed validation', correlationId);
      return;
    }
    sendError(reply, 500, 'INTERNAL_ERROR', 'Internal service error', correlationId);
  });

  return app;
}
