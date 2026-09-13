import { describe, expect, it } from 'vitest';
import {
  classifyOutcome,
  permitsImmediateRetry,
  type AmbiguousSignal,
  type PreSubmissionProof,
  type ProviderResponse,
} from '../src/outcome.js';

describe('confirmed', () => {
  it('classifies a verified receipt as CONFIRMED', () => {
    expect(classifyOutcome({ kind: 'VERIFIED_RECEIPT', confirmed: true }).outcome).toBe(
      'CONFIRMED',
    );
  });

  it('does not treat an unconfirmed receipt as proof of non-submission', () => {
    // Absence of proof is not proof of absence. This must be
    // POSSIBLY_SUBMITTED, never DEFINITELY_NOT_SUBMITTED.
    expect(classifyOutcome({ kind: 'VERIFIED_RECEIPT', confirmed: false }).outcome).toBe(
      'POSSIBLY_SUBMITTED',
    );
  });
});

describe('definitely not submitted', () => {
  it.each<PreSubmissionProof>([
    'POLICY_DENIED',
    'REQUEST_VALIDATION_FAILED',
    'LOCAL_SCOPE_DENIED',
    'AUTHORIZATION_INVALID',
  ])('grants DEFINITELY_NOT_SUBMITTED for pre-flight proof %s', (proof) => {
    expect(classifyOutcome({ kind: 'PRE_SUBMISSION_FAILURE', proof }).outcome).toBe(
      'DEFINITELY_NOT_SUBMITTED',
    );
  });

  it('is the only outcome permitting an immediate retry', () => {
    expect(permitsImmediateRetry('DEFINITELY_NOT_SUBMITTED')).toBe(true);
    expect(permitsImmediateRetry('POSSIBLY_SUBMITTED')).toBe(false);
    expect(permitsImmediateRetry('CONFIRMED')).toBe(false);
  });
});

describe('every ambiguous signal fails closed', () => {
  it.each<AmbiguousSignal>([
    'TIMEOUT',
    'CONNECTION_RESET',
    'LOST_RESPONSE',
    'TRUNCATED_RESPONSE',
    'MALFORMED_RESPONSE',
    'PROVIDER_5XX',
    'RATE_LIMITED',
    'PROCESS_CRASH',
    'UNKNOWN_ERROR',
  ])('classifies %s as POSSIBLY_SUBMITTED', (signal) => {
    expect(classifyOutcome({ kind: 'AMBIGUOUS', signal }).outcome).toBe('POSSIBLY_SUBMITTED');
  });

  it('never lets an ambiguous signal permit a retry', () => {
    const signals: AmbiguousSignal[] = ['TIMEOUT', 'LOST_RESPONSE', 'PROCESS_CRASH'];
    for (const signal of signals) {
      const { outcome } = classifyOutcome({ kind: 'AMBIGUOUS', signal });
      expect(permitsImmediateRetry(outcome)).toBe(false);
    }
  });
});

describe('unrecognized responses', () => {
  it('classifies an unrecognized shape as POSSIBLY_SUBMITTED', () => {
    expect(classifyOutcome({ kind: 'UNRECOGNIZED', detail: 'new provider field' }).outcome).toBe(
      'POSSIBLY_SUBMITTED',
    );
  });

  it('fails closed on a response shape from the future', () => {
    // Simulates a provider adding a response kind this build predates. It must
    // not widen retry permission.
    const fromTheFuture = { kind: 'SOMETHING_NEW' } as unknown as ProviderResponse;
    const { outcome } = classifyOutcome(fromTheFuture);
    expect(outcome).toBe('POSSIBLY_SUBMITTED');
    expect(permitsImmediateRetry(outcome)).toBe(false);
  });
});
