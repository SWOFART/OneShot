import type { AgeBucket, UnknownAgeEvaluation } from './types.js';

export const DEFAULT_AGE_THRESHOLDS = {
  freshMaxMs: 5 * 60 * 1000, // 5 minutes
  staleMaxMs: 60 * 60 * 1000, // 60 minutes
} as const;

export function evaluateUnknownAge(
  intentId: string,
  persistedAtIso: string,
  nowIso: string = new Date().toISOString(),
  thresholds = DEFAULT_AGE_THRESHOLDS,
): UnknownAgeEvaluation {
  const persistedMs = new Date(persistedAtIso).getTime();
  const currentMs = new Date(nowIso).getTime();
  const ageMs = Math.max(0, currentMs - persistedMs);

  let bucket: AgeBucket;
  let alertRequired: boolean;
  let recommendation: string;

  if (ageMs <= thresholds.freshMaxMs) {
    bucket = 'FRESH';
    alertRequired = false;
    recommendation =
      'Intent is freshly in UNKNOWN; await indexing confirmation or next scheduled read-only poll cycle.';
  } else if (ageMs <= thresholds.staleMaxMs) {
    bucket = 'STALE';
    alertRequired = true;
    recommendation =
      'Intent in UNKNOWN exceeds 5 minutes; trigger read-only indexing re-check and monitor outbox queue.';
  } else {
    bucket = 'CRITICAL';
    alertRequired = true;
    recommendation =
      'CRITICAL: Intent in UNKNOWN exceeds 1 hour. Operator escalation required. DO NOT BLIND RETRY.';
  }

  return {
    intentId,
    ageMs,
    bucket,
    alertRequired,
    recommendation,
  };
}
