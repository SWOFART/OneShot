import type { IntentLedger } from '@oneshot/storage-postgres';
import type { Pool } from 'pg';
import { describe, expect, it } from 'vitest';
import {
  evaluateAlerts,
  formatStateTransitionLog,
  redactSensitiveData,
  type SystemMetrics,
} from '@oneshot/domain';
import {
  composeWorker,
  SimulatorAuthorizationPort,
  SimulatorSettlementPort,
} from '../src/composition.js';

describe('Worker composition and simulator profile (A04.4)', () => {
  const sampleRequest = {
    business_intent_id: 'intent-comp-1',
    recipient: '0x1111111111111111111111111111111111111111',
    amount_atomic: '1000000',
    asset: 'USDC' as const,
    network: 'eip155:5042002' as const,
    purpose: 'Composition test intent',
  };

  it('simulator settlement port produces deterministic confirmed settlements', async () => {
    const port = new SimulatorSettlementPort();
    const result = await port.submit(sampleRequest, {
      attemptId: 'att-1',
      correlationId: 'corr-1',
    });
    expect(result.kind).toBe('CONFIRMED');
    if (result.kind === 'CONFIRMED') {
      expect(result.transaction_hash).toMatch(/^0x[0-9a-f]{64}$/u);
      expect(result.provider_reference_id).toBe('sim-ref-att-1');
    }
    expect(port.callCount).toBe(1);
  });

  it('simulator settlement port rejects zero-address recipient', async () => {
    const port = new SimulatorSettlementPort();
    const result = await port.submit(
      {
        ...sampleRequest,
        recipient: '0x0000000000000000000000000000000000000000',
      },
      { attemptId: 'att-zero', correlationId: 'corr-zero' },
    );
    expect(result.kind).toBe('DEFINITELY_NOT_SUBMITTED');
  });

  it('simulator authorization port authorizes valid intents and denies zero-address', async () => {
    const port = new SimulatorAuthorizationPort();
    const allowed = await port.authorize(sampleRequest);
    expect(allowed.kind).toBe('AUTHORIZED');

    const denied = await port.authorize({
      ...sampleRequest,
      recipient: '0x0000000000000000000000000000000000000000',
    });
    expect(denied.kind).toBe('DENIED');
  });

  it('composeWorker wires simulator profile and validates readiness', async () => {
    const mockLedger = {
      ping: async () => {},
    } as unknown as IntentLedger;
    const mockPool = {} as unknown as Pool;

    const composed = composeWorker(mockPool, mockLedger, {
      profile: 'simulator',
    });

    const readiness = await composed.checkReadiness();
    expect(readiness.ready).toBe(true);
    expect(composed.options.settlementPort).toBeInstanceOf(SimulatorSettlementPort);
  });

  it('readiness check fails when adapter contract version is incompatible', async () => {
    const mockLedger = {
      ping: async () => {},
    } as unknown as IntentLedger;
    const mockPool = {} as unknown as Pool;

    const incompatiblePort = {
      ...new SimulatorSettlementPort(),
      contractVersion: '2.0.0-incompatible',
      getSubmissionIdentity: () => ({
        idempotencyKey: `0x${'a'.repeat(64)}`,
        referenceId: 'provider-comp-incompatible',
        requestFingerprint: 'b'.repeat(64),
      }),
    };

    const composed = composeWorker(mockPool, mockLedger, {
      profile: 'production',
      settlementPort: incompatiblePort,
      authorizationPort: new SimulatorAuthorizationPort(),
      recoveryService: { handle: async () => ({}) } as never,
    });

    const readiness = await composed.checkReadiness();
    expect(readiness.ready).toBe(false);
    expect(readiness.reason).toContain('does not match expected');
  });

  it('fails closed when production dependencies are missing', () => {
    const mockLedger = { ping: async () => {} } as unknown as IntentLedger;
    const mockPool = {} as unknown as Pool;
    const settlementPort = {
      ...new SimulatorSettlementPort(),
      getSubmissionIdentity: () => ({
        idempotencyKey: `0x${'a'.repeat(64)}`,
        referenceId: 'provider-comp-missing',
        requestFingerprint: 'b'.repeat(64),
      }),
    };

    expect(() =>
      composeWorker(mockPool, mockLedger, {
        profile: 'production',
        settlementPort,
      }),
    ).toThrow('authorizationPort');
    expect(() =>
      composeWorker(mockPool, mockLedger, {
        profile: 'production',
        settlementPort,
        authorizationPort: new SimulatorAuthorizationPort(),
      }),
    ).toThrow('recoveryService');
  });

  it('readiness check fails when adapter network is incompatible', async () => {
    const mockLedger = {
      ping: async () => {},
    } as unknown as IntentLedger;
    const mockPool = {} as unknown as Pool;

    const wrongNetworkPort = {
      ...new SimulatorSettlementPort(),
      network: 'eip155:1', // Ethereum mainnet instead of Arc
      getSubmissionIdentity: () => ({
        idempotencyKey: `0x${'a'.repeat(64)}`,
        referenceId: 'provider-comp-wrong-network',
        requestFingerprint: 'b'.repeat(64),
      }),
    };

    const composed = composeWorker(mockPool, mockLedger, {
      profile: 'production',
      settlementPort: wrongNetworkPort,
      authorizationPort: new SimulatorAuthorizationPort(),
      recoveryService: { handle: async () => ({}) } as never,
    });

    const readiness = await composed.checkReadiness();
    expect(readiness.ready).toBe(false);
    expect(readiness.reason).toContain('does not match expected');
  });
});

