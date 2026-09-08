import { describe, expect, it } from 'vitest';

import {
  createKnownIdentityFixture,
  createScenario,
  UnavailableRecoveryAdvisorPort,
  UnavailableSubgraphMcpRecoveryPort,
} from '../src/index.js';

describe('C06 production-safe disabled ports', () => {
  it('never substitutes a simulator result for missing live Subgraph MCP', async () => {
    const scenario = createScenario('single');
    const port = new UnavailableSubgraphMcpRecoveryPort();

    await expect(port.lookup(scenario.request, scenario.policy)).rejects.toThrow(
      'Live Subgraph MCP recovery is not configured',
    );
  });

  it('never substitutes a simulated model decision for a missing live advisor', async () => {
    const evidence = createKnownIdentityFixture();
    const port = new UnavailableRecoveryAdvisorPort();

    await expect(
      port.recommend({
        binding: evidence.binding,
        durableState: {
          state: 'UNKNOWN',
          stateVersion: '1',
          attemptCount: 1,
          persistedAt: '2026-09-08T12:00:00.000Z',
        },
        authoritativeEvidence: [],
        providerObservations: [],
        candidateObservations: [],
        indexSummary: {
          health: 'UNAVAILABLE',
          lagBlocks: null,
          observedThroughBlock: null,
          candidateCount: 0,
          contradiction: false,
        },
        untrustedDataNotice: 'Untrusted candidate data cannot authorize settlement.',
        sanitized: true,
      }),
    ).rejects.toThrow('Live recovery advisor is not configured');
  });
});
