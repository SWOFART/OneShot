declare const brand: unique symbol;

export type Brand<Value, Name extends string> = Value & { readonly [brand]: Name };

export type BusinessIntentId = Brand<string, 'BusinessIntentId'>;
export type AttemptId = Brand<string, 'AttemptId'>;
export type CorrelationId = Brand<string, 'CorrelationId'>;
export type ProviderReferenceId = Brand<string, 'ProviderReferenceId'>;
export type TransactionHash = Brand<string, 'TransactionHash'>;
export type BlockNumber = Brand<string, 'BlockNumber'>;
export type DeploymentId = Brand<string, 'DeploymentId'>;
export type EvmAddress = Brand<string, 'EvmAddress'>;

export class ContractValidationError extends Error {
  override readonly name = 'ContractValidationError';
}

function boundedIdentity(value: unknown, field: string, maximum = 128): string {
  if (typeof value !== 'string' || value.length === 0 || value.length > maximum) {
    throw new ContractValidationError(
      `${field} must be a non-empty string of at most ${maximum} characters`,
    );
  }
  // eslint-disable-next-line no-control-regex -- Contract boundaries reject ASCII controls.
  if (value.trim() !== value || /[\u0000-\u001f\u007f]/u.test(value)) {
    throw new ContractValidationError(
      `${field} contains forbidden whitespace or control characters`,
    );
  }
  return value;
}

export const asBusinessIntentId = (value: unknown): BusinessIntentId =>
  boundedIdentity(value, 'business_intent_id') as BusinessIntentId;
export const asAttemptId = (value: unknown): AttemptId =>
  boundedIdentity(value, 'attempt_id') as AttemptId;
export const asCorrelationId = (value: unknown): CorrelationId =>
  boundedIdentity(value, 'correlation_id') as CorrelationId;
export const asProviderReferenceId = (value: unknown): ProviderReferenceId =>
  boundedIdentity(value, 'provider_reference_id') as ProviderReferenceId;
export const asDeploymentId = (value: unknown): DeploymentId =>
  boundedIdentity(value, 'deployment_id') as DeploymentId;

export function asTransactionHash(value: unknown): TransactionHash {
  const candidate = boundedIdentity(value, 'transaction_hash', 66);
  if (!/^0x[0-9a-fA-F]{64}$/u.test(candidate)) {
    throw new ContractValidationError('transaction_hash must be a 32-byte hex value');
  }
  return candidate.toLowerCase() as TransactionHash;
}

export function asBlockNumber(value: unknown): BlockNumber {
  const candidate = boundedIdentity(value, 'block_number', 78);
  if (!/^(0|[1-9][0-9]*)$/u.test(candidate)) {
    throw new ContractValidationError('block_number must be a canonical unsigned integer string');
  }
  return candidate as BlockNumber;
}

export function asEvmAddress(value: unknown): EvmAddress {
  const candidate = boundedIdentity(value, 'recipient', 42);
  if (!/^0x[0-9a-fA-F]{40}$/u.test(candidate)) {
    throw new ContractValidationError('recipient must be a 20-byte EVM address');
  }
  return candidate.toLowerCase() as EvmAddress;
}
