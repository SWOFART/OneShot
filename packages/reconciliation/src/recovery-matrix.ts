import { runChaosMatrix } from './chaos/runner.js';
import {
  InMemoryRecoveryCommandStore,
  createRecoverySimulatorComposition,
} from './service-simulator.js';
import type { RecoveryServiceResult } from './service.js';

export interface RecoveryMatrixRow {
  readonly scenario: string;
  readonly stableIntent: string;
  readonly startingState: 'SUBMITTING' | 'UNKNOWN' | 'COMMITTED' | 'FAILED_SAFE';
  readonly finalState: 'UNKNOWN' | 'COMMITTED' | 'FAILED_SAFE';
  readonly evidenceSources: readonly string[];
  readonly authorityClasses: readonly string[];
  readonly freshness: string;
  readonly decision: string;
  readonly externalSubmissionCount: number;
  readonly passed: boolean;
}

function rowFromService(
  scenario: string,
  startingState: RecoveryMatrixRow['startingState'],
  result: RecoveryServiceResult,
  extraPass = true,
): RecoveryMatrixRow {
  const pack = result.pack;
  const observationRecords =
    pack?.appendCommands
      .map((command) => command.record)
      .filter((record) => record.recordType === 'OBSERVATION') ?? [];
  return {
    scenario,
    stableIntent: pack?.businessIntentId ?? 'held-before-command-pack',
    startingState,
    finalState: pack?.reconciliationCommand.targetState ?? 'UNKNOWN',
    evidenceSources: [...new Set(observationRecords.map((record) => record.source))],
    authorityClasses: [...new Set(observationRecords.map((record) => record.authorityClass))],
    freshness: pack?.recoveryView.indexHealth ?? 'UNAVAILABLE',
    decision: pack?.reconciliationCommand.commandType ?? 'FAIL_CLOSED',
    externalSubmissionCount: result.externalSubmissionCount,
    passed:
      extraPass &&
      result.externalSubmissionCount === 0 &&
      (pack === null || pack.reconciliationCommand.settlementPermission === 'NEVER'),
  };
}

async function runServiceRows(): Promise<RecoveryMatrixRow[]> {
  const rows: RecoveryMatrixRow[] = [];
  const normal = createRecoverySimulatorComposition({
    businessIntentId: 'intent-matrix-normal',
    eventId: 'event-matrix-normal',
    agentScenario: 'return-existing-result',
  });
  rows.push(
    rowFromService(
      'normal-authoritative-success',
      'UNKNOWN',
      await normal.service.handle(normal.job),
    ),
  );

  for (const action of ['wait', 'reconcile', 'escalate', 'return-existing-result'] as const) {
    const composition = createRecoverySimulatorComposition({
      businessIntentId: `intent-matrix-${action}`,
      eventId: `event-matrix-${action}`,
      agentScenario: action,
      withArcProof: false,
    });
    rows.push(
      rowFromService(
        `advisor-${action}`,
        'UNKNOWN',
        await composition.service.handle(composition.job),
      ),
    );
  }

  const invalid = createRecoverySimulatorComposition({
    businessIntentId: 'intent-matrix-invalid-model',
    eventId: 'event-matrix-invalid-model',
    agentScenario: 'unsupported-action',
    withArcProof: false,
  });
  rows.push(
    rowFromService('invalid-model-output', 'UNKNOWN', await invalid.service.handle(invalid.job)),
  );

  const duplicate = createRecoverySimulatorComposition({
    businessIntentId: 'intent-matrix-duplicate',
    eventId: 'event-matrix-duplicate',
    withArcProof: false,
  });
  const duplicateFirst = await duplicate.service.handle(duplicate.job);
  const duplicateSecond = await duplicate.service.handle(duplicate.job);
  rows.push(
    rowFromService(
      'duplicate-delivery',
      'UNKNOWN',
      duplicateSecond,
      duplicateFirst.status === 'PROCESSED' &&
        duplicateSecond.status === 'DUPLICATE' &&
        duplicate.commandStore.size === 1 &&
        duplicateFirst.pack?.packId === duplicateSecond.pack?.packId,
    ),
  );

  const concurrent = createRecoverySimulatorComposition({
    businessIntentId: 'intent-matrix-concurrency',
    eventId: 'event-matrix-concurrency',
    withArcProof: false,
  });
  const concurrentResults = await Promise.all(
    Array.from({ length: 10 }, () => concurrent.service.handle(concurrent.job)),
  );
  rows.push(
    rowFromService(
      'ten-concurrent-recovery-workers',
      'UNKNOWN',
      concurrentResults[0]!,
      concurrent.commandStore.size === 1 &&
        concurrentResults.every(
          (result) => result.pack?.packId === concurrentResults[0]?.pack?.packId,
        ),
    ),
  );

  const denied = createRecoverySimulatorComposition({
    businessIntentId: 'intent-matrix-privy-denial',
    eventId: 'event-matrix-privy-denial',
    privyStatus: 'FAILED',
    withArcProof: false,
    agentScenario: 'wait',
  });
  rows.push(
    rowFromService('privy-policy-denial', 'UNKNOWN', await denied.service.handle(denied.job)),
  );

  const downstream = createRecoverySimulatorComposition({
    businessIntentId: 'intent-matrix-downstream-failure',
    eventId: 'event-matrix-downstream-failure',
    durableState: 'COMMITTED',
    agentScenario: 'wait',
  });
  rows.push(
    rowFromService(
      'downstream-failure-after-payment',
      'COMMITTED',
      await downstream.service.handle(downstream.job),
    ),
  );

  const sharedStore = new InMemoryRecoveryCommandStore();
  const firstAgent = createRecoverySimulatorComposition({
    businessIntentId: 'intent-matrix-two-agents',
    eventId: 'event-matrix-two-agents',
    withArcProof: false,
    commandStore: sharedStore,
  });
  const secondAgent = createRecoverySimulatorComposition({
    businessIntentId: 'intent-matrix-two-agents',
    eventId: 'event-matrix-two-agents',
    withArcProof: false,
    commandStore: sharedStore,
  });
  const twoAgentResults = await Promise.all([
    firstAgent.service.handle(firstAgent.job),
    secondAgent.service.handle(secondAgent.job),
  ]);
  rows.push(
    rowFromService(
      'two-agent-instances',
      'UNKNOWN',
      twoAgentResults[0]!,
      sharedStore.size === 1 &&
        twoAgentResults[0]?.pack?.packId === twoAgentResults[1]?.pack?.packId,
    ),
  );

  return rows;
}

