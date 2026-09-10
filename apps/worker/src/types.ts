import type {
  AuthorizationResult,
  CreateIntentRequest,
  SettlementResult,
} from '@oneshot/contracts';
import type { IntentLedger } from '@oneshot/storage-postgres';
import type { Pool } from 'pg';

import type { RecoveryService } from '@oneshot/reconciliation';

export interface AuthorizationPort {
  authorize(request: CreateIntentRequest): Promise<AuthorizationResult>;
}

export interface SettlementContext {
  readonly attemptId: string;
  readonly correlationId: string;
}

export interface ProviderRequestIdentity {
  readonly idempotencyKey: string;
  readonly referenceId: string;
  readonly requestFingerprint: string;
  readonly walletId?: string | undefined;
  readonly policyId?: string | undefined;
}

export interface SettlementPort {
  getSubmissionIdentity?(request: CreateIntentRequest): ProviderRequestIdentity;
  submit(request: CreateIntentRequest, context: SettlementContext): Promise<SettlementResult>;
}

export interface WorkerConfig {
  readonly submissionsDisabled?: boolean | undefined;
  readonly submissionLeaseMs?: number | undefined;
  readonly contractVersion?: string | undefined;
  readonly network?: string | undefined;
}

export interface WorkerOptions {
  readonly pool: Pool;
  readonly ledger: IntentLedger;
  readonly authorizationPort?: AuthorizationPort | undefined;
  readonly settlementPort: SettlementPort;
  readonly recoveryService?: RecoveryService | undefined;
  readonly concurrency?: number | undefined;
  readonly config?: WorkerConfig | undefined;
}
