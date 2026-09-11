import { describe, expect, it } from 'vitest';
import type {
  AuthorizationResult,
  CreateIntentRequest,
  IntentResponse,
  SettlementResult,
} from '@oneshot/contracts';
import type {
  ClaimSubmissionResult,
  CompleteAuthorizationResult,
  CompleteSubmissionResult,
  CreateIntentResult,
  IntentLedger,
} from '@oneshot/storage-postgres';
import type { JobLedger } from '@oneshot/storage-postgres';
import {
  createTaskList,
  drainOutboxJobs,
  executeAuthorizeIntent,
  executeFulfillSupplierOrder,
  executeSubmitSettlement,
} from '../src/index.js';
import { withResponseLossAfterBroadcast } from '../src/failure-injection.js';

const sampleRequest: CreateIntentRequest = {
  business_intent_id: 'intent-worker-unit-1',
  recipient: '0x1111111111111111111111111111111111111111',
  amount_atomic: '1000000',
  asset: 'USDC',
  network: 'eip155:5042002',
  purpose: 'Test worker unit execution',
};

const sampleIntent: IntentResponse = {
  ...sampleRequest,
  payload_fingerprint: 'f'.repeat(64),
  state: 'AUTHORIZING',
  version: 1,
  attempts: [],
  evidence: [],
};

function createMockLedger(overrides: Partial<IntentLedger> = {}): IntentLedger {
  return {
    async createOrReplay(): Promise<CreateIntentResult> {
      return { kind: 'ACCEPTED', intent: sampleIntent };
    },
    async getIntent(): Promise<IntentResponse | undefined> {
      return sampleIntent;
    },
    async getRecoveryView() {
      return undefined;
    },
    async enqueueReconciliation() {
      return undefined;
    },
    async appendEvidence() {},
    async ping() {},
    async completeAuthorization(): Promise<CompleteAuthorizationResult> {
      return { completed: true, state: 'READY', version: 2 };
    },
    async claimSubmission(): Promise<ClaimSubmissionResult> {
      return {
        claimed: true,
        intent: { ...sampleIntent, state: 'READY' },
        attemptId: 'attempt-mock-1',
        correlationId: 'corr-mock-1',
        version: 2,
      };
    },
    async completeSubmission(): Promise<CompleteSubmissionResult> {
      return { completed: true, state: 'COMMITTED', version: 3 };
    },
    ...overrides,
  } as unknown as IntentLedger;
}

