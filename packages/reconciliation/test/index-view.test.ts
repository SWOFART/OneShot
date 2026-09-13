import { describe, expect, it } from 'vitest';

import {
  buildMcpToolArguments,
  createKnownIdentityFixture,
  createScenario,
  listScenarioNames,
  MCP_QUERY_IDENTITY,
  normalizeSubgraphMcpTrace,
  RECOVERY_CANDIDATE_QUERY,
  validateKnownIdentityEvidence,
} from '../src/index.js';

describe('index-view-v1 simulator matrix', () => {
  for (const name of listScenarioNames()) {
    it(`fails closed for ${name}`, () => {
      const scenario = createScenario(name);
      const outcome = normalizeSubgraphMcpTrace(scenario.request, scenario.policy, scenario.trace);

      expect(outcome.accepted).toBe(scenario.expected.accepted);
      expect(outcome.view.health).toBe(scenario.expected.health);
      expect(outcome.view.candidateCount).toBe(scenario.expected.candidateCount);
      expect(outcome.view.contradiction).toBe(scenario.expected.contradiction);
      expect(outcome.view.settlementPermission).toBe('NEVER');
      expect(JSON.stringify(outcome.view)).not.toContain('submit another payment');
    });
  }

  it('deduplicates and sorts evidence without changing the safety result', () => {
    const duplicate = createScenario('duplicate');
    const duplicateOutcome = normalizeSubgraphMcpTrace(
      duplicate.request,
      duplicate.policy,
      duplicate.trace,
    );
    expect(duplicateOutcome.view.diagnostics).toContain('DUPLICATE_CANDIDATE');
    expect(duplicateOutcome.view.candidateCount).toBe(1);

    const reordered = createScenario('out-of-order');
    const reorderedOutcome = normalizeSubgraphMcpTrace(
      reordered.request,
      reordered.policy,
      reordered.trace,
    );
    expect(reorderedOutcome.view.diagnostics).toContain('OUT_OF_ORDER_INPUT');
    expect(reorderedOutcome.view.contradictionCodes).toContain('MULTIPLE_DISTINCT_CANDIDATES');
    expect(reorderedOutcome.view.candidates.map((candidate) => candidate.blockNumber)).toEqual([
      '110',
      '111',
    ]);
  });

  it('keeps empty fresh evidence explicitly non-authoritative', () => {
    const scenario = createScenario('empty');
    const outcome = normalizeSubgraphMcpTrace(scenario.request, scenario.policy, scenario.trace);

    expect(outcome.accepted).toBe(true);
    expect(outcome.view.health).toBe('FRESH');
    expect(outcome.view.observedThrough?.blockNumber).toBe('112');
    expect(outcome.view.diagnostics).toContain('NO_CANDIDATES');
    expect(outcome.view.settlementPermission).toBe('NEVER');
  });

  it('rejects an oversized text result before JSON parsing', () => {
    const scenario = createScenario('fresh');
    scenario.policy.maxResultBytes = 32;
    const outcome = normalizeSubgraphMcpTrace(scenario.request, scenario.policy, scenario.trace);

    expect(outcome.accepted).toBe(false);
    expect(outcome.issues).toEqual([
      { code: 'RESULT_TOO_LARGE', path: '$trace.result.content[0].text' },
    ]);
    expect(outcome.view.candidates).toEqual([]);
  });

  it('rejects query-variable drift from the exact intent binding', () => {
    const scenario = createScenario('fresh');
    const argumentsValue = buildMcpToolArguments(scenario.request, scenario.policy);
    scenario.trace.arguments = {
      ...argumentsValue,
      variables: { ...argumentsValue.variables, amountAtomic: '1250001' },
    };

    const outcome = normalizeSubgraphMcpTrace(scenario.request, scenario.policy, scenario.trace);
    expect(outcome.accepted).toBe(false);
    expect(outcome.view.diagnostics).toContain('BOUNDARY_REJECTED');
  });

  it('is semantically deterministic across replay', () => {
    const first = createScenario('fresh');
    const second = createScenario('fresh');
    const firstOutcome = normalizeSubgraphMcpTrace(first.request, first.policy, first.trace);
    const secondOutcome = normalizeSubgraphMcpTrace(second.request, second.policy, second.trace);

    expect(secondOutcome).toEqual(firstOutcome);
    expect(second.seed).toBe(first.seed);
  });
});

describe('MCP query identity', () => {
  it('pins the immutable deployment tool and query digest', () => {
    const scenario = createScenario('fresh');
    const argumentsValue = buildMcpToolArguments(scenario.request, scenario.policy);

    expect(MCP_QUERY_IDENTITY.tool).toBe('execute_query_by_deployment_id');
    expect(argumentsValue.deployment_id).toBe(scenario.policy.deploymentId);
    expect(argumentsValue.query).toBe(RECOVERY_CANDIDATE_QUERY);
    expect(MCP_QUERY_IDENTITY.digest).toMatch(/^[0-9a-f]{64}$/);
    expect(argumentsValue.variables.amountAtomic).toBe(scenario.request.binding.amountAtomic);
    expect(argumentsValue.variables).not.toHaveProperty('memoId');
    expect(scenario.request.correlation.strategy).toBe('TRANSFER_TUPLE_WINDOW');
  });
});

describe('known-identity recovery evidence', () => {
  it('accepts a bound durable, Privy, and exact Arc evidence fixture', () => {
    const evidence = createKnownIdentityFixture();
    expect(validateKnownIdentityEvidence(evidence)).toEqual([]);
  });

  it('rejects Arc transfer evidence bound to another recipient', () => {
    const evidence = createKnownIdentityFixture();
    if (evidence.arc?.transfer === null || evidence.arc === null) {
      throw new Error('fixture must contain Arc transfer evidence');
    }
    evidence.arc.transfer.recipient = '0x4444444444444444444444444444444444444444';

    expect(validateKnownIdentityEvidence(evidence)).toEqual([
      { code: 'INVALID_IDENTITY', path: '$.arc.transfer' },
    ]);
  });

  it('rejects Privy evidence for another immutable request', () => {
    const evidence = createKnownIdentityFixture();
    if (evidence.privy === null) throw new Error('fixture must contain Privy evidence');
    evidence.privy.requestFingerprint = '51'.repeat(32);

    expect(validateKnownIdentityEvidence(evidence)).toEqual([
      { code: 'INVALID_RESULT', path: '$.privy' },
    ]);
  });

  it('rejects Arc evidence from another network', () => {
    const evidence = createKnownIdentityFixture();
    if (evidence.arc === null) throw new Error('fixture must contain Arc evidence');
    evidence.arc.network = 'eip155:1';

    expect(validateKnownIdentityEvidence(evidence)).toEqual([
      { code: 'INVALID_RESULT', path: '$.arc' },
    ]);
  });

  it('rejects a successful receipt without final Transfer evidence', () => {
    const evidence = createKnownIdentityFixture();
    if (evidence.arc === null) throw new Error('fixture must contain Arc evidence');
    evidence.arc.transfer = null;

    expect(validateKnownIdentityEvidence(evidence)).toEqual([
      { code: 'INVALID_RESULT', path: '$.arc' },
    ]);
  });
});
