import type { IndexLookupOutcome, SubgraphMcpRecoveryPort } from '@oneshot/reconciliation';

/**
 * Graph lookup that never calls a network. Recovery treats the rejection as
 * an unavailable index and continues from direct receipt evidence.
 */
export class DisabledGraphRecoveryPort implements SubgraphMcpRecoveryPort {
  constructor(readonly reason: string) {}

  lookup(): Promise<IndexLookupOutcome> {
    return Promise.reject(new Error(this.reason));
  }
}
