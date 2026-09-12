import { describe, expect, it } from 'vitest';
import type {
  CreateJobRequest,
  IntentResponse,
  JobView,
  PaidApiResponse,
  PaidApiQuote,
  RecoveryView,
  ReconcileResponse,
} from '@oneshot/contracts';
import type { CreateIntentResult, IntentLedger } from '@oneshot/storage-postgres';
import { CircleX402PreSubmitError } from '@oneshot/supplier-adapter';
import { buildApi, staticBearerAuthenticator, type ApiDependencies } from '../src/index.js';

const request = {
  business_intent_id: 'intent-api-1',
  recipient: '0x1111111111111111111111111111111111111111',
  amount_atomic: '1250000',
  asset: 'USDC' as const,
  network: 'eip155:5042002' as const,
  purpose: 'Invoice INV-1001',
};
const intent: IntentResponse = {
  ...request,
  payload_fingerprint: 'a'.repeat(64),
  state: 'AUTHORIZING',
  version: 1,
  attempts: [
    {
      attempt_id: 'attempt-api-1',
      stage: 'AUTHORIZING',
      created_at: '2026-09-07T12:00:00.000Z',
    },
  ],
  evidence: [],
};

const USER_WALLET_PAYER = '0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa';
const USER_WALLET_HASH = `0x${'f'.repeat(64)}`;

function userWalletJobFixture(overrides: Partial<JobView> = {}): JobView {
  return {
    job_id: `job_${'e'.repeat(64)}`,
    task_key: 'report-user-wallet',
    tool_id: 'team-report-v1',
    business_intent_id: `intent_${'f'.repeat(64)}`,
    supplier: {
      supplier_id: 'team-report-v1',
      order_reference: 'team_report_user_wallet',
      recipient: '0x1111111111111111111111111111111111111111',
      amount_atomic: '1000000',
      asset: 'USDC',
      network: 'eip155:5042002',
      expires_at: '2026-09-12T12:00:00.000Z',
    },
    payment_state: 'READY',
    payment_mode: 'USER_WALLET',
    user_payment: {
      chain_id: 5042002,
      network: 'eip155:5042002',
      token_contract: '0x3600000000000000000000000000000000000000',
      payer_wallet: USER_WALLET_PAYER,
      recipient: '0x1111111111111111111111111111111111111111',
      amount_atomic: '1000000',
    },
    delivery_state: 'NOT_REQUESTED',
    created_at: '2026-09-12T11:00:00.000Z',
    updated_at: '2026-09-12T11:00:00.000Z',
    ...overrides,
  };
}

function createMockLedger(
  overrides: Partial<IntentLedger> = {},
): Pick<
  IntentLedger,
  'createOrReplay' | 'enqueueReconciliation' | 'getIntent' | 'getRecoveryView' | 'ping'
> {
  return {
    async createOrReplay() {
      return { kind: 'ACCEPTED', intent } as CreateIntentResult;
    },
    async enqueueReconciliation(): Promise<ReconcileResponse | undefined> {
      return { business_intent_id: intent.business_intent_id, queued: true, state: 'UNKNOWN' };
    },
    async getIntent() {
      return intent;
    },
    async getRecoveryView(): Promise<RecoveryView> {
      return {
        business_intent_id: intent.business_intent_id,
        authoritative_state: intent.state,
        recommended_action: 'WAIT',
        evidence: [],
      };
    },
    async ping() {},
    ...overrides,
  };
}