describe('Worker Unit Logic', () => {
  it('registers all required task definitions', () => {
    const tasks = createTaskList({
      pool: {} as never,
      ledger: createMockLedger(),
      settlementPort: {
        async submit() {
          return {
            kind: 'CONFIRMED',
            provider_reference_id: 'ref-1',
            transaction_hash: `0x${'a'.repeat(64)}`,
            block_number: '100',
            transfer_log_index: 0,
          };
        },
      },
    });
    expect(Object.keys(tasks).sort()).toEqual([
      'authorize_intent',
      'fulfill_supplier_order',
      'reconcile_intent',
      'submit_settlement',
    ]);
  });

  it('authorizes intent and advances state to READY', async () => {
    let completedState: string | undefined;
    const ledger = createMockLedger({
      async completeAuthorization(_id, _ver, result: AuthorizationResult) {
        completedState = result.kind === 'AUTHORIZED' ? 'READY' : 'REJECTED';
        return { completed: true, state: 'READY', version: 2 };
      },
    });

    await executeAuthorizeIntent('intent-worker-unit-1', {
      pool: {} as never,
      ledger,
      authorizationPort: {
        async authorize() {
          return { kind: 'AUTHORIZED' };
        },
      },
      settlementPort: {} as never,
    });

    expect(completedState).toBe('READY');
  });

  it('submits settlement when CAS claim succeeds', async () => {
    let portCalled = false;
    let completedState: string | undefined;

    const ledger = createMockLedger({
      async completeSubmission(_id, _attemptId, result: SettlementResult) {
        completedState = result.kind;
        return { completed: true, state: 'COMMITTED', version: 3 };
      },
    });

    await executeSubmitSettlement('intent-worker-unit-1', {
      pool: {} as never,
      ledger,
      settlementPort: {
        async submit() {
          portCalled = true;
          return {
            kind: 'CONFIRMED',
            provider_reference_id: 'ref-unit-1',
            transaction_hash: `0x${'b'.repeat(64)}`,
            block_number: '500',
            transfer_log_index: 0,
          };
        },
      },
    });

    expect(portCalled).toBe(true);
    expect(completedState).toBe('CONFIRMED');
  });

  it('routes a durable paid API intent to the Circle port and never the direct port', async () => {
    let directCalls = 0;
    let circleCalls = 0;
    const ledger = createMockLedger({
      async getPaidApiTarget() {
        return {
          businessIntentId: sampleRequest.business_intent_id,
          resourceUrl: 'https://x402.example.test/api/dataset',
          method: 'GET' as const,
          quotePayload: {},
        };
      },
      async persistProviderRequestIdentity(_attemptId, identity) {
        expect(identity.providerKind).toBe('CIRCLE_X402');
      },
    });

    await executeSubmitSettlement('intent-worker-unit-1', {
      pool: {} as never,
      ledger,
      settlementPort: {
        async submit() {
          directCalls += 1;
          throw new Error('direct port must not receive x402 work');
        },
      },
      paidApiSettlementPort: {
        getSubmissionIdentity: () => ({
          idempotencyKey: 'circle-x402:intent-worker-unit-1',
          referenceId: 'circle-x402:intent-worker-unit-1',
          requestFingerprint: 'a'.repeat(64),
          providerKind: 'CIRCLE_X402' as const,
        }),
        async submit() {
          circleCalls += 1;
          return {
            kind: 'POSSIBLY_SUBMITTED' as const,
            reason: 'receipt pending',
          };
        },
      },
    });

    expect(circleCalls).toBe(1);
    expect(directCalls).toBe(0);
  });

  it('persists provider request identity before calling the settlement port', async () => {
    const order: string[] = [];
    let persisted: unknown;
    const ledger = createMockLedger({
      async persistProviderRequestIdentity(_attemptId, identity) {
        order.push('persist');
        persisted = identity;
      },
    });

    await executeSubmitSettlement('intent-worker-unit-1', {
      pool: {} as never,
      ledger,
      settlementPort: {
        getSubmissionIdentity() {
          return {
            idempotencyKey: '0x' + '1'.repeat(64),
            referenceId: 'oneshot-intent-worker-unit-1',
            requestFingerprint: '0x' + '2'.repeat(64),
            walletId: 'wallet-test',
            policyId: 'policy-test',
          };
        },
        async submit() {
          order.push('submit');
          return {
            kind: 'CONFIRMED',
            provider_reference_id: 'provider-ref-identity',
            transaction_hash: `0x${'c'.repeat(64)}`,
            block_number: '500',
            transfer_log_index: 0,
          };
        },
      },
    });

    expect(order).toEqual(['persist', 'submit']);
    expect(persisted).toEqual({
      idempotencyKey: '0x' + '1'.repeat(64),
      referenceId: 'oneshot-intent-worker-unit-1',
      requestFingerprint: '0x' + '2'.repeat(64),
      walletId: 'wallet-test',
      policyId: 'policy-test',
    });
  });

  it('does not call the provider when identity persistence fails', async () => {
    let portCalled = false;
    let completedKind: string | undefined;
    const ledger = createMockLedger({
      async persistProviderRequestIdentity() {
        throw new Error('database unavailable');
      },
      async completeSubmission(_id, _attemptId, result: SettlementResult) {
        completedKind = result.kind;
        return { completed: true, state: 'FAILED_SAFE', version: 3 };
      },
    });

    await executeSubmitSettlement('intent-worker-unit-1', {
      pool: {} as never,
      ledger,
      settlementPort: {
        getSubmissionIdentity: () => ({
          idempotencyKey: '0x' + '3'.repeat(64),
          referenceId: 'oneshot-intent-worker-unit-1',
          requestFingerprint: '0x' + '4'.repeat(64),
        }),
        async submit() {
          portCalled = true;
          throw new Error('must not submit');
        },
      },
    });

    expect(portCalled).toBe(false);
    expect(completedKind).toBe('DEFINITELY_NOT_SUBMITTED');
  });

  it('does not invoke port if CAS claim returns claimed=false', async () => {
    let portCalled = false;
    const ledger = createMockLedger({
      async claimSubmission(): Promise<ClaimSubmissionResult> {
        return { claimed: false, reason: 'NOT_READY', currentState: 'AUTHORIZING' };
      },
    });

    await executeSubmitSettlement('intent-worker-unit-1', {
      pool: {} as never,
      ledger,
      settlementPort: {
        async submit() {
          portCalled = true;
          throw new Error('Should not be called');
        },
      },
    });

    expect(portCalled).toBe(false);
  });

  it('catches port exceptions and maps to UNKNOWN to prevent blind retries', async () => {
    let completedKind: string | undefined;
    const ledger = createMockLedger({
      async completeSubmission(_id, _attemptId, result: SettlementResult) {
        completedKind = result.kind;
        return { completed: true, state: 'UNKNOWN', version: 3 };
      },
      async persistProviderRequestIdentity() {},
    });

    await executeSubmitSettlement('intent-worker-unit-1', {
      pool: {} as never,
      ledger,
      settlementPort: {
        async submit() {
          throw new Error('Arc network timeout');
        },
      },
    });

    expect(completedKind).toBe('POSSIBLY_SUBMITTED');
  });

  it('records a labelled post-broadcast response loss and never submits a second time', async () => {
    let providerCalls = 0;
    let claimCalls = 0;
    let completedKind: string | undefined;
    const ledger = createMockLedger({
      async claimSubmission(): Promise<ClaimSubmissionResult> {
        claimCalls += 1;
        return claimCalls === 1
          ? {
              claimed: true,
              intent: { ...sampleIntent, state: 'READY' },
              attemptId: 'attempt-loss-1',
              correlationId: 'corr-loss-1',
              version: 2,
            }
          : { claimed: false, reason: 'NOT_READY', currentState: 'UNKNOWN' };
      },
      async completeSubmission(_id, _attemptId, result: SettlementResult) {
        completedKind = result.kind;
        return { completed: true, state: 'UNKNOWN', version: 3 };
      },
      async persistProviderRequestIdentity() {},
    });
    const settlementPort = withResponseLossAfterBroadcast(
      {
        getSubmissionIdentity: () => ({
          idempotencyKey: '0x' + '5'.repeat(64),
          referenceId: 'oneshot-intent-worker-unit-1',
          requestFingerprint: '0x' + '6'.repeat(64),
        }),
        async submit() {
          providerCalls += 1;
          return {
            kind: 'CONFIRMED',
            provider_reference_id: 'ref-response-loss',
            transaction_hash: `0x${'d'.repeat(64)}`,
            block_number: '600',
            transfer_log_index: 0,
          };
        },
      },
      true,
    );

    await executeSubmitSettlement('intent-worker-unit-1', {
      pool: {} as never,
      ledger,
      settlementPort,
    });
    await executeSubmitSettlement('intent-worker-unit-1', {
      pool: {} as never,
      ledger,
      settlementPort,
    });

    expect(completedKind).toBe('POSSIBLY_SUBMITTED');
    expect(providerCalls).toBe(1);
    expect(claimCalls).toBe(2);
  });

  it('retries only the original committed supplier order after a delivery failure', async () => {
    let deliveryState: 'PENDING' | 'RETRIEVAL_FAILED' | 'AVAILABLE' = 'PENDING';
    let supplierCalls = 0;
    let settlementCalls = 0;
    const events: string[] = [];
    const jobLedger = {
      async deliveryWork(jobId: string, attempt: number) {
        events.push(`work:${jobId}:${attempt}`);
        return deliveryState === 'PENDING'
          ? { orderReference: 'team_report_order_unit' }
          : undefined;
      },
      async completeDelivery(_jobId: string, attempt: number) {
        events.push(`complete:${attempt}`);
        deliveryState = 'AVAILABLE';
      },
      async failDelivery(_jobId: string, attempt: number) {
        events.push(`fail:${attempt}`);
        deliveryState = 'RETRIEVAL_FAILED';
      },
    } as unknown as JobLedger;
    const options = {
      pool: {} as never,
      ledger: createMockLedger(),
      jobLedger,
      supplier: {
        async getResult() {
          return null;
        },
        async fulfillOrder() {
          supplierCalls += 1;
          if (supplierCalls === 1) throw new Error('supplier unavailable after payment');
          return {
            order_reference: 'team_report_order_unit',
            result_reference: 'team_report_result_unit',
            report: 'retrieved original report',
          };
        },
        async createOrder() {
          throw new Error('delivery never creates a replacement order');
        },
      },
      settlementPort: {
        async submit() {
          settlementCalls += 1;
          throw new Error('delivery must never settle');
        },
      },
    };

    await executeFulfillSupplierOrder('job-unit', 1, options);
    expect(deliveryState).toBe('RETRIEVAL_FAILED');

    // Simulates JobLedger.resumeDelivery claiming a new fenced delivery attempt.
    deliveryState = 'PENDING';
    await executeFulfillSupplierOrder('job-unit', 2, options);

    expect(deliveryState).toBe('AVAILABLE');
    expect(events).toEqual(['work:job-unit:1', 'fail:1', 'work:job-unit:2', 'complete:2']);
    expect(settlementCalls).toBe(0);
  });

  it('rolls back the outbox claim when a handler fails before delivery', async () => {
    const queries: string[] = [];
    const client = {
      async query(sql: string) {
        queries.push(sql);
        if (sql.includes('SELECT outbox_job_id')) {
          return {
            rows: [
              {
                outbox_job_id: '1',
                business_intent_id: sampleRequest.business_intent_id,
                task_identifier: 'authorize_intent',
              },
            ],
          };
        }
        return { rows: [] };
      },
      release() {},
    };
    const ledger = createMockLedger({
      async completeAuthorization() {
        throw new Error('database write failed');
      },
    });

    await expect(
      drainOutboxJobs({
        pool: { connect: async () => client } as never,
        ledger,
        authorizationPort: { authorize: async () => ({ kind: 'AUTHORIZED' }) },
        settlementPort: {} as never,
      }),
    ).rejects.toThrow('database write failed');
    expect(queries).toContain('ROLLBACK');
    expect(queries.some((sql) => sql.includes("status = 'DELIVERED'"))).toBe(false);
  });

  it('uses the unique outbox key as the reconciliation event id', async () => {
    const eventIds: string[] = [];
    const client = {
      async query(sql: string) {
        if (sql.includes('SELECT outbox_job_id')) {
          return {
            rows: [
              {
                outbox_job_id: '2',
                business_intent_id: sampleRequest.business_intent_id,
                job_key: 'reconcile:intent-worker-unit-1:3:2',
                task_identifier: 'reconcile_intent',
              },
            ],
          };
        }
        return { rows: [] };
      },
      release() {},
    };
    const ledger = createMockLedger({
      async getIntent() {
        return { ...sampleIntent, state: 'UNKNOWN' };
      },
    });

    await expect(
      drainOutboxJobs(
        {
          pool: { connect: async () => client } as never,
          ledger,
          settlementPort: {} as never,
          recoveryService: {
            async handle(job) {
              eventIds.push(job.eventId);
              return { status: 'APPENDED' } as never;
            },
          },
        },
        1,
      ),
    ).resolves.toBe(1);
    expect(eventIds).toEqual(['reconcile:intent-worker-unit-1:3:2']);
  });
});
