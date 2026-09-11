import type { CreatePaidApiRequest } from './generated/api-types.js';
import { ContractValidationError } from './ids.js';

const CREATE_PAID_API_KEYS = ['task_key', 'tool_id'] as const;

export function parseCreatePaidApiRequest(value: unknown): CreatePaidApiRequest {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    throw new ContractValidationError('paid API request must be an object');
  }
  const candidate = value as Record<string, unknown>;
  const keys = Object.keys(candidate).sort();
  if (
    keys.length !== CREATE_PAID_API_KEYS.length ||
    keys.some((key, index) => key !== CREATE_PAID_API_KEYS[index])
  ) {
    throw new ContractValidationError('paid API request has missing or unexpected fields');
  }
  if (
    typeof candidate.task_key !== 'string' ||
    candidate.task_key.length === 0 ||
    candidate.task_key.length > 128 ||
    candidate.task_key.trim() !== candidate.task_key ||
    // eslint-disable-next-line no-control-regex -- Contract input rejects ASCII controls.
    /[\u0000-\u001f\u007f]/u.test(candidate.task_key)
  ) {
    throw new ContractValidationError('task_key must be a bounded non-secret identifier');
  }
  if (candidate.tool_id !== 'circle-x402-api-v1') {
    throw new ContractValidationError('tool_id is not supported');
  }
  return { task_key: candidate.task_key.normalize('NFC'), tool_id: 'circle-x402-api-v1' };
}
