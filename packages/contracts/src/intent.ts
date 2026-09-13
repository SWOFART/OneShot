import type { CreateIntentRequest } from './generated/api-types.js';
import { asBusinessIntentId, asEvmAddress, ContractValidationError } from './ids.js';
import { asAtomicAmount } from './money.js';

const CREATE_INTENT_KEYS = [
  'amount_atomic',
  'asset',
  'business_intent_id',
  'network',
  'purpose',
  'recipient',
] as const;

export function parseCreateIntentRequest(value: unknown): CreateIntentRequest {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    throw new ContractValidationError('intent request must be an object');
  }
  const candidate = value as Record<string, unknown>;
  const keys = Object.keys(candidate).sort();
  if (
    keys.length !== CREATE_INTENT_KEYS.length ||
    keys.some((key, index) => key !== CREATE_INTENT_KEYS[index])
  ) {
    throw new ContractValidationError('intent request has missing or unexpected fields');
  }
  if (candidate.asset !== 'USDC') throw new ContractValidationError('asset must be USDC');
  if (candidate.network !== 'eip155:5042002') {
    throw new ContractValidationError('network must be the enabled Arc Testnet profile');
  }
  if (
    typeof candidate.purpose !== 'string' ||
    candidate.purpose.length === 0 ||
    candidate.purpose.length > 256 ||
    candidate.purpose.trim() !== candidate.purpose ||
    // eslint-disable-next-line no-control-regex -- Display text cannot contain ASCII controls.
    /[\u0000-\u001f\u007f]/u.test(candidate.purpose)
  ) {
    throw new ContractValidationError('purpose must be a bounded non-secret display string');
  }
  return {
    business_intent_id: asBusinessIntentId(candidate.business_intent_id),
    recipient: asEvmAddress(candidate.recipient),
    amount_atomic: asAtomicAmount(candidate.amount_atomic),
    asset: 'USDC',
    network: 'eip155:5042002',
    purpose: candidate.purpose.normalize('NFC'),
  };
}

export function canonicalIntentPayload(request: CreateIntentRequest): string {
  const value = parseCreateIntentRequest(request);
  return JSON.stringify({
    business_intent_id: value.business_intent_id,
    recipient: value.recipient,
    amount_atomic: value.amount_atomic,
    asset: value.asset,
    network: value.network,
    purpose: value.purpose,
  });
}