describe('API boundary controls', () => {
  it('never reaches the ledger when the credential is forbidden', async () => {
    const calls: string[] = [];
    const app = buildApi({
      ledger: createMockLedger({
        async enqueueReconciliation() {
          calls.push('enqueueReconciliation');
          return { business_intent_id: 'intent-api-1', queued: true, state: 'UNKNOWN' };
        },
      }),
      authenticator: {
        async authenticate() {
          return 'FORBIDDEN';
        },
      },
    });

    const response = await app.inject({
      method: 'POST',
      url: '/v1/intents/intent-api-1/reconcile',
      headers: { authorization: 'Bearer aaa.bbb.ccc' },
    });

    expect(response.statusCode).toBe(403);
    expect(response.json().code).toBe('FORBIDDEN');
    expect(calls).toEqual([]);
    await app.close();
  });

  it('requires service authentication and returns a sanitized error', async () => {
    const app = buildApi({
      ledger: createMockLedger(),
      authenticator: staticBearerAuthenticator('test-token'),
      nextCorrelationId: () => 'correlation-generated',
    });
    const response = await app.inject({ method: 'GET', url: '/v1/intents/intent-api-1' });
    expect(response.statusCode).toBe(401);
    expect(response.json()).toEqual({
      code: 'UNAUTHORIZED',
      message: 'Service authentication failed',
      correlation_id: 'correlation-generated',
    });
    await app.close();
  });

  it('validates schemas without echoing rejected payload material', async () => {
    const app = buildApi({
      ledger: createMockLedger(),
      authenticator: staticBearerAuthenticator('test-token'),
      nextCorrelationId: () => 'correlation-validation',
    });
    const response = await app.inject({
      method: 'POST',
      url: '/v1/intents',
      headers: { authorization: 'Bearer test-token' },
      payload: { ...request, amount_atomic: '1.5', purpose: 'do-not-echo-this' },
    });
    expect(response.statusCode).toBe(400);
    expect(response.body).not.toContain('do-not-echo-this');
    expect(response.json()).toMatchObject({ code: 'INVALID_REQUEST' });
    await app.close();
  });

  it('enforces the request-size and rate-limit seams', async () => {
    const sizeLimited = buildApi({
      ledger: createMockLedger(),
      authenticator: staticBearerAuthenticator('test-token'),
      bodyLimitBytes: 32,
      nextCorrelationId: () => 'correlation-size',
    });
    const tooLarge = await sizeLimited.inject({
      method: 'POST',
      url: '/v1/intents',
      headers: { authorization: 'Bearer test-token' },
      payload: request,
    });
    expect(tooLarge.statusCode).toBe(400);
    await sizeLimited.close();

    const rateLimited = buildApi({
      ledger: createMockLedger(),
      authenticator: staticBearerAuthenticator('test-token'),
      rateLimiter: {
        async allow() {
          return false;
        },
      },
      nextCorrelationId: () => 'correlation-rate',
    });
    const blocked = await rateLimited.inject({
      method: 'POST',
      url: '/v1/intents',
      headers: { authorization: 'Bearer test-token' },
      payload: request,
    });
    expect(blocked.statusCode).toBe(429);
    expect(blocked.json()).toMatchObject({ code: 'RATE_LIMITED' });
    await rateLimited.close();
  });

  it('maps payload conflict to a stable 409 body', async () => {
    const app = buildApi({
      ledger: createMockLedger({
        async createOrReplay() {
          return { kind: 'INTENT_PAYLOAD_CONFLICT', intent };
        },
      }),
      authenticator: staticBearerAuthenticator('test-token'),
      nextCorrelationId: () => 'correlation-conflict',
    });
    const response = await app.inject({
      method: 'POST',
      url: '/v1/intents',
      headers: { authorization: 'Bearer test-token' },
      payload: request,
    });
    expect(response.statusCode).toBe(409);
    expect(response.json()).toEqual({
      code: 'INTENT_PAYLOAD_CONFLICT',
      message: 'Business Intent already exists with a different immutable payload',
      correlation_id: 'correlation-conflict',
    });
    await app.close();
  });

  it('rejects malformed correlation IDs with 400 INVALID_REQUEST', async () => {
    const app = buildApi({
      ledger: createMockLedger(),
      authenticator: staticBearerAuthenticator('test-token'),
    });
    const response = await app.inject({
      method: 'GET',
      url: '/v1/intents/intent-api-1',
      headers: {
        authorization: 'Bearer test-token',
        'x-correlation-id': ' invalid correlation id',
      },
    });
    expect(response.statusCode).toBe(400);
    expect(response.json()).toMatchObject({ code: 'INVALID_REQUEST' });
    await app.close();
  });
});

