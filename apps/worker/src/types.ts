import type {
  AuthorizationResult,
  CreateIntentRequest,
  SettlementResult,
} from '@oneshot/contracts';
import type { IntentLedger } from '@oneshot/storage-postgres';
import type { Pool } from 'pg';

export interface AuthorizationPort {
  authorize(request: CreateIntentRequest): Promise<AuthorizationResult>;
}

export interface SettlementContext {
  readonly attemptId: string;
  readonly correlationId: string;
}

export interface SettlementPort {
  submit(request: CreateIntentRequest, context: SettlementContext): Promise<SettlementResult>;
}

export interface WorkerOptions {
  readonly pool: Pool;
  readonly ledger: IntentLedger;
  readonly authorizationPort?: AuthorizationPort;
  readonly settlementPort: SettlementPort;
  readonly concurrency?: number;
}
