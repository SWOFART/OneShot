import { RecoveryAgentSimulator, type SimulatorScenarioName } from './agent-simulator.js';
import { createKnownIdentityFixture, createScenario, type ScenarioName } from './simulator.js';
import {
  LOCAL_RECOVERY_SNAPSHOT_VERSION,
  RECOVERY_JOB_VERSION,
  RecoveryService,
  type KnownIdentityEvidencePort,
  type LocalRecoverySnapshot,
  type LocalRecoveryStatePort,
  type RecoveryCommandPack,
  type RecoveryCommandStorePort,
  type RecoveryCommandStoreResult,
  type RecoveryJob,
  type SubgraphMcpRecoveryPort,
} from './service.js';
import type {
  EvidenceBinding,
  IndexLookupOutcome,
  IndexLookupRequest,
  KnownIdentityRecoveryEvidence,
  SubgraphMcpPolicy,
} from './types.js';
import { normalizeSubgraphMcpTrace } from './validation.js';

export class SimulatorLocalRecoveryStatePort implements LocalRecoveryStatePort {
  readCount = 0;

  constructor(readonly snapshot: LocalRecoverySnapshot) {}

  async read(businessIntentId: string): Promise<LocalRecoverySnapshot> {
    this.readCount += 1;
    if (businessIntentId !== this.snapshot.binding.businessIntentId) {
      throw new Error('Intent is not present in the local simulator');
    }
    return this.snapshot;
  }
}

export class SimulatorKnownIdentityEvidencePort implements KnownIdentityEvidencePort {
  readCount = 0;

  constructor(readonly evidence: KnownIdentityRecoveryEvidence) {}

  async read(binding: EvidenceBinding): Promise<KnownIdentityRecoveryEvidence> {
    this.readCount += 1;
    if (binding.businessIntentId !== this.evidence.binding.businessIntentId) {
      throw new Error('Evidence binding is not present in the provider simulator');
    }
    return this.evidence;
  }
}

export class SimulatorSubgraphMcpRecoveryPort implements SubgraphMcpRecoveryPort {
  lookupCount = 0;

  constructor(readonly scenario: ReturnType<typeof createScenario>) {}

  async lookup(
    request: IndexLookupRequest,
    policy: SubgraphMcpPolicy,
  ): Promise<IndexLookupOutcome> {
    this.lookupCount += 1;
    return normalizeSubgraphMcpTrace(request, policy, this.scenario.trace);
  }
}

export class InMemoryRecoveryCommandStore implements RecoveryCommandStorePort {
  private readonly packsByEvent = new Map<string, RecoveryCommandPack>();

  async findByEventId(eventId: string): Promise<RecoveryCommandPack | null> {
    return this.packsByEvent.get(eventId) ?? null;
  }

  async append(pack: RecoveryCommandPack): Promise<RecoveryCommandStoreResult> {
    const existing = this.packsByEvent.get(pack.eventId);
    if (existing !== undefined) return { status: 'DUPLICATE', pack: existing };
    this.packsByEvent.set(pack.eventId, pack);
    return { status: 'APPENDED', pack };
  }

  get size(): number {
    return this.packsByEvent.size;
  }

  values(): readonly RecoveryCommandPack[] {
    return [...this.packsByEvent.values()];
  }
}

export interface RecoverySimulatorOptions {
  readonly businessIntentId?: string | undefined;
  readonly eventId?: string | undefined;
  readonly requestedAt?: string | undefined;
  readonly agentScenario?: SimulatorScenarioName | undefined;
  readonly mcpScenario?: ScenarioName | undefined;
  readonly withArcProof?: boolean | undefined;
  readonly durableState?: LocalRecoverySnapshot['durable']['state'] | undefined;
  readonly privyStatus?:
    'PENDING' | 'SUCCEEDED' | 'FAILED' | 'NOT_FOUND' | 'UNAVAILABLE' | undefined;
  readonly commandStore?: InMemoryRecoveryCommandStore | undefined;
}

export interface RecoverySimulatorComposition {
  readonly service: RecoveryService;
  readonly job: RecoveryJob;
  readonly localState: SimulatorLocalRecoveryStatePort;
  readonly knownIdentityEvidence: SimulatorKnownIdentityEvidencePort;
  readonly subgraphMcp: SimulatorSubgraphMcpRecoveryPort;
  readonly advisor: RecoveryAgentSimulator;
  readonly commandStore: InMemoryRecoveryCommandStore;
}

export function createRecoverySimulatorComposition(
  options: RecoverySimulatorOptions = {},
): RecoverySimulatorComposition {
  const scenario = createScenario(options.mcpScenario ?? 'fresh');
  const fixture = createKnownIdentityFixture();
  const businessIntentId = options.businessIntentId ?? fixture.binding.businessIntentId;
  const binding: EvidenceBinding = { ...fixture.binding, businessIntentId };
  const durableState = options.durableState ?? 'UNKNOWN';
  const evidence: KnownIdentityRecoveryEvidence = {
    ...fixture,
    binding,
    local: {
      ...fixture.local,
      settlementState: durableState,
    },
    privy:
      fixture.privy === null
        ? null
        : {
            ...fixture.privy,
            requestStatus: options.privyStatus ?? fixture.privy.requestStatus,
          },
    arc: options.withArcProof === false ? null : fixture.arc,
  };
  const indexRequest: IndexLookupRequest = {
    ...scenario.request,
    binding,
  };
  const snapshot: LocalRecoverySnapshot = {
    schemaVersion: LOCAL_RECOVERY_SNAPSHOT_VERSION,
    binding,
    durable: {
      state: durableState,
      stateVersion: fixture.local.stateVersion,
      attemptCount: 1,
      persistedAt: fixture.local.persistedAt,
    },
    indexRequest,
    mcpPolicy: scenario.policy,
    capturedAt: options.requestedAt ?? '2026-09-07T13:10:00.000Z',
  };
  const localState = new SimulatorLocalRecoveryStatePort(snapshot);
  const knownIdentityEvidence = new SimulatorKnownIdentityEvidencePort(evidence);
  const subgraphMcp = new SimulatorSubgraphMcpRecoveryPort(scenario);
  const advisor = new RecoveryAgentSimulator({ scenario: options.agentScenario ?? 'auto' });
  const commandStore = options.commandStore ?? new InMemoryRecoveryCommandStore();
  const service = new RecoveryService({
    localState,
    knownIdentityEvidence,
    subgraphMcp,
    advisor,
    commandStore,
  });
  const job: RecoveryJob = {
    schemaVersion: RECOVERY_JOB_VERSION,
    eventId: options.eventId ?? `reconcile:${businessIntentId}:${snapshot.durable.stateVersion}`,
    businessIntentId,
    requestedAt: options.requestedAt ?? '2026-09-07T13:10:00.000Z',
  };

  return {
    service,
    job,
    localState,
    knownIdentityEvidence,
    subgraphMcp,
    advisor,
    commandStore,
  };
}
