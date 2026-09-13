import type { IntentState } from '@oneshot/contracts';

const SENSITIVE_KEY_PATTERN =
  /secret|private|token|password|credential|auth|signature|raw_body|seed|key/i;

export function redactSensitiveData<T>(value: T): T {
  if (value === null || value === undefined) {
    return value;
  }
  if (typeof value === 'string') {
    if (/^0x[0-9a-fA-F]{64}$/u.test(value)) {
      // Possible private key or signature hash; if raw hex key, redact
      return '[REDACTED_HASH]' as unknown as T;
    }
    return value;
  }
  if (Array.isArray(value)) {
    return value.map((item) => redactSensitiveData(item)) as unknown as T;
  }
  if (typeof value === 'object') {
    const result: Record<string, unknown> = {};
    for (const [key, val] of Object.entries(value as Record<string, unknown>)) {
      if (SENSITIVE_KEY_PATTERN.test(key)) {
        result[key] = '[REDACTED]';
      } else {
        result[key] = redactSensitiveData(val);
      }
    }
    return result as unknown as T;
  }
  return value;
}

export interface StateTransitionEvent {
  readonly correlationId: string;
  readonly businessIntentId: string;
  readonly fromState: IntentState | 'NONE';
  readonly toState: IntentState;
  readonly attemptId?: string | undefined;
  readonly reason?: string | undefined;
  readonly timestamp: string;
  readonly metadata?: Record<string, unknown> | undefined;
}

export interface StateTransitionLog {
  readonly type: 'STATE_TRANSITION';
  readonly correlation_id: string;
  readonly business_intent_id: string;
  readonly from_state: IntentState | 'NONE';
  readonly to_state: IntentState;
  readonly attempt_id?: string | undefined;
  readonly reason?: string | undefined;
  readonly timestamp: string;
  readonly metadata?: Record<string, unknown> | undefined;
}

export function formatStateTransitionLog(event: StateTransitionEvent): StateTransitionLog {
  return {
    type: 'STATE_TRANSITION',
    correlation_id: event.correlationId,
    business_intent_id: event.businessIntentId,
    from_state: event.fromState,
    to_state: event.toState,
    ...(event.attemptId ? { attempt_id: event.attemptId } : {}),
    ...(event.reason ? { reason: event.reason } : {}),
    timestamp: event.timestamp,
    ...(event.metadata ? { metadata: redactSensitiveData(event.metadata) } : {}),
  };
}

export interface SystemMetrics {
  readonly timestamp: string;
  readonly stateCounts: Record<IntentState, number>;
  readonly unknownCount: number;
  readonly oldestUnknownAgeMs: number;
  readonly casConflictsCount: number;
  readonly queueLagMs: number;
  readonly duplicateCount: number;
  readonly policyDenialCount: number;
  readonly providerErrorCount: number;
  readonly reconciliationOutcomeCounts: Record<string, number>;
}

export interface AlertThresholds {
  readonly maxUnknownCount: number;
  readonly maxUnknownAgeMs: number;
  readonly maxQueueLagMs: number;
  readonly maxCasConflicts: number;
}

export const DEFAULT_ALERT_THRESHOLDS: AlertThresholds = {
  maxUnknownCount: 5,
  maxUnknownAgeMs: 300_000, // 5 minutes
  maxQueueLagMs: 60_000, // 1 minute
  maxCasConflicts: 50,
};

export interface AlertEvaluationResult {
  readonly healthy: boolean;
  readonly alerts: readonly string[];
}

export function evaluateAlerts(
  metrics: SystemMetrics,
  thresholds: AlertThresholds = DEFAULT_ALERT_THRESHOLDS,
): AlertEvaluationResult {
  const alerts: string[] = [];

  if (metrics.unknownCount > thresholds.maxUnknownCount) {
    alerts.push(
      `HIGH_UNKNOWN_COUNT: ${metrics.unknownCount} intents in UNKNOWN state (threshold: ${thresholds.maxUnknownCount})`,
    );
  }

  if (metrics.oldestUnknownAgeMs > thresholds.maxUnknownAgeMs) {
    alerts.push(
      `STALE_UNKNOWN_INTENT: oldest UNKNOWN intent age is ${metrics.oldestUnknownAgeMs}ms (threshold: ${thresholds.maxUnknownAgeMs}ms)`,
    );
  }

  if (metrics.queueLagMs > thresholds.maxQueueLagMs) {
    alerts.push(
      `HIGH_QUEUE_LAG: max outbox queue lag is ${metrics.queueLagMs}ms (threshold: ${thresholds.maxQueueLagMs}ms)`,
    );
  }

  if (metrics.casConflictsCount > thresholds.maxCasConflicts) {
    alerts.push(
      `HIGH_CAS_CONFLICTS: ${metrics.casConflictsCount} CAS conflicts observed (threshold: ${thresholds.maxCasConflicts})`,
    );
  }

  return {
    healthy: alerts.length === 0,
    alerts,
  };
}
