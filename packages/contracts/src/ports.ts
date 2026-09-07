import {
  asBlockNumber,
  asProviderReferenceId,
  asTransactionHash,
  ContractValidationError,
  type BlockNumber,
  type ProviderReferenceId,
  type TransactionHash,
} from './ids.js';

export type AuthorizationResult =
  | { readonly kind: 'AUTHORIZED' }
  | { readonly kind: 'DENIED'; readonly reason: string }
  | { readonly kind: 'UNAVAILABLE'; readonly reason: string };

export type SettlementResult =
  | {
      readonly kind: 'CONFIRMED';
      readonly provider_reference_id: ProviderReferenceId;
      readonly transaction_hash: TransactionHash;
      readonly block_number: BlockNumber;
      readonly transfer_log_index: number;
    }
  | { readonly kind: 'DEFINITELY_NOT_SUBMITTED'; readonly reason: string }
  | { readonly kind: 'POSSIBLY_SUBMITTED'; readonly reason: string };

export type EvidenceResultKind =
  'FINAL_SUCCESS' | 'FINAL_REVERT' | 'PENDING' | 'NOT_FOUND' | 'UNAVAILABLE';

export type IndexHealth = 'FRESH' | 'LAGGING' | 'UNHEALTHY' | 'UNAVAILABLE' | 'UNKNOWN_FRESHNESS';

export type RecoveryAction = 'WAIT' | 'RECONCILE' | 'ESCALATE' | 'RETURN_EXISTING_RESULT';

function record(value: unknown, name: string): Record<string, unknown> {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    throw new ContractValidationError(`${name} must be an object`);
  }
  return value as Record<string, unknown>;
}

function stringField(value: unknown, name: string): string {
  if (typeof value !== 'string' || value.length === 0 || value.length > 256) {
    throw new ContractValidationError(`${name} must be a bounded non-empty string`);
  }
  return value;
}

function exactKeys(value: Record<string, unknown>, allowed: readonly string[], name: string): void {
  const extras = Object.keys(value).filter((key) => !allowed.includes(key));
  if (extras.length > 0) {
    throw new ContractValidationError(`${name} contains unexpected fields: ${extras.join(', ')}`);
  }
}

export function parseAuthorizationResult(value: unknown): AuthorizationResult {
  const candidate = record(value, 'authorization result');
  const kind = candidate.kind;
  switch (kind) {
    case 'AUTHORIZED':
      exactKeys(candidate, ['kind'], 'authorization result');
      return { kind };
    case 'DENIED':
    case 'UNAVAILABLE':
      exactKeys(candidate, ['kind', 'reason'], 'authorization result');
      return { kind, reason: stringField(candidate.reason, 'reason') };
    default:
      throw new ContractValidationError(`unknown authorization result: ${String(kind)}`);
  }
}

export function parseSettlementResult(value: unknown): SettlementResult {
  const candidate = record(value, 'settlement result');
  const kind = candidate.kind;
  switch (kind) {
    case 'CONFIRMED': {
      exactKeys(
        candidate,
        ['kind', 'provider_reference_id', 'transaction_hash', 'block_number', 'transfer_log_index'],
        'settlement result',
      );
      if (
        !Number.isSafeInteger(candidate.transfer_log_index) ||
        Number(candidate.transfer_log_index) < 0
      ) {
        throw new ContractValidationError('transfer_log_index must be a non-negative safe integer');
      }
      return {
        kind,
        provider_reference_id: asProviderReferenceId(candidate.provider_reference_id),
        transaction_hash: asTransactionHash(candidate.transaction_hash),
        block_number: asBlockNumber(candidate.block_number),
        transfer_log_index: Number(candidate.transfer_log_index),
      };
    }
    case 'DEFINITELY_NOT_SUBMITTED':
    case 'POSSIBLY_SUBMITTED':
      exactKeys(candidate, ['kind', 'reason'], 'settlement result');
      return { kind, reason: stringField(candidate.reason, 'reason') };
    default:
      throw new ContractValidationError(`unknown settlement result: ${String(kind)}`);
  }
}

export function parseEvidenceResultKind(value: unknown): EvidenceResultKind {
  switch (value) {
    case 'FINAL_SUCCESS':
    case 'FINAL_REVERT':
    case 'PENDING':
    case 'NOT_FOUND':
    case 'UNAVAILABLE':
      return value;
    default:
      throw new ContractValidationError(`unknown evidence result: ${String(value)}`);
  }
}

export function parseIndexHealth(value: unknown): IndexHealth {
  switch (value) {
    case 'FRESH':
    case 'LAGGING':
    case 'UNHEALTHY':
    case 'UNAVAILABLE':
    case 'UNKNOWN_FRESHNESS':
      return value;
    default:
      throw new ContractValidationError(`unknown index health: ${String(value)}`);
  }
}

export function parseRecoveryAction(value: unknown): RecoveryAction {
  switch (value) {
    case 'WAIT':
    case 'RECONCILE':
    case 'ESCALATE':
    case 'RETURN_EXISTING_RESULT':
      return value;
    default:
      throw new ContractValidationError(`unknown recovery action: ${String(value)}`);
  }
}

export function assertNever(value: never, context: string): never {
  throw new ContractValidationError(`${context}: ${String(value)}`);
}