describe('Structured telemetry and redaction (A04.3)', () => {
  it('redacts sensitive keys and secret patterns from metadata', () => {
    const sensitive = {
      public_id: 'intent-123',
      api_key: 'super-secret-key',
      auth_token: 'bearer-abc',
      nested: {
        private_key: '0x' + 'f'.repeat(64),
        user_notes: 'safe text',
      },
    };

    const redacted = redactSensitiveData(sensitive);
    expect(redacted.public_id).toBe('intent-123');
    expect(redacted.api_key).toBe('[REDACTED]');
    expect(redacted.auth_token).toBe('[REDACTED]');
    expect(redacted.nested.private_key).toBe('[REDACTED]');
    expect(redacted.nested.user_notes).toBe('safe text');
  });

  it('formats correlation-safe state-transition logs with automatic redaction', () => {
    const log = formatStateTransitionLog({
      correlationId: 'corr-log-1',
      businessIntentId: 'intent-log-1',
      fromState: 'READY',
      toState: 'SUBMITTING',
      attemptId: 'att-1',
      timestamp: '2026-09-07T12:00:00.000Z',
      metadata: {
        credential: 'password123',
        safe_metric: 42,
      },
    });

    expect(log.correlation_id).toBe('corr-log-1');
    expect(log.business_intent_id).toBe('intent-log-1');
    expect(log.from_state).toBe('READY');
    expect(log.to_state).toBe('SUBMITTING');
    expect(log.metadata?.credential).toBe('[REDACTED]');
    expect(log.metadata?.safe_metric).toBe(42);
  });

  it('evaluates alert thresholds and detects anomalies', () => {
    const normalMetrics: SystemMetrics = {
      timestamp: new Date().toISOString(),
      stateCounts: {
        AUTHORIZING: 1,
        READY: 2,
        SUBMITTING: 1,
        COMMITTED: 10,
        FAILED_SAFE: 0,
        UNKNOWN: 0,
      },
      unknownCount: 0,
      oldestUnknownAgeMs: 0,
      casConflictsCount: 2,
      queueLagMs: 500,
      duplicateCount: 3,
      policyDenialCount: 0,
      providerErrorCount: 0,
      reconciliationOutcomeCounts: {},
    };

    const normalEval = evaluateAlerts(normalMetrics);
    expect(normalEval.healthy).toBe(true);
    expect(normalEval.alerts).toHaveLength(0);

    const anomalousMetrics: SystemMetrics = {
      ...normalMetrics,
      unknownCount: 8, // threshold is 5
      oldestUnknownAgeMs: 600_000, // threshold is 300_000
      queueLagMs: 120_000, // threshold is 60_000
      casConflictsCount: 100, // threshold is 50
    };

    const alertEval = evaluateAlerts(anomalousMetrics);
    expect(alertEval.healthy).toBe(false);
    expect(alertEval.alerts).toHaveLength(4);
    expect(alertEval.alerts[0]).toContain('HIGH_UNKNOWN_COUNT');
    expect(alertEval.alerts[1]).toContain('STALE_UNKNOWN_INTENT');
    expect(alertEval.alerts[2]).toContain('HIGH_QUEUE_LAG');
    expect(alertEval.alerts[3]).toContain('HIGH_CAS_CONFLICTS');
  });
});