describe('OpenAPI contract endpoints', () => {
  it('quotes and starts the durable Circle x402 paid API request with replay semantics', async () => {
    const quote: PaidApiQuote = {
      supplier_id: 'circle-x402-v1',
      resource_url: 'https://x402.example.test/api/dataset',
      recipient: request.recipient,
      amount_atomic: '10000',
      asset: 'USDC',
      network: 'eip155:5042002',
      x402_version: 2,
      max_timeout_seconds: 60,
    };
    const paidRequest: PaidApiResponse = {
      business_intent_id: 'intent-paid-api-1',
      task_key: 'circle-api-test',
      tool_id: 'circle-x402-api-v1',
      resource_url: quote.resource_url,
      payment_state: 'AUTHORIZING',
      quote,
      created_at: '2026-09-11T12:00:00.000Z',
      updated_at: '2026-09-11T12:00:00.000Z',
    };
    let mode: 'ACCEPTED' | 'REPLAY_IDENTICAL' = 'ACCEPTED';
    let starts = 0;
    const app = buildApi({
      ledger: createMockLedger(),
      paidApi: {
        async quote() {
          return quote;
        },
        async start() {
          starts += 1;
          return { kind: mode, request: paidRequest };
        },
        async get() {
          return paidRequest;
        },
      },
      authenticator: staticBearerAuthenticator('test-token'),
      config: { workspaceId: 'workspace-paid-api' },
      nextCorrelationId: () => 'correlation-paid-api',
    });

    const quoteResponse = await app.inject({
      method: 'POST',
      url: '/v1/paid-api/quote',
      headers: { authorization: 'Bearer test-token' },
      payload: { task_key: 'circle-api-test', tool_id: 'circle-x402-api-v1' },
    });
    expect(quoteResponse.statusCode).toBe(200);
    expect(quoteResponse.json()).toEqual(quote);

    const missingApproval = await app.inject({
      method: 'POST',
      url: '/v1/paid-api',
      headers: { authorization: 'Bearer test-token' },
      payload: { task_key: 'circle-api-test', tool_id: 'circle-x402-api-v1' },
    });
    expect(missingApproval.statusCode).toBe(400);
    expect(starts).toBe(0);

    const accepted = await app.inject({
      method: 'POST',
      url: '/v1/paid-api',
      headers: { authorization: 'Bearer test-token' },
      payload: {
        task_key: 'circle-api-test',
        tool_id: 'circle-x402-api-v1',
        approved_quote: quote,
      },
    });
    expect(accepted.statusCode).toBe(202);
    expect(accepted.json()).toEqual(paidRequest);

    mode = 'REPLAY_IDENTICAL';
    const replayed = await app.inject({
      method: 'POST',
      url: '/v1/paid-api',
      headers: { authorization: 'Bearer test-token' },
      payload: {
        task_key: 'circle-api-test',
        tool_id: 'circle-x402-api-v1',
        approved_quote: quote,
      },
    });
    expect(replayed.statusCode).toBe(200);
    expect(starts).toBe(2);

    const found = await app.inject({
      method: 'GET',
      url: '/v1/paid-api/intent-paid-api-1',
      headers: { authorization: 'Bearer test-token' },
    });
    expect(found.statusCode).toBe(200);
    expect(found.json()).toEqual(paidRequest);
    await app.close();
  });

  it('prepares and submits a Circle payment signed by the connected user wallet', async () => {
    const quote: PaidApiQuote = {
      supplier_id: 'circle-x402-v1',
      resource_url: 'https://x402.example.test/api/dataset',
      recipient: request.recipient,
      amount_atomic: '10000',
      asset: 'USDC',
      network: 'eip155:5042002',
      x402_version: 2,
      max_timeout_seconds: 60,
    };
    const payer = '0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa';
    const prepared: PaidApiResponse = {
      business_intent_id: 'intent-paid-api-user-wallet',
      task_key: 'circle-api-user-wallet',
      tool_id: 'circle-x402-api-v1',
      resource_url: quote.resource_url,
      payment_state: 'READY',
      payment_mode: 'USER_WALLET',
      payer_wallet: payer,
      quote,
      created_at: '2026-09-12T00:00:00Z',
      updated_at: '2026-09-12T00:00:00Z',
    };
    const committed: PaidApiResponse = {
      ...prepared,
      payment_state: 'COMMITTED',
      provider_transaction_hash: `0x${'b'.repeat(64)}`,
      settlement: {
        provider_reference_id: 'circle-x402-user:nonce',
        transaction_hash: `0x${'b'.repeat(64)}`,
        block_number: '100',
        transfer_log_index: 0,
      },
      response: { rows: 1 },
    };
    const calls: Array<{ name: string; value: unknown }> = [];
    const app = buildApi({
      ledger: createMockLedger(),
      paidApi: {
        async quote() {
          return quote;
        },
        async start() {
          throw new Error('server-paid path must not be used');
        },
        async prepareUserWallet(_request, _correlationId, approvedQuote, payerWallet) {
          calls.push({ name: 'prepare', value: { approvedQuote, payerWallet } });
          return { kind: 'ACCEPTED' as const, request: prepared };
        },
        async submitUserWallet(id, payerWallet, paymentPayload) {
          calls.push({ name: 'submit', value: { id, payerWallet, paymentPayload } });
          return committed;
        },
        async reconcileUserWallet(id) {
          calls.push({ name: 'reconcile', value: { id } });
          return committed;
        },
        async get() {
          return committed;
        },
      },
      authenticator: staticBearerAuthenticator('test-token'),
      config: { workspaceId: 'workspace-paid-api-user-wallet' },
      nextCorrelationId: () => 'correlation-paid-api-user-wallet',
    });
    const headers = { authorization: 'Bearer test-token' };
    const prepare = await app.inject({
      method: 'POST',
      url: '/v1/paid-api/user-wallet/prepare',
      headers,
      payload: {
        task_key: prepared.task_key,
        tool_id: prepared.tool_id,
        approved_quote: quote,
        payer_wallet: payer,
      },
    });
    expect(prepare.statusCode).toBe(202);
    expect(prepare.json()).toEqual(prepared);

    const paymentPayload = {
      x402Version: 2,
      payload: {
        authorization: { nonce: `0x${'c'.repeat(64)}` },
        signature: `0x${'d'.repeat(128)}`,
      },
    };
    const submit = await app.inject({
      method: 'POST',
      url: `/v1/paid-api/${prepared.business_intent_id}/user-wallet/submit`,
      headers,
      payload: { payer_wallet: payer, payment_payload: paymentPayload },
    });
    expect(submit.statusCode).toBe(200);
    expect(submit.json()).toEqual(committed);
    const reconciled = await app.inject({
      method: 'POST',
      url: `/v1/paid-api/${prepared.business_intent_id}/user-wallet/reconcile`,
      headers,
    });
    expect(reconciled.statusCode).toBe(200);
    expect(reconciled.json()).toEqual(committed);
    expect(calls).toEqual([
      { name: 'prepare', value: { approvedQuote: quote, payerWallet: payer } },
      {
        name: 'submit',
        value: { id: prepared.business_intent_id, payerWallet: payer, paymentPayload },
      },
      { name: 'reconcile', value: { id: prepared.business_intent_id } },
    ]);
    await app.close();
  });

  it('returns a safe 400 when a Circle authorization is refused before forwarding', async () => {
    const payer = '0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa';
    const app = buildApi({
      ledger: createMockLedger(),
      paidApi: {
        async quote() {
          throw new Error('not used');
        },
        async start() {
          throw new Error('not used');
        },
        async prepareUserWallet() {
          throw new Error('not used');
        },
        async submitUserWallet() {
          throw new CircleX402PreSubmitError('internal parsing detail');
        },
        async reconcileUserWallet() {
          throw new Error('not used');
        },
        async get() {
          return undefined;
        },
      },
      authenticator: staticBearerAuthenticator('test-token'),
      nextCorrelationId: () => 'correlation-circle-presubmit',
    });

    const response = await app.inject({
      method: 'POST',
      url: '/v1/paid-api/intent-paid-api-user-wallet/user-wallet/submit',
      headers: { authorization: 'Bearer test-token' },
      payload: {
        payer_wallet: payer,
        payment_payload: { x402Version: 2, payload: {} },
      },
    });

    expect(response.statusCode).toBe(400);
    expect(response.json()).toEqual({
      code: 'INVALID_REQUEST',
      message:
        'The Circle authorization is no longer valid. No payment was sent; sign a fresh authorization.',
      correlation_id: 'correlation-circle-presubmit',
    });
    await app.close();
  });

  it('POST /v1/intents returns 202 for new intent and 200 for identical replay', async () => {
    let mode: 'ACCEPTED' | 'REPLAY_IDENTICAL' = 'ACCEPTED';
    const app = buildApi({
      ledger: createMockLedger({
        async createOrReplay() {
          return { kind: mode, intent };
        },
      }),
      authenticator: staticBearerAuthenticator('test-token'),
      nextCorrelationId: () => 'correlation-post',
    });

    const acceptedResponse = await app.inject({
      method: 'POST',
      url: '/v1/intents',
      headers: { authorization: 'Bearer test-token', 'x-correlation-id': 'custom-cid-1' },
      payload: request,
    });
    expect(acceptedResponse.statusCode).toBe(202);
    expect(acceptedResponse.headers['x-correlation-id']).toBe('custom-cid-1');
    expect(acceptedResponse.json()).toEqual(intent);

    mode = 'REPLAY_IDENTICAL';
    const replayedResponse = await app.inject({
      method: 'POST',
      url: '/v1/intents',
      headers: { authorization: 'Bearer test-token' },
      payload: request,
    });
    expect(replayedResponse.statusCode).toBe(200);
    expect(replayedResponse.json()).toEqual(intent);
    await app.close();
  });

  it('GET /v1/intents/:id returns 200 or 404 when not found', async () => {
    const app = buildApi({
      ledger: createMockLedger({
        async getIntent(id) {
          return id === 'intent-api-1' ? intent : undefined;
        },
      }),
      authenticator: staticBearerAuthenticator('test-token'),
      nextCorrelationId: () => 'correlation-get',
    });

    const found = await app.inject({
      method: 'GET',
      url: '/v1/intents/intent-api-1',
      headers: { authorization: 'Bearer test-token' },
    });
    expect(found.statusCode).toBe(200);
    expect(found.json()).toEqual(intent);

    const notFound = await app.inject({
      method: 'GET',
      url: '/v1/intents/missing-id',
      headers: { authorization: 'Bearer test-token' },
    });
    expect(notFound.statusCode).toBe(404);
    expect(notFound.json()).toMatchObject({
      code: 'INTENT_NOT_FOUND',
      message: 'Business Intent was not found',
    });
    await app.close();
  });

  it('POST /v1/intents/:id/reconcile returns 202, 404, or 409', async () => {
    let reconcileResult: ReconcileResponse | undefined = {
      business_intent_id: 'intent-api-1',
      queued: true,
      state: 'UNKNOWN',
    };
    const app = buildApi({
      ledger: createMockLedger({
        async enqueueReconciliation() {
          return reconcileResult;
        },
      }),
      authenticator: staticBearerAuthenticator('test-token'),
      nextCorrelationId: () => 'correlation-reconcile',
    });

    const queued = await app.inject({
      method: 'POST',
      url: '/v1/intents/intent-api-1/reconcile',
      headers: { authorization: 'Bearer test-token' },
    });
    expect(queued.statusCode).toBe(202);
    expect(queued.json()).toEqual(reconcileResult);

    reconcileResult = { business_intent_id: 'intent-api-1', queued: false, state: 'COMMITTED' };
    const notAllowed = await app.inject({
      method: 'POST',
      url: '/v1/intents/intent-api-1/reconcile',
      headers: { authorization: 'Bearer test-token' },
    });
    expect(notAllowed.statusCode).toBe(409);
    expect(notAllowed.json()).toMatchObject({ code: 'RECONCILIATION_NOT_ALLOWED' });

    reconcileResult = undefined;
    const notFound = await app.inject({
      method: 'POST',
      url: '/v1/intents/missing-id/reconcile',
      headers: { authorization: 'Bearer test-token' },
    });
    expect(notFound.statusCode).toBe(404);
    expect(notFound.json()).toMatchObject({ code: 'INTENT_NOT_FOUND' });
    await app.close();
  });

  it('GET /v1/intents/:id/recovery-view returns 200 or 404', async () => {
    const app = buildApi({
      ledger: createMockLedger({
        async getRecoveryView(id) {
          if (id !== 'intent-api-1') return undefined;
          return {
            business_intent_id: 'intent-api-1',
            authoritative_state: 'COMMITTED',
            recommended_action: 'RETURN_EXISTING_RESULT',
            evidence: [],
          };
        },
      }),
      authenticator: staticBearerAuthenticator('test-token'),
      nextCorrelationId: () => 'correlation-recovery',
    });

    const found = await app.inject({
      method: 'GET',
      url: '/v1/intents/intent-api-1/recovery-view',
      headers: { authorization: 'Bearer test-token' },
    });
    expect(found.statusCode).toBe(200);
    expect(found.json()).toEqual({
      business_intent_id: 'intent-api-1',
      authoritative_state: 'COMMITTED',
      recommended_action: 'RETURN_EXISTING_RESULT',
      evidence: [],
    });

    const notFound = await app.inject({
      method: 'GET',
      url: '/v1/intents/missing/recovery-view',
      headers: { authorization: 'Bearer test-token' },
    });
    expect(notFound.statusCode).toBe(404);
    expect(notFound.json()).toMatchObject({ code: 'INTENT_NOT_FOUND' });
    await app.close();
  });

  it('classifies an empty JSON reconcile body as a client error and logs only safe identity', async () => {
    const errors: Array<Record<string, string>> = [];
    const app = buildApi({
      ledger: createMockLedger(),
      authenticator: staticBearerAuthenticator('test-token'),
      nextCorrelationId: () => 'correlation-empty-body',
      onError: (error) => errors.push(error),
    });

    const response = await app.inject({
      method: 'POST',
      url: '/v1/intents/intent-api-1/reconcile?token=must-not-log',
      headers: {
        authorization: 'Bearer test-token',
        'content-type': 'application/json',
      },
      payload: '',
    });

    expect(response.statusCode).toBe(400);
    expect(response.json()).toMatchObject({
      code: 'INVALID_REQUEST',
      correlation_id: 'correlation-empty-body',
    });
    expect(errors).toEqual([
      {
        correlationId: 'correlation-empty-body',
        method: 'POST',
        path: '/v1/intents/intent-api-1/reconcile',
        code: 'FST_ERR_CTP_EMPTY_JSON_BODY',
      },
    ]);
    await app.close();
  });

  it('GET /health/live and /health/ready reflect status without authentication', async () => {
    let pingHealthy = true;
    const app = buildApi({
      ledger: createMockLedger({
        async ping() {
          if (!pingHealthy) throw new Error('DB connection refused');
        },
      }),
      authenticator: staticBearerAuthenticator('test-token'),
      nextCorrelationId: () => 'correlation-health',
    });

    const live = await app.inject({ method: 'GET', url: '/health/live' });
    expect(live.statusCode).toBe(200);
    expect(live.json()).toEqual({ status: 'ok' });

    const ready = await app.inject({ method: 'GET', url: '/health/ready' });
    expect(ready.statusCode).toBe(200);
    expect(ready.json()).toEqual({ status: 'ok' });

    pingHealthy = false;
    const notReady = await app.inject({ method: 'GET', url: '/health/ready' });
    expect(notReady.statusCode).toBe(503);
    expect(notReady.json()).toMatchObject({ code: 'NOT_READY' });
    await app.close();
  });
});

