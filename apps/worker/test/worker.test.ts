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
import {
  createTaskList,
  drainOutboxJobs,
  executeAuthorizeIntent,
  executeSubmitSettlement,
} from '../src/index.js';

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
});
