import { createHash } from 'node:crypto';
import {
  asAttemptId,
  asBusinessIntentId,
  canonicalIntentPayload,
  ContractValidationError,
  parseCreateIntentRequest,
  type AttemptId,
  type AuthorizationResult,
  type BusinessIntentId,
  type CreateIntentRequest,
  type IntentState,
  type SettlementResult,
  type SettlementView,
} from '@oneshot/contracts';

export interface SimulatorDependencies {
  readonly now: () => string;
  readonly nextAttemptId: () => string;
}

export interface SimulatorAttempt {
  readonly attempt_id: AttemptId;
  readonly stage: IntentState;
  readonly created_at: string;
}

export interface SimulatorIntent {
  readonly request: CreateIntentRequest;
  readonly payload_fingerprint: string;
  readonly state: IntentState;
  readonly version: number;
  readonly attempts: readonly SimulatorAttempt[];
  readonly settlement?: SettlementView;
}

export type CreateIntentOutcome =
  | { readonly kind: 'ACCEPTED'; readonly intent: SimulatorIntent }
  | { readonly kind: 'REPLAY_IDENTICAL'; readonly intent: SimulatorIntent }
  | { readonly kind: 'INTENT_PAYLOAD_CONFLICT'; readonly intent: SimulatorIntent };

function fingerprint(request: CreateIntentRequest): string {
  return createHash('sha256').update(canonicalIntentPayload(request)).digest('hex');
}

function cloneIntent(intent: SimulatorIntent): SimulatorIntent {
  return structuredClone(intent);
}

export class DeterministicDomainSimulator {
  readonly #dependencies: SimulatorDependencies;
  readonly #intents = new Map<BusinessIntentId, SimulatorIntent>();
  #externalSubmissionCount = 0;

  constructor(dependencies: SimulatorDependencies) {
    this.#dependencies = dependencies;
  }

  get externalSubmissionCount(): number {
    return this.#externalSubmissionCount;
  }

  createIntent(value: unknown): CreateIntentOutcome {
    const request = parseCreateIntentRequest(value);
    const id = asBusinessIntentId(request.business_intent_id);
    const payloadFingerprint = fingerprint(request);
    const existing = this.#intents.get(id);
    if (existing) {
      return {
        kind:
          existing.payload_fingerprint === payloadFingerprint
            ? 'REPLAY_IDENTICAL'
            : 'INTENT_PAYLOAD_CONFLICT',
        intent: cloneIntent(existing),
      };
    }

    const attempt: SimulatorAttempt = {
      attempt_id: asAttemptId(this.#dependencies.nextAttemptId()),
      stage: 'AUTHORIZING',
      created_at: this.#dependencies.now(),
    };
    const intent: SimulatorIntent = {
      request,
      payload_fingerprint: payloadFingerprint,
      state: 'AUTHORIZING',
      version: 1,
      attempts: [attempt],
    };
    this.#intents.set(id, intent);
    return { kind: 'ACCEPTED', intent: cloneIntent(intent) };
  }

  authorize(idValue: unknown, result: AuthorizationResult): SimulatorIntent {
    const id = asBusinessIntentId(idValue);
    const current = this.#requiredIntent(id);
    if (current.state !== 'AUTHORIZING') return cloneIntent(current);

    const state: IntentState =
      result.kind === 'AUTHORIZED'
        ? 'READY'
        : result.kind === 'DENIED'
          ? 'REJECTED'
          : 'AUTHORIZING';
    return this.#replace(id, { ...current, state, version: current.version + 1 });
  }

  submit(idValue: unknown, result: SettlementResult): SimulatorIntent {
    const id = asBusinessIntentId(idValue);
    const current = this.#requiredIntent(id);
    if (current.state !== 'READY') return cloneIntent(current);

    this.#externalSubmissionCount += 1;
    switch (result.kind) {
      case 'CONFIRMED':
        return this.#replace(id, {
          ...current,
          state: 'COMMITTED',
          version: current.version + 1,
          settlement: {
            provider_reference_id: result.provider_reference_id,
            transaction_hash: result.transaction_hash,
            block_number: result.block_number,
            transfer_log_index: result.transfer_log_index,
          },
        });
      case 'DEFINITELY_NOT_SUBMITTED':
        return this.#replace(id, {
          ...current,
          state: 'FAILED_SAFE',
          version: current.version + 1,
        });
      case 'POSSIBLY_SUBMITTED':
        return this.#replace(id, {
          ...current,
          state: 'UNKNOWN',
          version: current.version + 1,
        });
    }
  }

  snapshot(idValue: unknown): SimulatorIntent {
    return cloneIntent(this.#requiredIntent(asBusinessIntentId(idValue)));
  }

  #requiredIntent(id: BusinessIntentId): SimulatorIntent {
    const intent = this.#intents.get(id);
    if (!intent) throw new ContractValidationError(`unknown business_intent_id: ${id}`);
    return intent;
  }

  #replace(id: BusinessIntentId, intent: SimulatorIntent): SimulatorIntent {
    this.#intents.set(id, intent);
    return cloneIntent(intent);
  }
}