describe('resumable job API boundary', () => {
  it('creates, scopes, resumes, retrieves, and records activity without granting a settlement path', async () => {
    let job: JobView = {
      job_id: `job_${'c'.repeat(64)}`,
      task_key: 'report-acme',
      tool_id: 'team-report-v1',
      business_intent_id: `intent_${'d'.repeat(64)}`,
      supplier: {
        supplier_id: 'team-report-v1',
        order_reference: 'team_report_order_api',
        recipient: '0x1111111111111111111111111111111111111111',
        amount_atomic: '2500000',
        asset: 'USDC',
        network: 'eip155:5042002',
        expires_at: '2026-09-08T12:00:00.000Z',
      },
      payment_state: 'COMMITTED',
      payment_mode: 'SERVER_PRIVY',
      delivery_state: 'RETRIEVAL_FAILED',
      created_at: '2026-09-07T12:00:00.000Z',
      updated_at: '2026-09-07T12:01:00.000Z',
    };
    const calls: Array<{ operation: string; workspaceId?: string }> = [];
    let supplierRequest: unknown;
    let createMode: 'ACCEPTED' | 'TASK_PAYLOAD_CONFLICT' = 'ACCEPTED';
    const jobs = {
      async createOrReplay(params: { workspaceId: string }) {
        calls.push({ operation: 'create', workspaceId: params.workspaceId });
        return createMode === 'ACCEPTED'
          ? { kind: 'ACCEPTED' as const, job }
          : { kind: 'TASK_PAYLOAD_CONFLICT' as const, job };
      },
      async get(workspaceId: string, jobId: string) {
        calls.push({ operation: `get:${jobId}`, workspaceId });
        return jobId === job.job_id ? job : undefined;
      },
      async list(workspaceId: string) {
        calls.push({ operation: 'list', workspaceId });
        return [job];
      },
      async resumeDelivery(workspaceId: string, jobId: string) {
        calls.push({ operation: `resume:${jobId}`, workspaceId });
        if (jobId !== job.job_id) return undefined;
        job = { ...job, delivery_state: 'PENDING', updated_at: '2026-09-07T12:02:00.000Z' };
        return job;
      },
      async recordActivityObservation(params: { workspaceId: string }) {
        calls.push({ operation: 'observe', workspaceId: params.workspaceId });
      },
      async activity(workspaceId: string) {
        calls.push({ operation: 'activity', workspaceId });
        return {
          recorded_settlement_count: 1,
          uncertain_job_count: 0,
          unmatched_transfer_count: 0,
          transfers: [],
        };
      },
    } as unknown as ApiDependencies['jobs'];
    const app = buildApi({
      ledger: createMockLedger(),
      jobs,
      supplier: {
        async createOrder(request: CreateJobRequest) {
          supplierRequest = request;
          return {
            ...job.supplier,
            supplier_payload_fingerprint: 'e'.repeat(64),
          };
        },
        async fulfillOrder() {
          throw new Error('API must not fulfill supplier orders');
        },
        async getResult() {
          return null;
        },
      },
      walletActivity: {
        async refresh() {
          return { freshness: 'FRESH', coverageNote: 'indexed', payload: { transfers: [] } };
        },
      },
      authenticator: staticBearerAuthenticator('test-token'),
      config: { workspaceId: 'workspace-api-test' },
      nextCorrelationId: () => 'correlation-job-api',
    });
    const headers = { authorization: 'Bearer test-token' };
    const payload = {
      task_key: 'report-acme',
      tool_id: 'team-report-v1',
      report_subject: 'Acme',
      recipient: '0x1111111111111111111111111111111111111111',
      amount_atomic: '2500000',
    };

    const quote = await app.inject({ method: 'POST', url: '/v1/jobs/quote', headers, payload });
    expect(quote.statusCode).toBe(200);
    expect(quote.json()).toEqual(job.supplier);
    expect(supplierRequest).toEqual(payload);
    expect(calls).toEqual([]);

    const created = await app.inject({ method: 'POST', url: '/v1/jobs', headers, payload });
    expect(created.statusCode).toBe(202);
    expect(created.json()).toMatchObject({ job_id: job.job_id, payment_state: 'COMMITTED' });
    expect((await app.inject({ method: 'GET', url: '/v1/jobs', headers })).json()).toEqual({
      jobs: [job],
    });
    expect(
      (await app.inject({ method: 'GET', url: `/v1/jobs/${job.job_id}`, headers })).statusCode,
    ).toBe(200);

    const unavailable = await app.inject({
      method: 'GET',
      url: `/v1/jobs/${job.job_id}/result`,
      headers,
    });
    expect(unavailable.statusCode).toBe(409);
    expect(unavailable.json()).toMatchObject({ code: 'RECONCILIATION_NOT_ALLOWED' });
    expect(
      (await app.inject({ method: 'POST', url: `/v1/jobs/${job.job_id}/resume`, headers }))
        .statusCode,
    ).toBe(202);

    job = {
      ...job,
      delivery_state: 'AVAILABLE',
      result: {
        order_reference: 'team_report_order_api',
        result_reference: 'team_report_result_api',
        report: 'retrieved result',
      },
    };
    expect(
      (await app.inject({ method: 'GET', url: `/v1/jobs/${job.job_id}/result`, headers })).json(),
    ).toEqual(job.result);
    expect(
      (
        await app.inject({
          method: 'POST',
          url: '/v1/activity/refresh',
          headers: { ...headers, 'content-type': 'application/json' },
        })
      ).statusCode,
    ).toBe(202);
    expect((await app.inject({ method: 'GET', url: '/v1/activity', headers })).json()).toEqual({
      recorded_settlement_count: 1,
      uncertain_job_count: 0,
      unmatched_transfer_count: 0,
      transfers: [],
    });

    createMode = 'TASK_PAYLOAD_CONFLICT';
    const conflict = await app.inject({ method: 'POST', url: '/v1/jobs', headers, payload });
    expect(conflict.statusCode).toBe(409);
    expect(
      calls.every(
        (call) => call.workspaceId === undefined || call.workspaceId === 'workspace-api-test',
      ),
    ).toBe(true);
    await app.close();
  });

  it('prepares and confirms a user-wallet payment without invoking the server wallet', async () => {
    const payer = USER_WALLET_PAYER;
    const hash = USER_WALLET_HASH;
    let job: JobView = userWalletJobFixture();
    const calls: string[] = [];
    const jobs = {
      async createUserWalletOrReplay() {
        calls.push('prepare');
        return { kind: 'ACCEPTED' as const, job };
      },
      async get(_workspaceId: string, jobId: string) {
        return jobId === job.job_id ? job : undefined;
      },
    } as unknown as ApiDependencies['jobs'];
    const ledger = {
      ...createMockLedger(),
      async beginUserWalletSubmission() {
        calls.push('begin');
        return {
          begun: true as const,
          intent,
          attemptId: 'attempt-user-wallet',
          state: 'SUBMITTING' as const,
          version: 2,
        };
      },
      async recordUserWalletTransaction() {
        calls.push('record');
        return 'RECORDED' as const;
      },
      async completeSubmission() {
        calls.push('complete');
        job = {
          ...job,
          payment_state: 'COMMITTED',
          settlement: {
            provider_reference_id: `user-wallet:${hash}`,
            transaction_hash: hash,
            block_number: '123',
            transfer_log_index: 0,
          },
        };
        return { completed: true as const, state: 'COMMITTED' as const, version: 3 };
      },
      async markUserWalletUnknown() {
        calls.push('unknown');
        return { completed: true as const, state: 'UNKNOWN' as const, version: 3 };
      },
    } as unknown as ApiDependencies['ledger'];
    const app = buildApi({
      ledger,
      jobs,
      supplier: {
        async createOrder() {
          return { ...job.supplier, supplier_payload_fingerprint: 'a'.repeat(64) };
        },
        async fulfillOrder() {
          throw new Error('API must not fulfill supplier orders');
        },
        async getResult() {
          return null;
        },
      },
      userWalletVerifier: {
        async verify() {
          calls.push('verify');
          return {
            kind: 'CONFIRMED' as const,
            transactionHash: hash,
            blockNumber: '123',
            transferLogIndex: 0,
          };
        },
      },
      authenticator: staticBearerAuthenticator('test-token'),
      config: { workspaceId: 'workspace-user-wallet' },
    });
    const headers = { authorization: 'Bearer test-token' };
    const payload = {
      task_key: 'report-user-wallet',
      tool_id: 'team-report-v1',
      report_subject: 'Acme',
      recipient: job.supplier.recipient,
      amount_atomic: job.supplier.amount_atomic,
      payer_wallet: payer,
    };

    const prepared = await app.inject({
      method: 'POST',
      url: '/v1/jobs/user-wallet/prepare',
      headers,
      payload,
    });
    expect(prepared.statusCode).toBe(202);
    expect(prepared.json()).toMatchObject({ payment_mode: 'USER_WALLET' });

    const submitted = await app.inject({
      method: 'POST',
      url: `/v1/jobs/${job.job_id}/user-wallet/submit`,
      headers,
      payload: { transaction_hash: hash },
    });
    expect(submitted.statusCode).toBe(200);
    expect(submitted.json()).toMatchObject({ payment_state: 'COMMITTED' });
    expect(calls).toEqual(['prepare', 'begin', 'record', 'verify', 'complete']);
    await app.close();
  });

  it.each([
    {
      label: 'a pending receipt',
      verification: { kind: 'PENDING' as const },
    },
    {
      label: 'a receipt without the expected Transfer',
      verification: { kind: 'NOT_CONFIRMED' as const, reason: 'recipient or amount mismatch' },
    },
  ])('marks $label UNKNOWN without completing or retrying payment', async ({ verification }) => {
    let job = userWalletJobFixture();
    const calls: string[] = [];
    const jobs = {
      async get(_workspaceId: string, jobId: string) {
        return jobId === job.job_id ? job : undefined;
      },
    } as unknown as ApiDependencies['jobs'];
    const ledger = {
      ...createMockLedger(),
      async beginUserWalletSubmission() {
        calls.push('begin');
        return {
          begun: true as const,
          intent,
          attemptId: 'attempt-user-wallet-unknown',
          state: 'SUBMITTING' as const,
          version: 2,
        };
      },
      async recordUserWalletTransaction() {
        calls.push('record');
        return 'RECORDED' as const;
      },
      async completeSubmission() {
        calls.push('complete');
        throw new Error('UNKNOWN must not complete');
      },
      async markUserWalletUnknown() {
        calls.push('unknown');
        job = { ...job, payment_state: 'UNKNOWN' };
        return { completed: true as const, state: 'UNKNOWN' as const, version: 3 };
      },
    } as unknown as ApiDependencies['ledger'];
    const app = buildApi({
      ledger,
      jobs,
      userWalletVerifier: {
        async verify() {
          return verification;
        },
      },
      authenticator: staticBearerAuthenticator('test-token'),
    });

    const response = await app.inject({
      method: 'POST',
      url: `/v1/jobs/${job.job_id}/user-wallet/submit`,
      headers: { authorization: 'Bearer test-token' },
      payload: { transaction_hash: USER_WALLET_HASH },
    });
    expect(response.statusCode).toBe(202);
    expect(response.json()).toMatchObject({ payment_state: 'UNKNOWN' });
    expect(calls).toEqual(['begin', 'record', 'unknown']);
    await app.close();
  });

  it('refuses a different transaction hash after one hash is durably bound', async () => {
    const durableHash = `0x${'a'.repeat(64)}`;
    const differentHash = `0x${'b'.repeat(64)}`;
    const job = userWalletJobFixture({ payment_state: 'UNKNOWN' });
    let recorded = false;
    const ledger = {
      ...createMockLedger(),
      async beginUserWalletSubmission() {
        return {
          begun: true as const,
          intent,
          attemptId: 'attempt-user-wallet-bound',
          transactionHash: durableHash,
          state: 'UNKNOWN' as const,
          version: 3,
        };
      },
      async recordUserWalletTransaction() {
        recorded = true;
        return 'CONFLICT' as const;
      },
    } as unknown as ApiDependencies['ledger'];
    const app = buildApi({
      ledger,
      jobs: {
        async get(_workspaceId: string, jobId: string) {
          return jobId === job.job_id ? job : undefined;
        },
      } as unknown as ApiDependencies['jobs'],
      userWalletVerifier: {
        async verify() {
          throw new Error('must not verify');
        },
      },
      authenticator: staticBearerAuthenticator('test-token'),
    });

    const response = await app.inject({
      method: 'POST',
      url: `/v1/jobs/${job.job_id}/user-wallet/submit`,
      headers: { authorization: 'Bearer test-token' },
      payload: { transaction_hash: differentHash },
    });
    expect(response.statusCode).toBe(409);
    expect(response.json()).toMatchObject({ code: 'RECONCILIATION_NOT_ALLOWED' });
    expect(recorded).toBe(false);
    await app.close();
  });

  it('refuses submission for a non-user-wallet job', async () => {
    const job = userWalletJobFixture({
      payment_mode: 'SERVER_PRIVY',
      payment_state: 'AUTHORIZING',
    });
    const app = buildApi({
      ledger: createMockLedger(),
      jobs: {
        async get(_workspaceId: string, jobId: string) {
          return jobId === job.job_id ? job : undefined;
        },
      } as unknown as ApiDependencies['jobs'],
      userWalletVerifier: {
        async verify() {
          throw new Error('must not verify');
        },
      },
      authenticator: staticBearerAuthenticator('test-token'),
    });

    const response = await app.inject({
      method: 'POST',
      url: `/v1/jobs/${job.job_id}/user-wallet/submit`,
      headers: { authorization: 'Bearer test-token' },
      payload: { transaction_hash: USER_WALLET_HASH },
    });
    expect(response.statusCode).toBe(409);
    expect(response.json()).toMatchObject({ code: 'RECONCILIATION_NOT_ALLOWED' });
    await app.close();
  });

  it('returns 409 when preparation detects a different payer for the task key', async () => {
    const job = userWalletJobFixture();
    const app = buildApi({
      ledger: createMockLedger(),
      jobs: {
        async createUserWalletOrReplay() {
          return { kind: 'TASK_PAYLOAD_CONFLICT' as const, job };
        },
      } as unknown as ApiDependencies['jobs'],
      supplier: {
        async createOrder() {
          return { ...job.supplier, supplier_payload_fingerprint: 'a'.repeat(64) };
        },
        async fulfillOrder() {
          throw new Error('must not fulfill');
        },
        async getResult() {
          return null;
        },
      },
      authenticator: staticBearerAuthenticator('test-token'),
    });

    const response = await app.inject({
      method: 'POST',
      url: '/v1/jobs/user-wallet/prepare',
      headers: { authorization: 'Bearer test-token' },
      payload: {
        task_key: job.task_key,
        tool_id: job.tool_id,
        report_subject: 'Acme',
        recipient: job.supplier.recipient,
        amount_atomic: job.supplier.amount_atomic,
        payer_wallet: `0x${'b'.repeat(40)}`,
      },
    });
    expect(response.statusCode).toBe(409);
    expect(response.json()).toMatchObject({ code: 'INTENT_PAYLOAD_CONFLICT' });
    await app.close();
  });
});
