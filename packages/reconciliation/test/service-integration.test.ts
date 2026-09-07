import { describe, expect, it } from 'vitest';
import {
  InMemoryRecoveryCommandStore,
  RecoveryService,
  createRecoverySimulatorComposition,
  runRecoveryMatrix,
  type KnownIdentityEvidencePort,
  type LocalRecoveryStatePort,
  type RecoveryAdvisorPort,
  type RecoveryCommandStorePort,
} from '../src/index.js';

describe('C04 recovery service boundary', () => {
  it('composes all source simulators and emits a sanitized append-only command pack', async () => {
    const composition = createRecoverySimulatorComposition({
      agentScenario: 'return-existing-result',
    });

    const result = await composition.service.handle(composition.job);

    expect(result.status).toBe('PROCESSED');
    expect(result.externalSubmissionCount).toBe(0);
    expect(result.pack?.reconciliationCommand.commandType).toBe('MARK_COMMITTED');
    expect(result.pack?.reconciliationCommand.settlementPermission).toBe('NEVER');
    expect(result.pack?.appendCommands.length).toBeGreaterThanOrEqual(4);

    const records = result.pack?.appendCommands.map((command) => command.record) ?? [];
    const graph = records.find((record) => record.source === 'THE_GRAPH');
    const decision = records.find((record) => record.recordType === 'DECISION');

    expect(graph?.authorityClass).toBe('NON_AUTHORITATIVE_CANDIDATE_DISCOVERY');
    expect(graph?.freshness).toBe('FRESH');
    expect(graph?.provenance.kind).toBe('MCP');
    expect(decision?.authorityClass).toBe('ADVISORY_AGENT_OBSERVATION');
    expect(decision?.provenance.kind).toBe('MODEL');
    expect(JSON.stringify(result.pack)).not.toMatch(/rawProviderBody|authorization|Bearer /iu);
  });

  it.each([
    ['wait', 'HOLD_UNKNOWN'],
    ['reconcile', 'READ_ONLY_LOOKUP'],
    ['escalate', 'ESCALATE_UNKNOWN'],
    ['return-existing-result', 'HOLD_UNKNOWN'],
  ] as const)(
    'maps advisor action %s through the deterministic core',
    async (agentScenario, expected) => {
      const composition = createRecoverySimulatorComposition({
        agentScenario,
        withArcProof: false,
        eventId: `event-action-${agentScenario}`,
      });

      const result = await composition.service.handle(composition.job);

      expect(result.pack?.reconciliationCommand.commandType).toBe(expected);
      expect(result.pack?.reconciliationCommand.targetState).toBe('UNKNOWN');
      expect(result.externalSubmissionCount).toBe(0);
    },
  );

  it('deduplicates repeated event delivery before rereading external evidence', async () => {
    const composition = createRecoverySimulatorComposition({ withArcProof: false });

    const first = await composition.service.handle(composition.job);
    const second = await composition.service.handle(composition.job);

    expect(first.status).toBe('PROCESSED');
    expect(second.status).toBe('DUPLICATE');
    expect(second.issues).toContain('DUPLICATE_EVENT');
    expect(second.pack?.packId).toBe(first.pack?.packId);
    expect(composition.commandStore.size).toBe(1);
    expect(composition.localState.readCount).toBe(1);
    expect(composition.knownIdentityEvidence.readCount).toBe(1);
    expect(composition.subgraphMcp.lookupCount).toBe(1);
  });

  it('rejects reuse of one event ID for a different business intent', async () => {
    const store = new InMemoryRecoveryCommandStore();
    const first = createRecoverySimulatorComposition({
      businessIntentId: 'intent-event-owner',
      eventId: 'shared-event-id',
      commandStore: store,
    });
    const conflicting = createRecoverySimulatorComposition({
      businessIntentId: 'intent-event-conflict',
      eventId: 'shared-event-id',
      commandStore: store,
    });

    expect((await first.service.handle(first.job)).status).toBe('PROCESSED');
    const result = await conflicting.service.handle(conflicting.job);

    expect(result.status).toBe('HELD');
    expect(result.issues).toEqual(['EVENT_ID_CONFLICT']);
    expect(result.pack).toBeNull();
    expect(store.size).toBe(1);
  });

  it('converges ten concurrent handlers on one immutable command pack', async () => {
    const composition = createRecoverySimulatorComposition({
      businessIntentId: 'intent-c04-concurrent',
      eventId: 'event-c04-concurrent',
      withArcProof: false,
    });

    const results = await Promise.all(
      Array.from({ length: 10 }, () => composition.service.handle(composition.job)),
    );

    expect(composition.commandStore.size).toBe(1);
    expect(new Set(results.map((result) => result.pack?.packId)).size).toBe(1);
    expect(results.filter((result) => result.status === 'PROCESSED')).toHaveLength(1);
    expect(results.every((result) => result.externalSubmissionCount === 0)).toBe(true);
  });

  it('fails closed on local contract mismatch without calling other sources', async () => {
    const composition = createRecoverySimulatorComposition();
    const localState = {
      read: async () => ({ ...composition.localState.snapshot, schemaVersion: 'future-v2' }),
    } as unknown as LocalRecoveryStatePort;
    const service = new RecoveryService({
      localState,
      knownIdentityEvidence: composition.knownIdentityEvidence,
      subgraphMcp: composition.subgraphMcp,
      advisor: composition.advisor,
      commandStore: new InMemoryRecoveryCommandStore(),
    });

    const result = await service.handle(composition.job);

    expect(result.status).toBe('HELD');
    expect(result.issues).toEqual(['CONTRACT_VERSION_MISMATCH']);
    expect(result.pack).toBeNull();
    expect(composition.knownIdentityEvidence.readCount).toBe(0);
    expect(result.externalSubmissionCount).toBe(0);
  });

  it('rejects a Graph request that is not bound to the local snapshot', async () => {
    const composition = createRecoverySimulatorComposition();
    const localState = {
      read: async () => ({
        ...composition.localState.snapshot,
        indexRequest: {
          ...composition.localState.snapshot.indexRequest,
          binding: {
            ...composition.localState.snapshot.binding,
            amountAtomic: '999999999',
          },
        },
      }),
    } as LocalRecoveryStatePort;
    const service = new RecoveryService({
      localState,
      knownIdentityEvidence: composition.knownIdentityEvidence,
      subgraphMcp: composition.subgraphMcp,
      advisor: composition.advisor,
      commandStore: new InMemoryRecoveryCommandStore(),
    });

    const result = await service.handle(composition.job);

    expect(result.status).toBe('HELD');
    expect(result.issues).toEqual(['EVIDENCE_BINDING_MISMATCH']);
    expect(composition.subgraphMcp.lookupCount).toBe(0);
  });

  it('fails closed when the append-only command store is unavailable', async () => {
    const composition = createRecoverySimulatorComposition();
    const commandStore = {
      findByEventId: async () => null,
      append: async () => {
        throw new Error('store unavailable');
      },
    } satisfies RecoveryCommandStorePort;
    const service = new RecoveryService({
      localState: composition.localState,
      knownIdentityEvidence: composition.knownIdentityEvidence,
      subgraphMcp: composition.subgraphMcp,
      advisor: composition.advisor,
      commandStore,
    });

    const result = await service.handle(composition.job);

    expect(result.status).toBe('HELD');
    expect(result.issues).toEqual(['COMMAND_STORE_UNAVAILABLE']);
    expect(result.pack).toBeNull();
    expect(result.externalSubmissionCount).toBe(0);
  });

  it('rejects raw provider payloads before they cross the persistence seam', async () => {
    const composition = createRecoverySimulatorComposition();
    const knownIdentityEvidence = {
      read: async () => ({
        ...composition.knownIdentityEvidence.evidence,
        rawProviderBody: 'Bearer should-never-cross-this-boundary',
      }),
    } as unknown as KnownIdentityEvidencePort;
    const store = new InMemoryRecoveryCommandStore();
    const service = new RecoveryService({
      localState: composition.localState,
      knownIdentityEvidence,
      subgraphMcp: composition.subgraphMcp,
      advisor: composition.advisor,
      commandStore: store,
    });

    const result = await service.handle(composition.job);

    expect(result.status).toBe('HELD');
    expect(result.issues).toContain('RAW_PROVIDER_PAYLOAD_REJECTED');
    expect(store.size).toBe(0);
    expect(result.externalSubmissionCount).toBe(0);
  });

  it('rejects an unknown agent enum and holds UNKNOWN', async () => {
    const composition = createRecoverySimulatorComposition({ withArcProof: false });
    const advisor = {
      recommend: async () => ({
        accepted: true,
        recommendation: {
          action: 'RETRY_SETTLEMENT',
          decisionId: 'unsafe-decision',
          reason: 'retry',
          referencedEvidenceIds: [],
          modelIdentity: {
            modelName: 'unsafe-simulator',
            modelVersion: '1',
            promptVersion: '1',
          },
          timestamp: composition.job.requestedAt,
        },
        issues: [],
      }),
    } as unknown as RecoveryAdvisorPort;
    const service = new RecoveryService({
      localState: composition.localState,
      knownIdentityEvidence: composition.knownIdentityEvidence,
      subgraphMcp: composition.subgraphMcp,
      advisor,
      commandStore: new InMemoryRecoveryCommandStore(),
    });

    const result = await service.handle(composition.job);

    expect(result.issues).toContain('ADVISOR_BOUNDARY_REJECTED');
    expect(result.pack?.reconciliationCommand.commandType).toBe('HOLD_UNKNOWN');
    expect(result.pack?.reconciliationCommand.advisoryAction).toBe('WAIT');
    expect(result.externalSubmissionCount).toBe(0);
  });

  it('fails closed on missing freshness and wrong MCP identity', async () => {
    for (const mcpScenario of ['unknown-freshness', 'wrong-tool', 'wrong-deployment'] as const) {
      const composition = createRecoverySimulatorComposition({
        businessIntentId: `intent-${mcpScenario}`,
        eventId: `event-${mcpScenario}`,
        mcpScenario,
        withArcProof: false,
        agentScenario: 'wait',
      });
      const result = await composition.service.handle(composition.job);

      expect(result.pack?.reconciliationCommand.targetState).toBe('UNKNOWN');
      expect(result.pack?.reconciliationCommand.settlementPermission).toBe('NEVER');
      expect(result.issues.length).toBeGreaterThan(0);
      expect(result.externalSubmissionCount).toBe(0);
    }
  });
});

describe('C04 complete pre-live recovery matrix', () => {
  it('covers required recovery seams with zero external submissions', async () => {
    const rows = await runRecoveryMatrix();
    const scenarioIds = rows.map((row) => row.scenario);

    expect(rows.length).toBeGreaterThanOrEqual(35);
    expect(scenarioIds).toEqual(
      expect.arrayContaining([
        'normal-authoritative-success',
        'advisor-wait',
        'advisor-reconcile',
        'advisor-escalate',
        'advisor-return-existing-result',
        'invalid-model-output',
        'duplicate-delivery',
        'ten-concurrent-recovery-workers',
        'crash-before-submission',
        'lost-response-after-submission',
        'mcp-delayed-result',
        'mcp-query-failure',
        'mcp-malformed-result',
        'mcp-hostile-injection',
        'privy-policy-denial',
        'restart-between-transitions',
        'downstream-failure-after-payment',
        'two-agent-instances',
      ]),
    );
    expect(rows.every((row) => row.externalSubmissionCount === 0)).toBe(true);
    expect(rows.every((row) => row.passed)).toBe(true);
  });
});
