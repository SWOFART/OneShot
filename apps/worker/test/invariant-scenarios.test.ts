import { describe, expect, it } from 'vitest';
import { formatScenarioResultsTable, runAllInvariantScenarios } from '../src/index.js';

describe('Invariant Scenarios Execution (A06.2)', () => {
  it('executes all 7 invariant scenarios successfully and satisfies at-most-one settlement', async () => {
    const results = await runAllInvariantScenarios();

    expect(results).toHaveLength(7);

    for (const res of results) {
      expect(res.status).toBe('PASS');
      expect(res.atMostOneSettlementSatisfied).toBe(true);
      expect(res.externalSettlementCount).toBeLessThanOrEqual(1);
    }

    const table = formatScenarioResultsTable(results);
    expect(table).toContain('| Scenario | Business Intent ID | Durable Final State |');
    expect(table).toContain('`identical-replay`');
    expect(table).toContain('`conflicting-replay`');
    expect(table).toContain('`ten-parallel-workers`');
    expect(table).toContain('`two-processes`');
    expect(table).toContain('`restart`');
    expect(table).toContain('`lost-response`');
    expect(table).toContain('`downstream-failure`');
  });

  it('verifies identical-replay preserves intent id and allows at most 1 settlement', async () => {
    const results = await runAllInvariantScenarios();
    const replay = results.find((r) => r.scenario === 'identical-replay');
    expect(replay).toBeDefined();
    expect(replay?.durableFinalState).toBe('COMMITTED');
    expect(replay?.externalSettlementCount).toBe(1);
  });

  it('verifies conflicting-replay rejects second payload without creating extra settlements', async () => {
    const results = await runAllInvariantScenarios();
    const conflict = results.find((r) => r.scenario === 'conflicting-replay');
    expect(conflict).toBeDefined();
    expect(conflict?.durableFinalState).toBe('COMMITTED');
    expect(conflict?.externalSettlementCount).toBe(1);
  });

  it('verifies ten-parallel-workers races produce exactly one settlement', async () => {
    const results = await runAllInvariantScenarios();
    const workers = results.find((r) => r.scenario === 'ten-parallel-workers');
    expect(workers).toBeDefined();
    expect(workers?.durableFinalState).toBe('COMMITTED');
    expect(workers?.externalSettlementCount).toBe(1);
  });

  it('verifies downstream-failure results in zero settlements and FAILED_SAFE state', async () => {
    const results = await runAllInvariantScenarios();
    const failure = results.find((r) => r.scenario === 'downstream-failure');
    expect(failure).toBeDefined();
    expect(failure?.durableFinalState).toBe('FAILED_SAFE');
    expect(failure?.externalSettlementCount).toBe(0);
  });
});
