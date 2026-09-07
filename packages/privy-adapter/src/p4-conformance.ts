/**
 * Compile-time proof that the P4 adapters fit the worker's ports.
 *
 * `apps/worker/src/types.ts` declares `AuthorizationPort` and `SettlementPort`.
 * Importing them here would break the lane rule against depending on another
 * owner's implementation package, so the shapes are mirrored and structural
 * assignability is asserted instead.
 *
 * This file emits no runtime code. Its whole job is to fail `tsc` the moment
 * these adapters stop fitting the seam they are meant to be injected into, so
 * the mismatch surfaces here rather than during Gate P4 composition.
 *
 * If the worker's interfaces change, update the mirror below deliberately and
 * treat the diff as a contract change to agree with Coder A.
 */

import type {
  AuthorizationResult,
  CreateIntentRequest,
  SettlementResult,
} from '@oneshot/contracts';
import type { ArcSettlementAdapter, PrivyAuthorizationAdapter } from './adapters.js';

/** Mirror of `apps/worker/src/types.ts` `AuthorizationPort`. */
interface WorkerAuthorizationPort {
  authorize(request: CreateIntentRequest): Promise<AuthorizationResult>;
}

/** Mirror of `apps/worker/src/types.ts` `SettlementContext`. */
interface WorkerSettlementContext {
  readonly attemptId: string;
  readonly correlationId: string;
}

/** Mirror of `apps/worker/src/types.ts` `SettlementPort`. */
interface WorkerSettlementPort {
  submit(
    request: CreateIntentRequest,
    context: WorkerSettlementContext,
  ): Promise<SettlementResult>;
}

/**
 * `composeWorker` also reads `contractVersion` off an injected port and
 * compares it against its expected value, and reads `network` off the
 * settlement port. Both are asserted so a rename cannot slip through.
 */
interface WorkerInjectableSettlementPort extends WorkerSettlementPort {
  readonly contractVersion: string;
  readonly network: string;
}

interface WorkerInjectableAuthorizationPort extends WorkerAuthorizationPort {
  readonly contractVersion: string;
}

/** Fails to compile if the adapter stops satisfying the port. */
type Satisfies<Port, Adapter extends Port> = Adapter;

export type SettlementPortConformance = Satisfies<
  WorkerInjectableSettlementPort,
  ArcSettlementAdapter
>;

export type AuthorizationPortConformance = Satisfies<
  WorkerInjectableAuthorizationPort,
  PrivyAuthorizationAdapter
>;