export async function runRecoveryMatrix(): Promise<readonly RecoveryMatrixRow[]> {
  const chaosRows: RecoveryMatrixRow[] = runChaosMatrix().map((report) => {
    const evidenceSources = [
      ...report.view.authoritativeEvidence.map((record) => record.source),
      ...report.view.providerObservations.map((record) => record.source),
      ...(report.view.indexHealth === 'UNAVAILABLE' ? [] : ['THE_GRAPH']),
      'LLM',
    ];
    const authorityClasses = [
      ...report.view.authoritativeEvidence.map((record) => record.authorityClass),
      ...report.view.providerObservations.map((record) => record.authorityClass),
      ...(report.view.indexHealth === 'UNAVAILABLE'
        ? []
        : ['NON_AUTHORITATIVE_CANDIDATE_DISCOVERY']),
      'ADVISORY_AGENT_OBSERVATION',
    ];
    return {
      scenario: report.scenarioId,
      stableIntent: report.view.businessIntentId,
      startingState: 'UNKNOWN',
      finalState: report.command.targetState,
      evidenceSources: [...new Set(evidenceSources)],
      authorityClasses: [...new Set(authorityClasses)],
      freshness: report.view.indexHealth,
      decision: report.command.commandType,
      externalSubmissionCount: report.externalSubmissionCount,
      passed: report.passed,
    };
  });

  return [...(await runServiceRows()), ...chaosRows];
}

export function renderRecoveryMatrixMarkdown(rows: readonly RecoveryMatrixRow[]): string {
  const header =
    '| Scenario | Stable intent | Start | Final | Evidence | Authority | Freshness | Decision | External submissions | Pass |';
  const divider = '| --- | --- | --- | --- | --- | --- | --- | --- | ---: | --- |';
  const body = rows.map((row) =>
    [
      row.scenario,
      row.stableIntent,
      row.startingState,
      row.finalState,
      row.evidenceSources.join(' + ') || 'NONE',
      row.authorityClasses.join(' + ') || 'NONE',
      row.freshness,
      row.decision,
      String(row.externalSubmissionCount),
      row.passed ? 'PASS' : 'FAIL',
    ]
      .map((cell) => cell.replaceAll('|', '\\|'))
      .join(' | ')
      .replace(/^/u, '| ')
      .replace(/$/u, ' |'),
  );
  return [header, divider, ...body].join('\n');
}
