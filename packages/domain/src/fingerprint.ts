import { createHash } from 'node:crypto';
import {
  canonicalIntentPayload,
  parseCreateIntentRequest,
  type CreateIntentRequest,
} from '@oneshot/contracts';

export interface FingerprintedIntent {
  readonly request: CreateIntentRequest;
  readonly canonical_payload: string;
  readonly payload_fingerprint: string;
}

export function fingerprintIntent(value: unknown): FingerprintedIntent {
  const request = parseCreateIntentRequest(value);
  const canonicalPayload = canonicalIntentPayload(request);
  return {
    request,
    canonical_payload: canonicalPayload,
    payload_fingerprint: createHash('sha256').update(canonicalPayload, 'utf8').digest('hex'),
  };
}
