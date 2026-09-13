import {
  parseAuthorizationResult,
  parseSettlementResult,
  type CreateIntentRequest,
} from '@oneshot/contracts';
import { describe, expect, it } from 'vitest';
import { DeterministicDomainSimulator } from '../src/index.js';

const request: CreateIntentRequest = {
  business_intent_id: 'intent-001',
  recipient: '0x1111111111111111111111111111111111111111',
  amount_atomic: '1250000',
  asset: 'USDC',
  network: 'eip155:5042002',
  purpose: 'Synthetic API job',
};

function simulator() {
  let attempt = 0;
  return new DeterministicDomainSimulator({
    now: () => '2026-09-07T12:00:00.000Z',
    nextAttemptId: () => `attempt-${++attempt}`,
  });
}

const confirmed = () =>
  parseSettlementResult({
    kind: 'CONFIRMED',
    provider_reference_id: 'provider-ref-001',
    transaction_hash: `0x${'a'.repeat(64)}`,
    block_number: '100',
    transfer_log_index: 0,
  });

describe('DeterministicDomainSimulator', () => {
  it('creates one stable intent and replays it without another attempt', () => {
    const domain = simulator();
    const first = domain.createIntent(request);
    const replay = domain.createIntent(request);

    expect(first.kind).toBe('ACCEPTED');
    expect(replay.kind).toBe('REPLAY_IDENTICAL');
    expect(replay.intent.attempts).toHaveLength(1);
    expect(replay.intent.attempts[0]?.attempt_id).toBe('attempt-1');
    expect(domain.externalSubmissionCount).toBe(0);
  });

  it('rejects conflicting payload under the stable intent ID', () => {
    const domain = simulator();
    domain.createIntent(request);
    const conflict = domain.createIntent({ ...request, amount_atomic: '1250001' });

    expect(conflict.kind).toBe('INTENT_PAYLOAD_CONFLICT');
    expect(conflict.intent.request.amount_atomic).toBe('1250000');
    expect(domain.externalSubmissionCount).toBe(0);
  });

  it('commits one confirmed synthetic submission', () => {
    const domain = simulator();
    domain.createIntent(request);
    domain.authorize(request.business_intent_id, parseAuthorizationResult({ kind: 'AUTHORIZED' }));
    const committed = domain.submit(request.business_intent_id, confirmed());
    const replayed = domain.submit(request.business_intent_id, confirmed());

    expect(committed.state).toBe('COMMITTED');
    expect(replayed.state).toBe('COMMITTED');
    expect(domain.externalSubmissionCount).toBe(1);
  });

  it('holds a possibly submitted result in UNKNOWN without blind retry', () => {
    const domain = simulator();
    domain.createIntent(request);
    domain.authorize(request.business_intent_id, { kind: 'AUTHORIZED' });
    const unknown = domain.submit(request.business_intent_id, {
      kind: 'POSSIBLY_SUBMITTED',
      reason: 'response lost',
    });
    domain.submit(request.business_intent_id, confirmed());

    expect(unknown.state).toBe('UNKNOWN');
    expect(domain.externalSubmissionCount).toBe(1);
  });

  it('performs no submission after authorization denial', () => {
    const domain = simulator();
    domain.createIntent(request);
    const denied = domain.authorize(request.business_intent_id, {
      kind: 'DENIED',
      reason: 'recipient policy',
    });

    expect(denied.state).toBe('REJECTED');
    expect(domain.externalSubmissionCount).toBe(0);
  });
});
