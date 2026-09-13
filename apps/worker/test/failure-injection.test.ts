import { describe, expect, it } from 'vitest';
import {
  RESPONSE_LOSS_AFTER_BROADCAST,
  withResponseLossAfterBroadcast,
} from '../src/failure-injection.js';

const request = {
  business_intent_id: 'intent-fault-test',
  recipient: '0x1111111111111111111111111111111111111111',
  amount_atomic: '1',
  asset: 'USDC' as const,
  network: 'eip155:5042002' as const,
  purpose: 'response loss test',
};

describe('response-loss fault injection', () => {
  it('drops one confirmed response, preserves provider identity, then becomes inert', async () => {
    const port = {
      marker: 'provider-marker',
      contractVersion: '1.0.0',
      network: 'eip155:5042002',
      getSubmissionIdentity(this: { marker: string }) {
        return {
          idempotencyKey: `0x${'a'.repeat(64)}`,
          referenceId: this.marker,
          requestFingerprint: `0x${'b'.repeat(64)}`,
        };
      },
      async submit() {
        return {
          kind: 'CONFIRMED' as const,
          provider_reference_id: 'provider-reference',
          transaction_hash: `0x${'c'.repeat(64)}` as `0x${string}`,
          block_number: '1' as `${bigint}`,
          transfer_log_index: 0,
        };
      },
    };
    const wrapped = withResponseLossAfterBroadcast(port, true);

    expect((wrapped as typeof port).contractVersion).toBe('1.0.0');
    expect(wrapped.getSubmissionIdentity?.(request).referenceId).toBe('provider-marker');
    await expect(
      wrapped.submit(request, { attemptId: 'attempt-1', correlationId: 'corr-1' }),
    ).rejects.toThrow(RESPONSE_LOSS_AFTER_BROADCAST);
    await expect(
      wrapped.submit(request, { attemptId: 'attempt-2', correlationId: 'corr-2' }),
    ).resolves.toMatchObject({ kind: 'CONFIRMED' });
  });

  it('returns the original port when disabled', () => {
    const port = {
      async submit() {
        return { kind: 'POSSIBLY_SUBMITTED' as const, reason: 'hold' };
      },
    };
    expect(withResponseLossAfterBroadcast(port, false)).toBe(port);
  });
});
