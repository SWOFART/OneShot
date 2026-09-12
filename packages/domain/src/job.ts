import { createHash } from 'node:crypto';
import {
  canonicalJobPayload,
  asEvmAddress,
  parseCreateJobRequest,
  type CreateJobRequest,
} from '@oneshot/contracts';

function workspaceId(value: string): string {
  if (
    value.length === 0 ||
    value.length > 128 ||
    value.trim() !== value ||
    Array.from(value).some((character) => {
      const code = character.charCodeAt(0);
      return code <= 0x1f || code === 0x7f;
    })
  ) {
    throw new Error('workspace_id is invalid');
  }
  return value;
}

export function jobFingerprint(request: CreateJobRequest): string {
  return createHash('sha256').update(canonicalJobPayload(request), 'utf8').digest('hex');
}

/**
 * Binds a user-funded job to the wallet that was reviewed before signing.
 * The task identity remains stable by task key, while a different payer is a
 * payload conflict rather than permission to reuse the same payment intent.
 */
export function userWalletJobFingerprint(request: CreateJobRequest, payerWallet: unknown): string {
  const payer = asEvmAddress(payerWallet);
  return createHash('sha256')
    .update(`${canonicalJobPayload(request)}\u0000${payer}`, 'utf8')
    .digest('hex');
}

export function derivedJobId(value: string, request: CreateJobRequest): string {
  const scope = workspaceId(value);
  const parsed = parseCreateJobRequest(request);
  return `job_${createHash('sha256')
    .update(`${scope}\u0000${parsed.tool_id}\u0000${parsed.task_key}`, 'utf8')
    .digest('hex')}`;
}

export function derivedBusinessIntentId(value: string, request: CreateJobRequest): string {
  return `intent_${derivedJobId(value, request).slice(4)}`;
}
