import { describe, expect, it } from 'vitest';
import type { Pool } from 'pg';
import {
  TRANSFER_EVENT_TOPIC,
  type SettlementConfig,
  type TransactionReceipt,
} from '@oneshot/arc-adapter';
import type {
  CompleteSubmissionResult,
  EvidenceView,
  IntentResponse,
  SettlementResult,
} from '@oneshot/contracts';
import type { IntentLedger } from '@oneshot/storage-postgres';
import {
  ArcSettlementAdapter,
  type EvidencePort as LaneBEvidencePort,
  PrivyAuthorizationAdapter,
  type SettlementBaseline,
} from '@oneshot/privy-adapter';
import {
  createRecoverySimulatorComposition,
  RecoveryService,
  type DetailedRecoveryView,
} from '@oneshot/reconciliation';
import { composeWorker, createProductionRecoveryService } from '../src/composition.js';
import { executeReconcileIntent } from '../src/worker.js';
import {
  IntentLedgerLocalRecoveryStatePort,
  IntentLedgerRecoveryCommandStore,
  PrivyArcEvidenceBridge,
} from '../src/recovery-bridge.js';

describe('Gate P4: Backend Convergence and Adapter Replacement', () => {
  const sampleRequest = {
    business_intent_id: 'intent-p4-1',
    recipient: '0x1111111111111111111111111111111111111111',
    amount_atomic: '1000000',
    asset: 'USDC' as const,
    network: 'eip155:5042002' as const,
    purpose: 'Gate P4 integration test intent',
  };

  const sampleBaseline: SettlementBaseline = {
    rpcUrl: 'https://testnet.arc.network',
    chainId: 5042002,
    usdcContract: '0x3333333333333333333333333333333333333333',
    maxPaymentAtomic: 10000000n,
    allowedRecipients: ['0x1111111111111111111111111111111111111111'],
  };

  const sampleConfig: SettlementConfig = {
    network: 'eip155:5042002',
    rpcUrl: 'https://testnet.arc.network',
    usdcContract: '0x3333333333333333333333333333333333333333',
    maxPaymentAtomic: 10000000n,
    allowedRecipients: ['0x1111111111111111111111111111111111111111'],
  };

  const realTxHash = '0x' + 'e'.repeat(64);
  const realBlockHash = '0x' + 'b'.repeat(64);
  const realSender = '0x2222222222222222222222222222222222222222';
  const requestFingerprint = 'f'.repeat(64);
  const recoveryLocalState = {
    tokenContract: sampleConfig.usdcContract,
    correlationSender: realSender,
    fromBlock: '999000',
    toBlock: '999200',
    mcpPolicy: {
      serverName: 'subgraph-mcp',
      serverVersion: '1.0.0',
      deploymentId: `0x${'d'.repeat(64)}`,
      manifestCid: `Qm${'a'.repeat(44)}`,
      maxLagBlocks: '5',
      maxCandidates: 5,
      maxResultBytes: 65536,
    },
  } as const;

  const realReceipt: TransactionReceipt = {
    transactionHash: realTxHash,
    chainId: 5042002,
    from: realSender,
    to: '0x3333333333333333333333333333333333333333',
    status: 1,
    blockNumber: 999123n,
    blockHash: realBlockHash,
    logs: [
      {
        address: '0x3333333333333333333333333333333333333333',
        topics: [
          TRANSFER_EVENT_TOPIC,
          '0x0000000000000000000000002222222222222222222222222222222222222222',
          '0x0000000000000000000000001111111111111111111111111111111111111111',
        ],
        data: '0x00000000000000000000000000000000000000000000000000000000000f4240',
        logIndex: 0,
      },
    ],
  };

  const mockWalletProvider = {
    sendTransaction: async () => ({
      transactionHash: realTxHash,
      providerReferenceId: 'privy-ref-p4',
    }),
    getReceipt: async () => realReceipt,
  };

  it('composes worker under production profile with real ArcSettlementAdapter, PrivyAuthorizationAdapter, and RecoveryService', async () => {
    const mockLedger = {
      ping: async () => {},
      getIntent: async () => undefined,
    } as unknown as IntentLedger;
    const mockPool = {} as unknown as Pool;

    const settlementAdapter = new ArcSettlementAdapter(sampleConfig, mockWalletProvider);
    const authorizationAdapter = new PrivyAuthorizationAdapter(
      sampleConfig,
      sampleBaseline,
      () => sampleBaseline,
    );

    const composed = composeWorker(mockPool, mockLedger, {
      profile: 'production',
      settlementPort: settlementAdapter,
      authorizationPort: authorizationAdapter,
      recovery: {
        localState: recoveryLocalState,
        bridge: {
          defaultArcTxHash: realTxHash,
          defaultReceipt: realReceipt,
        },
      },
    });

    const readiness = await composed.checkReadiness();
    expect(readiness.ready).toBe(true);
    expect(composed.options.settlementPort).toBe(settlementAdapter);
    expect(composed.options.authorizationPort).toBe(authorizationAdapter);
    expect(composed.options.recoveryService).toBeInstanceOf(RecoveryService);
  });

  it('IntentLedgerLocalRecoveryStatePort produces valid snapshot from IntentLedger', async () => {
    const mockIntent: IntentResponse = {
      ...sampleRequest,
      payload_fingerprint: requestFingerprint,
      state: 'UNKNOWN',
      version: 2,
      attempts: [
        {
          attempt_id: 'att-p4-1',
          stage: 'UNKNOWN',
          created_at: new Date().toISOString(),
        },
      ],
      evidence: [],
    };

    const mockLedger = {
      getIntent: async (id: string) =>
        id === mockIntent.business_intent_id ? mockIntent : undefined,
    } as unknown as IntentLedger;

    const port = new IntentLedgerLocalRecoveryStatePort(mockLedger, recoveryLocalState);
    const snapshot = await port.read('intent-p4-1');

    expect(snapshot.schemaVersion).toBe('local-recovery-snapshot-v1');
    expect(snapshot.binding.businessIntentId).toBe('intent-p4-1');
    expect(snapshot.binding.recipient).toBe(sampleRequest.recipient);
    expect(snapshot.durable.state).toBe('UNKNOWN');
    expect(snapshot.durable.stateVersion).toBe('2');
    expect(snapshot.durable.attemptCount).toBe(1);
    expect(snapshot.indexRequest.correlation).toEqual({
      strategy: 'TRANSFER_TUPLE_WINDOW',
      sender: realSender,
      fromBlock: '999000',
      toBlock: '999200',
    });
    expect(snapshot.mcpPolicy).toEqual(recoveryLocalState.mcpPolicy);
  });

  it('rejects placeholder recovery lookup identity before an MCP call', async () => {
    const mockLedger = {
      getIntent: async () => ({
        ...sampleRequest,
        payload_fingerprint: requestFingerprint,
        state: 'UNKNOWN',
        version: 2,
        attempts: [],
        evidence: [],
      }),
    } as unknown as IntentLedger;
    const port = new IntentLedgerLocalRecoveryStatePort(mockLedger, {
      ...recoveryLocalState,
      mcpPolicy: { ...recoveryLocalState.mcpPolicy, deploymentId: 'oneshot-arc-testnet' },
    });

    await expect(port.read('intent-p4-1')).rejects.toThrow(
      'Invalid Subgraph MCP recovery lookup input',
    );
  });

  it('IntentLedgerRecoveryCommandStore enforces durable deduplication, real CAS transitions, and fails closed', async () => {
    let currentState: 'UNKNOWN' | 'COMMITTED' | 'FAILED_SAFE' = 'UNKNOWN';
    let currentVersion = 2;
    const evidenceAppended: EvidenceView[] = [];
    const persistedEvents = new Map<string, unknown>();

    const mockIntent: IntentResponse = {
      ...sampleRequest,
      payload_fingerprint: requestFingerprint,
      get state() {
        return currentState;
      },
      get version() {
        return currentVersion;
      },
      attempts: [
        {
          attempt_id: 'att-p4-1',
          stage: 'UNKNOWN',
          created_at: new Date().toISOString(),
        },
      ],
      evidence: [],
    };

    const mockLedger = {
      getIntent: async () => mockIntent,
      appendEvidence: async (_id: string, ev: EvidenceView) => {
        evidenceAppended.push(ev);
      },
      completeSubmission: async (
        _id: string,
        _att: string,
        res: SettlementResult,
      ): Promise<CompleteSubmissionResult> => {
        if (currentState !== 'UNKNOWN' && currentState !== 'SUBMITTING') {
          return { completed: false, reason: 'INVALID_STATE', currentState };
        }
        currentVersion += 1;
        if (res.kind === 'CONFIRMED') {
          currentState = 'COMMITTED';
          return { completed: true, state: 'COMMITTED', version: currentVersion };
        }
        if (res.kind === 'DEFINITELY_NOT_SUBMITTED') {
          currentState = 'FAILED_SAFE';
          return { completed: true, state: 'FAILED_SAFE', version: currentVersion };
        }
        return { completed: true, state: 'UNKNOWN', version: currentVersion };
      },
      recordRecoveryEvent: async (_id: string, eventId: string, payload: unknown) => {
        if (persistedEvents.has(eventId)) {
          return { inserted: false };
        }
        persistedEvents.set(eventId, payload);
        return { inserted: true };
      },
      getRecoveryEventPayload: async (eventId: string) => persistedEvents.get(eventId),
    } as unknown as IntentLedger;

    const store = new IntentLedgerRecoveryCommandStore(mockLedger);

    const pack = {
      schemaVersion: 'recovery-command-pack-v1' as const,
      packId: 'pack-p4-1',
      eventId: 'evt-reconcile-p4-1',
      businessIntentId: 'intent-p4-1',
      sourceStateVersion: '2',
      generatedAt: new Date().toISOString(),
      appendCommands: [
        {
          schemaVersion: 'append-recovery-record-v1' as const,
          commandId: 'cmd-p4-1',
          operation: 'APPEND_RECOVERY_RECORD' as const,
          businessIntentId: 'intent-p4-1',
          expectedStateVersion: '2',
          record: {
            schemaVersion: 'recovery-record-v1' as const,
            recordType: 'OBSERVATION' as const,
            id: 'rec-1',
            source: 'ARC' as const,
            authorityClass: 'AUTHORITATIVE_CHAIN_EVIDENCE' as const,
            binding: {
              businessIntentId: 'intent-p4-1',
              requestFingerprint,
              network: 'eip155:5042002',
              tokenContract: '0x0000000000000000000000000000000000000000',
              recipient: sampleRequest.recipient,
              amountAtomic: '1000000',
            },
            blockNumber: '999123',
            retrievedAt: new Date().toISOString(),
            digest: 'digest-1',
          },
        },
      ],
      reconciliationCommand: {
        schemaVersion: 'reconciliation-command-v1' as const,
        commandType: 'MARK_COMMITTED' as const,
        businessIntentId: 'intent-p4-1',
        requestFingerprint,
        targetState: 'COMMITTED' as const,
        reason: 'Arc proof verified',
        evidenceReferences: ['arc:0x' + 'e'.repeat(64)],
        disposition: 'MARK_COMMITTED',
        advisoryAction: 'RETURN_EXISTING_RESULT' as const,
        authoritativeProofPresent: true,
        issuedAt: new Date().toISOString(),
        settlementPermission: 'NEVER' as const,
      },
      recoveryView: {} as DetailedRecoveryView,
      externalSubmissionCount: 0 as const,
    };

    // First append succeeds and transitions UNKNOWN -> COMMITTED
    const res1 = await store.append(pack);
    expect(res1.status).toBe('APPENDED');
    expect(evidenceAppended).toHaveLength(1);
    expect(currentState).toBe('COMMITTED');
    expect(currentVersion).toBe(3);

    // Second append with same eventId deduplicates durably
    const res2 = await store.append(pack);
    expect(res2.status).toBe('DUPLICATE');

    // Fail closed: missing arc reference in MARK_COMMITTED throws
    const missingArcPack = {
      ...pack,
      eventId: 'evt-missing-arc',
      sourceStateVersion: '3',
      reconciliationCommand: {
        ...pack.reconciliationCommand,
        evidenceReferences: [],
      },
    };
    await expect(store.append(missingArcPack)).rejects.toThrow(
      'authoritative Arc transaction reference',
    );

    // Fail closed: state version mismatch throws and does NOT record/wedge the event
    const stalePack = {
      ...pack,
      eventId: 'evt-stale',
      sourceStateVersion: '99',
    };
    await expect(store.append(stalePack)).rejects.toThrow('State version mismatch');
    expect(await store.findByEventId('evt-stale')).toBeNull();
  });

  it('PrivyArcEvidenceBridge derives verified proof envelope from real receipt and avoids fabricated data', async () => {
    const mockEvidencePort = {
      lookup: async () => 'FINAL_SUCCESS' as const,
    };

    const bridge = new PrivyArcEvidenceBridge({
      evidencePort: mockEvidencePort as unknown as LaneBEvidencePort,
      receiptSource: {
        getReceipt: async () => realReceipt,
      },
      defaultArcTxHash: realTxHash,
    });

    const binding = {
      businessIntentId: 'intent-p4-1',
      requestFingerprint,
      network: 'eip155:5042002',
      tokenContract: '0x3333333333333333333333333333333333333333',
      recipient: sampleRequest.recipient,
      amountAtomic: '1000000',
    };

    const evidence = await bridge.read(binding);
    expect(evidence.schemaVersion).toBe('recovery-evidence-v1');
    expect(evidence.binding.businessIntentId).toBe('intent-p4-1');
    expect(evidence.local.submissionReference).toBe('sub-intent-p4-1');
    expect(evidence.privy?.requestStatus).toBe('SUCCEEDED');
    expect(evidence.arc?.receiptStatus).toBe('SUCCESS');
    expect(evidence.arc?.submissionReference).toBe('sub-intent-p4-1'); // Must match local
    expect(evidence.arc?.finality).toBe('FINAL');
    expect(evidence.arc?.blockNumber).toBe('999123');
    expect(evidence.arc?.blockHash).toBe(realBlockHash);
    expect(evidence.arc?.transfer?.sender).toBe(realSender);
    expect(evidence.arc?.transfer?.amountAtomic).toBe('1000000');

    // Without receipt source or verified tx, arc evidence is null (not fabricated)
    const emptyBridge = new PrivyArcEvidenceBridge();
    const emptyEvidence = await emptyBridge.read(binding);
    expect(emptyEvidence.arc).toBeNull();
  });

  it('PrivyArcEvidenceBridge integrated with RecoveryService converges UNKNOWN intent to COMMITTED without UNBOUND_EVIDENCE contradiction', async () => {
    let ledgerState: IntentResponse['state'] = 'UNKNOWN';
    let ledgerVersion = 2;

    const mockIntent: IntentResponse = {
      ...sampleRequest,
      payload_fingerprint: requestFingerprint,
      get state() {
        return ledgerState;
      },
      get version() {
        return ledgerVersion;
      },
      attempts: [
        {
          attempt_id: 'att-p4-1',
          stage: 'UNKNOWN',
          created_at: new Date().toISOString(),
        },
      ],
      evidence: [],
    };

    const mockLedger = {
      getIntent: async () => mockIntent,
      appendEvidence: async () => {},
      completeSubmission: async (
        _id: string,
        _att: string,
        res: SettlementResult,
      ): Promise<CompleteSubmissionResult> => {
        if (ledgerState !== 'UNKNOWN' && ledgerState !== 'SUBMITTING') {
          return { completed: false, reason: 'INVALID_STATE', currentState: ledgerState };
        }
        ledgerVersion += 1;
        ledgerState = res.kind === 'CONFIRMED' ? 'COMMITTED' : 'FAILED_SAFE';
        return { completed: true, state: ledgerState, version: ledgerVersion };
      },
    } as unknown as IntentLedger;

    const mockEvidencePort = {
      lookup: async () => 'FINAL_SUCCESS' as const,
    };

    const recoveryService = createProductionRecoveryService(mockLedger, {
      localState: recoveryLocalState,
      bridge: {
        evidencePort: mockEvidencePort as unknown as LaneBEvidencePort,
        receiptSource: {
          getReceipt: async () => realReceipt,
        },
        defaultArcTxHash: realTxHash,
      },
    });

    const job = {
      schemaVersion: 'recovery-job-v1' as const,
      eventId: 'reconcile:intent-p4-1:2',
      businessIntentId: 'intent-p4-1',
      requestedAt: new Date().toISOString(),
    };

    const result = await recoveryService.handle(job);
    expect(result.status).toBe('PROCESSED');
    expect(result.pack?.reconciliationCommand.commandType).toBe('MARK_COMMITTED');
    expect(result.pack?.reconciliationCommand.targetState).toBe('COMMITTED');
    expect(result.externalSubmissionCount).toBe(0);
    expect(ledgerState).toBe('COMMITTED');
    expect(ledgerVersion).toBe(3);
  });

  it('executeReconcileIntent handles UNKNOWN intent through RecoveryService with zero submissions', async () => {
    let completedWith: SettlementResult | null = null;
    let ledgerState: IntentResponse['state'] = 'UNKNOWN';

    const mockIntent: IntentResponse = {
      ...sampleRequest,
      payload_fingerprint: requestFingerprint,
      get state() {
        return ledgerState;
      },
      version: 7,
      attempts: [
        {
          attempt_id: 'att-p4-1',
          stage: 'UNKNOWN',
          created_at: new Date().toISOString(),
        },
      ],
      evidence: [],
    };

    const mockLedger = {
      getIntent: async () => mockIntent,
      appendEvidence: async () => {},
      completeSubmission: async (
        _id: string,
        _att: string,
        res: SettlementResult,
      ): Promise<CompleteSubmissionResult> => {
        completedWith = res;
        ledgerState = res.kind === 'CONFIRMED' ? 'COMMITTED' : 'FAILED_SAFE';
        return { completed: true, state: ledgerState, version: 8 };
      },
    } as unknown as IntentLedger;

    const commandStore = new IntentLedgerRecoveryCommandStore(mockLedger);
    const composition = createRecoverySimulatorComposition({
      businessIntentId: mockIntent.business_intent_id,
      commandStore,
    });

    const mockPool = {} as unknown as Pool;
    const worker = composeWorker(mockPool, mockLedger, {
      profile: 'simulator',
      recoveryService: composition.service,
    });

    await executeReconcileIntent(
      mockIntent.business_intent_id,
      worker.options,
      composition.job.eventId,
    );

    expect(completedWith).not.toBeNull();
    expect(completedWith?.kind).toBe('CONFIRMED');
    expect(ledgerState).toBe('COMMITTED');
    const stored = await commandStore.findByEventId(composition.job.eventId);
    expect(stored).not.toBeNull();
    expect(stored?.externalSubmissionCount).toBe(0);
  });
});
