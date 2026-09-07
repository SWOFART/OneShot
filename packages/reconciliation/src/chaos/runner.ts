import { createKnownIdentityFixture, createScenario } from '../simulator.js';
import { normalizeSubgraphMcpTrace } from '../validation.js';
import { buildRecoveryAgentInput } from '../agent-contract.js';
import { evaluateReconciliation } from '../safety-core.js';
import { RecoveryAgentSimulator } from '../agent-simulator.js';
import type { EvidenceBinding, IndexView, KnownIdentityRecoveryEvidence } from '../types.js';
import type { ChaosExecutionReport, ChaosScenario } from './types.js';
import { CHAOS_SCENARIO_CATALOG } from './scenarios.js';

export function runChaosScenario(scenario: ChaosScenario): ChaosExecutionReport {
  const baseEvidence = createKnownIdentityFixture();
  const binding: EvidenceBinding = {
    ...baseEvidence.binding,
    businessIntentId: `intent-chaos-${scenario.id}-${scenario.seed}`,
  };

  // Build synthetic evidence according to injection point and contradictions
  let arcEvidence: KnownIdentityRecoveryEvidence['arc'] = null;
  let privyEvidence: KnownIdentityRecoveryEvidence['privy'] = null;

  if (scenario.injectionPoint === 'CONFIRMED') {
    if (baseEvidence.arc && baseEvidence.arc.transfer) {
      arcEvidence = {
        ...baseEvidence.arc,
        receiptStatus: 'SUCCESS',
        finality: 'FINAL',
        network: binding.network,
        transfer: {
          ...baseEvidence.arc.transfer,
          recipient: binding.recipient,
          tokenContract: binding.tokenContract,
          amountAtomic: binding.amountAtomic,
        },
      };
    }
  } else if (scenario.contradictionSetup) {
    const setup = scenario.contradictionSetup;
    if (setup.arcStatus === 'REVERT') {
      arcEvidence = baseEvidence.arc
        ? {
            ...baseEvidence.arc,
            receiptStatus: 'REVERT',
            finality: 'FINAL',
            transfer: null,
          }
        : null;
    } else if (setup.arcStatus === 'SUCCESS') {
      arcEvidence = baseEvidence.arc
        ? {
            ...baseEvidence.arc,
            receiptStatus: 'SUCCESS',
            finality: 'FINAL',
            transfer: baseEvidence.arc.transfer
              ? {
                  ...baseEvidence.arc.transfer,
                  recipient: setup.recipientMismatch
                    ? '0x9999999999999999999999999999999999999999'
                    : binding.recipient,
                  tokenContract: setup.tokenMismatch
                    ? '0x8888888888888888888888888888888888888888'
                    : binding.tokenContract,
                  amountAtomic: setup.amountMismatch ? '999999999' : binding.amountAtomic,
                }
              : null,
          }
        : null;
    }

    if (setup.privyStatus) {
      privyEvidence = baseEvidence.privy
        ? {
            ...baseEvidence.privy,
            requestStatus: setup.privyStatus,
          }
        : null;
    }
  }

  const synthesizedEvidence: KnownIdentityRecoveryEvidence = {
    ...baseEvidence,
    binding,
    arc: arcEvidence,
    privy: privyEvidence,
  };

  // Build synthetic Subgraph MCP view
  let indexView: IndexView | null = null;
  const hasDegradation = (type: string): boolean =>
    scenario.mcpDegradations.some((degradation) => degradation.type === type);
  if (hasDegradation('EMPTY_RESULT')) {
    const s = createScenario('empty');
    indexView = normalizeSubgraphMcpTrace(s.request, s.policy, s.trace).view;
  } else if (hasDegradation('LAGGING_HEAD') || hasDegradation('DELAYED_RESULT')) {
    const s = createScenario('lagging');
    indexView = normalizeSubgraphMcpTrace(s.request, s.policy, s.trace).view;
  } else if (hasDegradation('PROVIDER_HEALTH_ERROR')) {
    const s = createScenario('unhealthy');
    indexView = normalizeSubgraphMcpTrace(s.request, s.policy, s.trace).view;
  } else if (hasDegradation('WRONG_TOOL')) {
    const s = createScenario('wrong-tool');
    indexView = normalizeSubgraphMcpTrace(s.request, s.policy, s.trace).view;
  } else if (hasDegradation('WRONG_DEPLOYMENT')) {
    const s = createScenario('wrong-deployment');
    indexView = normalizeSubgraphMcpTrace(s.request, s.policy, s.trace).view;
  } else if (hasDegradation('DUPLICATE_EVENTS')) {
    const s = createScenario('duplicate');
    indexView = normalizeSubgraphMcpTrace(s.request, s.policy, s.trace).view;
  } else if (hasDegradation('OUT_OF_ORDER_EVENTS')) {
    const s = createScenario('out-of-order');
    indexView = normalizeSubgraphMcpTrace(s.request, s.policy, s.trace).view;
  } else if (hasDegradation('OMIT_FRESHNESS_METADATA')) {
    const s = createScenario('unknown-freshness');
    indexView = normalizeSubgraphMcpTrace(s.request, s.policy, s.trace).view;
  } else if (hasDegradation('QUERY_FAILURE')) {
    const s = createScenario('unavailable');
    indexView = normalizeSubgraphMcpTrace(s.request, s.policy, s.trace).view;
  } else if (hasDegradation('OVERSIZED_RESULT') || hasDegradation('MALFORMED_RESULT')) {
    const s = createScenario('malformed');
    indexView = normalizeSubgraphMcpTrace(s.request, s.policy, s.trace).view;
  } else if (hasDegradation('PROMPT_INJECTION_TEXT')) {
    const s = createScenario('injected');
    indexView = normalizeSubgraphMcpTrace(s.request, s.policy, s.trace).view;
  }

  // Setup Recovery Agent Simulator
  const simulator = new RecoveryAgentSimulator({
    scenario: scenario.agentScenario ?? 'auto',
  });

  const agentInput = buildRecoveryAgentInput({
    binding,
    durableState: {
      state: 'UNKNOWN',
      stateVersion: '1',
      attemptCount: 1,
      persistedAt: '2026-09-07T12:00:00.000Z',
    },
    evidence: synthesizedEvidence,
    indexView,
  });

  const recommendation = simulator.recommend(agentInput);

  const { command, view } = evaluateReconciliation({
    binding,
    durable: {
      state: 'UNKNOWN',
      stateVersion: '1',
    },
    evidence: synthesizedEvidence,
    indexView,
    recommendationOutcome: recommendation,
  });

  // Verify Critical Invariants
  const externalSubmissionCount = command.settlementPermission === 'NEVER' ? 0 : 1;
  const passed =
    command.targetState === scenario.expectedTargetState &&
    command.commandType === scenario.expectedCommandType &&
    command.settlementPermission === 'NEVER' &&
    view.settlementPermission === 'NEVER' &&
    externalSubmissionCount === scenario.expectedExternalSubmissions;

  return {
    scenarioId: scenario.id,
    name: scenario.name,
    seed: scenario.seed,
    passed,
    command,
    view,
    externalSubmissionCount,
    diagnostics: view.diagnostics,
  };
}

export function runChaosMatrix(
  catalog: readonly ChaosScenario[] = CHAOS_SCENARIO_CATALOG,
): readonly ChaosExecutionReport[] {
  return catalog.map((scenario) => runChaosScenario(scenario));
}
