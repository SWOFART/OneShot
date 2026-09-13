import {
  RECONCILIATION_COMMAND_VERSION,
  RECOVERY_VIEW_VERSION,
  type DetailedRecoveryView,
  type EvidenceBinding,
  type IndexView,
  type KnownIdentityRecoveryEvidence,
  type ReconciliationCommand,
  type ReconciliationCommandType,
  type RecoveryRecommendationOutcome,
} from './types.js';
import { buildBoundEvidenceRecords } from './evidence-model.js';

export interface EvaluateReconciliationParams {
  readonly binding: EvidenceBinding;
  readonly durable: {
    readonly state: 'SUBMITTING' | 'UNKNOWN' | 'COMMITTED' | 'FAILED_SAFE';
    readonly stateVersion: string;
  };
  readonly evidence: KnownIdentityRecoveryEvidence;
  readonly indexView?: IndexView | null | undefined;
  readonly recommendationOutcome: RecoveryRecommendationOutcome;
  readonly evaluatedAt?: string | undefined;
}

export function evaluateReconciliation(params: EvaluateReconciliationParams): {
  readonly command: ReconciliationCommand;
  readonly view: DetailedRecoveryView;
} {
  const evaluatedAt = params.evaluatedAt ?? new Date().toISOString();
  const extracted = buildBoundEvidenceRecords(params.binding, params.evidence, params.indexView);

  const recommendation = params.recommendationOutcome.recommendation;
  const diagnostics: string[] = [];

  if (!params.recommendationOutcome.accepted) {
    diagnostics.push(
      ...params.recommendationOutcome.issues.map((i) => `REJECTED_ADVISORY_${i.code}:${i.path}`),
    );
  }

  let commandType: ReconciliationCommandType;
  let targetState: 'UNKNOWN' | 'COMMITTED' | 'FAILED_SAFE';
  let reason: string;
  let disposition: string;
  let authoritativeProofPresent: boolean;

  const evidenceReferences: string[] = extracted.records.map((r) => r.id);

  // Authoritative decision hierarchy
  if (params.durable.state === 'COMMITTED') {
    // Already committed locally
    commandType = 'HOLD_UNKNOWN';
    targetState = 'COMMITTED';
    reason = 'Intent is already locally committed in durable ledger';
    disposition = 'ALREADY_COMMITTED';
    authoritativeProofPresent = true;
  } else if (extracted.hasAuthoritativeSuccess) {
    // Definite verified on-chain success
    commandType = 'MARK_COMMITTED';
    targetState = 'COMMITTED';
    reason = 'Verified authoritative Arc transfer matches business intent binding';
    disposition = 'CONFIRMED_ON_CHAIN';
    authoritativeProofPresent = true;
  } else if (extracted.hasAuthoritativeRevert) {
    // Definite verified on-chain revert
    commandType = 'MARK_FAILED_SAFE';
    targetState = 'FAILED_SAFE';
    reason = 'Verified authoritative Arc transaction reverted on-chain';
    disposition = 'DEFINITIVELY_FAILED_ON_CHAIN';
    authoritativeProofPresent = true;
  } else {
    // No authoritative settlement proof exists yet -> MUST remain UNKNOWN
    targetState = 'UNKNOWN';
    authoritativeProofPresent = false;

    if (extracted.contradictions.length > 0) {
      // Contradictory evidence across sources
      commandType = 'ESCALATE_UNKNOWN';
      reason = `Contradictory evidence detected: ${extracted.contradictions.join(', ')}`;
      disposition = 'CONTRADICTION_HOLD';
      diagnostics.push('CONTRADICTORY_EVIDENCE');
    } else if (recommendation.action === 'RETURN_EXISTING_RESULT') {
      // Agent advisory says return existing result, but NO authoritative Arc proof exists!
      // The deterministic core refuses to mark committed without independent proof!
      commandType = 'HOLD_UNKNOWN';
      reason =
        'Advisory recommended RETURN_EXISTING_RESULT but authoritative Arc proof is absent. Overridden to safe hold.';
      disposition = 'UNVERIFIED_ADVISORY_OVERRIDE';
      diagnostics.push('UNVERIFIED_EXISTING_RESULT');
    } else if (recommendation.action === 'RECONCILE') {
      // Request another read-only lookup
      commandType = 'READ_ONLY_LOOKUP';
      reason = recommendation.reason;
      disposition = 'SCHEDULE_READ_ONLY_LOOKUP';
    } else if (recommendation.action === 'ESCALATE') {
      // Escalate to operator
      commandType = 'ESCALATE_UNKNOWN';
      reason = recommendation.reason;
      disposition = 'OPERATOR_ESCALATION';
    } else {
      // WAIT or fallback
      commandType = 'HOLD_UNKNOWN';
      reason = recommendation.reason;
      disposition = 'HOLD_SAFE';
    }
  }

  const command: ReconciliationCommand = {
    schemaVersion: RECONCILIATION_COMMAND_VERSION,
    commandType,
    businessIntentId: params.binding.businessIntentId,
    requestFingerprint: params.binding.requestFingerprint,
    targetState,
    reason,
    evidenceReferences,
    disposition,
    advisoryAction: recommendation.action,
    authoritativeProofPresent,
    issuedAt: evaluatedAt,
    settlementPermission: 'NEVER',
  };

  const authoritativeEvidence = extracted.records.filter(
    (r) =>
      r.authorityClass === 'AUTHORITATIVE_ONESHOT' ||
      r.authorityClass === 'AUTHORITATIVE_CHAIN_EVIDENCE',
  );

  const providerObservations = extracted.records.filter(
    (r) => r.authorityClass === 'PROVIDER_OBSERVATION',
  );

  const view: DetailedRecoveryView = {
    schemaVersion: RECOVERY_VIEW_VERSION,
    businessIntentId: params.binding.businessIntentId,
    authoritativeState: params.durable.state,
    coreDisposition: commandType,
    recommendedAction: recommendation.action,
    authoritativeEvidence,
    providerObservations,
    indexedCandidates: params.indexView?.candidates ?? [],
    indexHealth: params.indexView?.health ?? 'UNAVAILABLE',
    contradiction: extracted.contradictions.length > 0,
    contradictionCodes: extracted.contradictions,
    diagnostics,
    settlementPermission: 'NEVER',
    evaluatedAt,
    summary: `Disposition: ${commandType} (${disposition}) for intent ${params.binding.businessIntentId}. Authoritative proof: ${authoritativeProofPresent ? 'PRESENT' : 'ABSENT'}.`,
  };

  return { command, view };
}
