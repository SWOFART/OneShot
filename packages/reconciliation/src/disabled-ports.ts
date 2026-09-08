import type { SubgraphMcpRecoveryPort } from './service.js';
import type {
  IndexLookupOutcome,
  RecoveryAdvisorPort,
  RecoveryRecommendationOutcome,
} from './types.js';

/** Production-safe default when no live Subgraph MCP transport is configured. */
export class UnavailableSubgraphMcpRecoveryPort implements SubgraphMcpRecoveryPort {
  lookup(): Promise<IndexLookupOutcome> {
    return Promise.reject(new Error('Live Subgraph MCP recovery is not configured'));
  }
}

/** Production-safe default when no structured-output recovery model exists. */
export class UnavailableRecoveryAdvisorPort implements RecoveryAdvisorPort {
  recommend(): Promise<RecoveryRecommendationOutcome> {
    return Promise.reject(new Error('Live recovery advisor is not configured'));
  }
}
