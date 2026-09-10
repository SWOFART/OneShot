import {
  asBlockNumber,
  asProviderReferenceId,
  asTransactionHash,
  type EvidenceView,
  type IntentState,
} from '@oneshot/contracts';
import type { IntentLedger } from '@oneshot/storage-postgres';
import {
  APPEND_RECOVERY_RECORD_VERSION,
  isValidSubgraphLookupInput,
  LOCAL_RECOVERY_SNAPSHOT_VERSION,
  RECOVERY_EVIDENCE_VERSION,
  type EvidenceBinding,
  type IndexLookupRequest,
  type IndexedCandidate,
  type KnownIdentityEvidencePort,
  type KnownIdentityRecoveryEvidence,
  type LocalRecoverySnapshot,
  type LocalRecoveryStatePort,
  type RecoveryCommandPack,
  type RecoveryCommandStorePort,
  type RecoveryCommandStoreResult,
  type SubgraphMcpPolicy,
} from '@oneshot/reconciliation';
import {
  TRANSFER_EVENT_TOPIC,
  verifyReceipt,
  type EvidenceResult,
  type ReceiptSource,
  type TransactionReceipt,
} from '@oneshot/arc-adapter';
import type { EvidencePort as LaneBEvidencePort } from '@oneshot/privy-adapter';
import { createHash } from 'node:crypto';

function sha256Hex(value: string): string {
  return createHash('sha256').update(value).digest('hex');
}

function mapState(state: IntentState): 'SUBMITTING' | 'UNKNOWN' | 'COMMITTED' | 'FAILED_SAFE' {
  switch (state) {
    case 'COMMITTED':
    case 'FAILED_SAFE':
    case 'SUBMITTING':
      return state;
    case 'READY':
    case 'AUTHORIZING':
    case 'REJECTED':
    case 'UNKNOWN':
    default:
      return 'UNKNOWN';
  }
}

function toContractAuthorityClass(authClass: string): 'AUTHORITATIVE' | 'OBSERVATION' | 'ADVISORY' {
  if (authClass.startsWith('AUTHORITATIVE')) return 'AUTHORITATIVE';
  if (authClass.includes('OBSERVATION') || authClass.includes('DISCOVERY')) return 'OBSERVATION';
  return 'ADVISORY';
}

export interface IntentLedgerLocalRecoveryStatePortOptions {
  readonly tokenContract: string;
  readonly correlationSender: string;
  readonly fromBlock: string;
  readonly toBlock: string;
  readonly mcpPolicy: SubgraphMcpPolicy;
}

/**
 * Reads local intent state from IntentLedger and constructs LocalRecoverySnapshot for RecoveryService.
 */
export class IntentLedgerLocalRecoveryStatePort implements LocalRecoveryStatePort {
  constructor(
    private readonly ledger: IntentLedger,
    private readonly options: IntentLedgerLocalRecoveryStatePortOptions,
  ) {}

  async read(businessIntentId: string): Promise<LocalRecoverySnapshot> {
    const intent = await this.ledger.getIntent(businessIntentId);
    if (!intent) {
      throw new Error(`Intent not found: ${businessIntentId}`);
    }

    const binding: EvidenceBinding = {
      businessIntentId: intent.business_intent_id,
      requestFingerprint: intent.payload_fingerprint,
      network: intent.network,
      tokenContract: this.options.tokenContract,
      recipient: intent.recipient,
      amountAtomic: intent.amount_atomic,
    };

    const durableState = mapState(intent.state);
    const nowIso = new Date().toISOString();

    const indexRequest: IndexLookupRequest = {
      binding,
      correlation: {
        strategy: 'TRANSFER_TUPLE_WINDOW',
        sender: this.options.correlationSender,
        fromBlock: this.options.fromBlock,
        toBlock: this.options.toBlock,
      },
    };

    if (!isValidSubgraphLookupInput(indexRequest, this.options.mcpPolicy)) {
      throw new Error('Invalid Subgraph MCP recovery lookup input');
    }

    const providerIdentity =
      typeof this.ledger.getProviderRequestIdentity === 'function'
        ? await this.ledger.getProviderRequestIdentity(businessIntentId)
        : null;

    return {
      schemaVersion: LOCAL_RECOVERY_SNAPSHOT_VERSION,
      binding,
      ...(providerIdentity
        ? {
            providerIdentity: {
              referenceId: providerIdentity.referenceId,
              requestFingerprint: providerIdentity.requestFingerprint,
              ...(providerIdentity.walletId ? { walletId: providerIdentity.walletId } : {}),
              ...(providerIdentity.policyId ? { policyId: providerIdentity.policyId } : {}),
            },
          }
        : {}),
      durable: {
        state: durableState,
        stateVersion: String(intent.version),
        attemptCount: intent.attempts?.length ?? 0,
        persistedAt: nowIso,
      },
      indexRequest,
      mcpPolicy: this.options.mcpPolicy,
      capturedAt: nowIso,
    };
  }
}

interface DurableLedgerExtension {
  recordRecoveryEvent?: (
    businessIntentId: string,
    eventId: string,
    payload: unknown,
  ) => Promise<{ readonly inserted: boolean }>;
  getRecoveryEventPayload?: (eventId: string) => Promise<unknown | undefined>;
}

/**
 * Append-only RecoveryCommandStorePort backed by IntentLedger with atomic durable event-ID dedupe and state CAS.
 */
export class IntentLedgerRecoveryCommandStore implements RecoveryCommandStorePort {
  readonly #packsByEventId = new Map<string, RecoveryCommandPack>();

  constructor(private readonly ledger: IntentLedger) {}

  async findByEventId(eventId: string): Promise<RecoveryCommandPack | null> {
    const ext = this.ledger as unknown as DurableLedgerExtension;
    if (typeof ext.getRecoveryEventPayload === 'function') {
      const persisted = await ext.getRecoveryEventPayload(eventId);
      if (persisted) {
        return persisted as RecoveryCommandPack;
      }
    }
    return this.#packsByEventId.get(eventId) ?? null;
  }

  async append(pack: RecoveryCommandPack): Promise<RecoveryCommandStoreResult> {
    // 1. Check if this exact event was already applied and persisted
    const existing = await this.findByEventId(pack.eventId);
    if (existing) {
      return { status: 'DUPLICATE', pack: existing };
    }

    // 2. Fetch current ledger intent
    const intent = await this.ledger.getIntent(pack.businessIntentId);
    if (!intent) {
      throw new Error(`Intent ${pack.businessIntentId} not found during recovery command append`);
    }

    // 3. Fail-closed expectedStateVersion CAS verification BEFORE recording deduplication
    // This prevents stale/failing packs from wedging the eventId as duplicate
    if (String(intent.version) !== pack.sourceStateVersion) {
      throw new Error(
        `State version mismatch for ${pack.businessIntentId}: expected ${pack.sourceStateVersion}, current is ${intent.version}`,
      );
    }

    if (!intent.attempts || intent.attempts.length === 0) {
      throw new Error(
        `Cannot apply recovery commands for intent ${pack.businessIntentId}: no attempts recorded`,
      );
    }

    const latestAttempt = intent.attempts[intent.attempts.length - 1];
    if (!latestAttempt) {
      throw new Error(
        `Cannot apply recovery commands for intent ${pack.businessIntentId}: latest attempt missing`,
      );
    }
    const attemptId = latestAttempt.attempt_id;

    // 4. Append observation evidence
    for (const cmd of pack.appendCommands) {
      if (cmd.schemaVersion !== APPEND_RECOVERY_RECORD_VERSION) {
        throw new Error(`Invalid command schema version: ${cmd.schemaVersion}`);
      }
      if (cmd.record.recordType === 'OBSERVATION') {
        const evidenceView: EvidenceView = {
          source: cmd.record.source,
          authority_class: toContractAuthorityClass(cmd.record.authorityClass),
          retrieved_at: cmd.record.retrievedAt,
          digest: cmd.record.digest,
          ...(cmd.record.blockNumber ? { block_number: cmd.record.blockNumber } : {}),
          ...(cmd.record.freshness ? { freshness: cmd.record.freshness } : {}),
        };
        await this.ledger.appendEvidence(pack.businessIntentId, evidenceView);
      }
    }

    // 5. Apply disposition transition on the ledger
    const disposition = pack.reconciliationCommand.commandType;

    if (disposition === 'MARK_COMMITTED') {
      const arcRef = pack.reconciliationCommand.evidenceReferences.find((ref) =>
        ref.startsWith('arc:'),
      );
      if (!arcRef) {
        throw new Error(
          `Cannot apply MARK_COMMITTED without an authoritative Arc transaction reference (intent: ${pack.businessIntentId})`,
        );
      }
      const rawTx = arcRef.slice(4);
      if (!/^0x[0-9a-fA-F]{64}$/.test(rawTx)) {
        throw new Error(`Invalid Arc transaction hash format in evidence reference: ${rawTx}`);
      }
      const txHash = asTransactionHash(rawTx);

      const arcObs = pack.appendCommands.find(
        (cmd) =>
          cmd.record.recordType === 'OBSERVATION' &&
          cmd.record.source === 'ARC' &&
          cmd.record.authorityClass === 'AUTHORITATIVE_CHAIN_EVIDENCE',
      );
      if (!arcObs || !arcObs.record.blockNumber) {
        throw new Error(
          `Cannot apply MARK_COMMITTED without an authoritative block number from Arc evidence (intent: ${pack.businessIntentId})`,
        );
      }
      const blockNumber = asBlockNumber(arcObs.record.blockNumber);

      const privyRef = pack.reconciliationCommand.evidenceReferences.find((ref) =>
        ref.startsWith('privy:'),
      );
      if (!privyRef) {
        throw new Error(
          `Cannot apply MARK_COMMITTED without the durable provider request identity (intent: ${pack.businessIntentId})`,
        );
      }
      const providerRef = privyRef.slice(6);

      const completion = await this.ledger.completeSubmission(pack.businessIntentId, attemptId, {
        kind: 'CONFIRMED',
        provider_reference_id: asProviderReferenceId(providerRef),
        transaction_hash: txHash,
        block_number: blockNumber,
        transfer_log_index: 0,
      });

      if (!completion.completed) {
        throw new Error(
          `Ledger transition to COMMITTED failed: ${completion.reason} (state: ${completion.currentState})`,
        );
      }
    } else if (disposition === 'MARK_FAILED_SAFE') {
      const completion = await this.ledger.completeSubmission(pack.businessIntentId, attemptId, {
        kind: 'DEFINITELY_NOT_SUBMITTED',
        reason: pack.reconciliationCommand.reason,
      });

      if (!completion.completed) {
        throw new Error(
          `Ledger transition to FAILED_SAFE failed: ${completion.reason} (state: ${completion.currentState})`,
        );
      }
    }

    // 6. Persist durable deduplication record only after successful CAS and ledger application
    const ext = this.ledger as unknown as DurableLedgerExtension;
    if (typeof ext.recordRecoveryEvent === 'function') {
      await ext.recordRecoveryEvent(pack.businessIntentId, pack.eventId, pack);
    }

    this.#packsByEventId.set(pack.eventId, pack);
    return { status: 'APPENDED', pack };
  }
}

export interface PrivyArcEvidenceBridgeOptions {
  readonly evidencePort?: LaneBEvidencePort;
  readonly receiptSource?: ReceiptSource;
  readonly walletAddress?: string;
  readonly chainId?: number;
  readonly defaultArcTxHash?: string;
  readonly defaultReceipt?: TransactionReceipt;
  readonly localStatePort?: LocalRecoveryStatePort;
}

/**
 * Bridges Lane B's EvidencePort with the verified proof envelope required by KnownIdentityEvidencePort.
 */
export class PrivyArcEvidenceBridge implements KnownIdentityEvidencePort {
  constructor(private readonly options: PrivyArcEvidenceBridgeOptions = {}) {}

  async verifyCandidate(
    binding: EvidenceBinding,
    candidate: IndexedCandidate,
  ): Promise<KnownIdentityRecoveryEvidence | null> {
    if (!this.options.receiptSource || !this.options.walletAddress) return null;
    if (candidate.network !== binding.network) return null;
    if (candidate.tokenContract.toLowerCase() !== binding.tokenContract.toLowerCase()) return null;
    if (candidate.recipient.toLowerCase() !== binding.recipient.toLowerCase()) return null;
    if (candidate.amountAtomic !== binding.amountAtomic) return null;
    if (candidate.sender.toLowerCase() !== this.options.walletAddress.toLowerCase()) return null;

    const receipt = await this.options.receiptSource.getReceipt(candidate.transactionHash);
    if (!receipt) return null;
    if (receipt.transactionHash.toLowerCase() !== candidate.transactionHash.toLowerCase()) {
      return null;
    }
    if (receipt.blockNumber.toString() !== candidate.blockNumber) return null;
    if (receipt.blockHash.toLowerCase() !== candidate.blockHash.toLowerCase()) return null;

    const verdict = verifyReceipt(receipt, {
      chainId: this.options.chainId ?? 5042002,
      walletAddress: this.options.walletAddress,
      tokenContract: binding.tokenContract,
      recipient: binding.recipient,
      amountAtomic: BigInt(binding.amountAtomic),
    });
    if (verdict.result !== 'CONFIRMED') return null;
    if (String(verdict.transferLogIndex) !== candidate.logIndex) return null;

    const transferLog = receipt.logs.find((log) => log.logIndex === verdict.transferLogIndex);
    const fromTopic = transferLog?.topics[1];
    const toTopic = transferLog?.topics[2];
    if (!transferLog || !fromTopic || !toTopic) return null;

    const nowIso = new Date().toISOString();
    const base = await this.read(binding);
    const transfer = {
      tokenContract: transferLog.address,
      sender: `0x${fromTopic.slice(-40)}`.toLowerCase(),
      recipient: `0x${toTopic.slice(-40)}`.toLowerCase(),
      amountAtomic: BigInt(transferLog.data).toString(),
      logIndex: String(verdict.transferLogIndex),
    };
    const arc = {
      authority: 'AUTHORITATIVE_CHAIN_EVIDENCE' as const,
      network: binding.network,
      transactionHash: receipt.transactionHash,
      submissionReference: base.local.submissionReference,
      receiptStatus: 'SUCCESS' as const,
      finality: 'FINAL' as const,
      blockNumber: receipt.blockNumber.toString(),
      blockHash: receipt.blockHash,
      blockTimestamp: nowIso,
      transfer,
      retrievedAt: nowIso,
      digest: sha256Hex(
        JSON.stringify({
          transactionHash: receipt.transactionHash,
          blockNumber: receipt.blockNumber.toString(),
          blockHash: receipt.blockHash,
          sender: receipt.from,
          status: receipt.status,
          transfer,
        }),
      ),
    };

    return { ...base, arc };
  }

  async read(binding: EvidenceBinding): Promise<KnownIdentityRecoveryEvidence> {
    const nowIso = new Date().toISOString();
    const txHash = this.options.defaultArcTxHash ?? null;
    const submissionReference = `sub-${binding.businessIntentId}`;

    let laneBResult: EvidenceResult = 'UNAVAILABLE';
    let lookupError: string | undefined;

    if (this.options.evidencePort) {
      try {
        laneBResult = await this.options.evidencePort.lookup({
          businessIntentId: binding.businessIntentId,
          transactionHash: txHash ?? undefined,
          chainId: 5042002,
          tokenContract: binding.tokenContract,
          recipient: binding.recipient,
          amountAtomic: BigInt(binding.amountAtomic),
        });
      } catch (err) {
        lookupError = err instanceof Error ? err.message : 'Evidence lookup failed';
        laneBResult = 'UNAVAILABLE';
      }
    }

    let realReceipt: TransactionReceipt | null = this.options.defaultReceipt ?? null;
    if (!realReceipt && this.options.receiptSource && txHash) {
      try {
        realReceipt = await this.options.receiptSource.getReceipt(txHash);
      } catch (err) {
        lookupError = lookupError ?? (err instanceof Error ? err.message : 'Receipt lookup failed');
      }
    }

    const isSuccess = laneBResult === 'FINAL_SUCCESS';
    const isRevert = laneBResult === 'FINAL_REVERT';

    const privyStatus: 'SUCCEEDED' | 'FAILED' | 'PENDING' | 'NOT_FOUND' | 'UNAVAILABLE' = isSuccess
      ? 'SUCCEEDED'
      : isRevert
        ? 'FAILED'
        : laneBResult === 'PENDING'
          ? 'PENDING'
          : laneBResult === 'NOT_FOUND'
            ? 'NOT_FOUND'
            : 'UNAVAILABLE';

    // Retrieve local state from port if available to match actual stateVersion
    let localStateVersion = '1';
    let localSettlementState: 'SUBMITTING' | 'UNKNOWN' | 'COMMITTED' | 'FAILED_SAFE' = 'UNKNOWN';
    let providerReferenceId = `oneshot-${binding.businessIntentId}`;
    if (this.options.localStatePort) {
      try {
        const snapshot = await this.options.localStatePort.read(binding.businessIntentId);
        localStateVersion = snapshot.durable.stateVersion;
        localSettlementState = snapshot.durable.state;
        providerReferenceId = snapshot.providerIdentity?.referenceId ?? providerReferenceId;
      } catch {
        // Fall back to default
      }
    }

    const localDigest = sha256Hex(
      JSON.stringify({
        businessIntentId: binding.businessIntentId,
        requestFingerprint: binding.requestFingerprint,
        state: localSettlementState,
        version: localStateVersion,
      }),
    );

    const privyDigest = sha256Hex(
      JSON.stringify({
        businessIntentId: binding.businessIntentId,
        status: privyStatus,
        transactionHash: txHash,
        error: lookupError ?? null,
      }),
    );

    let arcEvidence: KnownIdentityRecoveryEvidence['arc'] = null;

    if (realReceipt) {
      const receiptStatus = realReceipt.status === 1 ? 'SUCCESS' : 'REVERT';

      // Parse and decode Transfer log: Transfer(address from, address to, uint256 value)
      let transfer: {
        tokenContract: string;
        sender: string;
        recipient: string;
        amountAtomic: string;
        logIndex: string;
      } | null = null;

      if (receiptStatus === 'SUCCESS') {
        for (const log of realReceipt.logs) {
          if (
            log.topics[0]?.toLowerCase() === TRANSFER_EVENT_TOPIC.toLowerCase() &&
            log.topics.length >= 3
          ) {
            const topic2 = log.topics[2];
            const decodedTo = topic2 ? `0x${topic2.slice(-40)}`.toLowerCase() : '';
            let decodedAmount: string;
            try {
              decodedAmount = BigInt(log.data).toString();
            } catch {
              decodedAmount = '';
            }

            if (
              decodedTo === binding.recipient.toLowerCase() &&
              decodedAmount === binding.amountAtomic
            ) {
              transfer = {
                tokenContract: log.address,
                sender: realReceipt.from,
                recipient: binding.recipient,
                amountAtomic: binding.amountAtomic,
                logIndex: String(log.logIndex),
              };
              break;
            }
          }
        }
      }

      arcEvidence = {
        authority: 'AUTHORITATIVE_CHAIN_EVIDENCE',
        network: binding.network,
        transactionHash: realReceipt.transactionHash,
        submissionReference, // MUST MATCH local.submissionReference to prevent UNBOUND_EVIDENCE contradiction
        receiptStatus,
        finality: 'FINAL',
        blockNumber: realReceipt.blockNumber.toString(),
        blockHash: realReceipt.blockHash,
        blockTimestamp: nowIso,
        transfer,
        retrievedAt: nowIso,
        digest: sha256Hex(
          JSON.stringify({
            transactionHash: realReceipt.transactionHash,
            blockNumber: realReceipt.blockNumber.toString(),
            blockHash: realReceipt.blockHash,
            sender: realReceipt.from,
            status: realReceipt.status,
            transfer,
          }),
        ),
      };
    }

    return {
      schemaVersion: RECOVERY_EVIDENCE_VERSION,
      binding,
      local: {
        authority: 'AUTHORITATIVE_ONESHOT',
        stateVersion: localStateVersion,
        submissionReference, // Exactly identical to arc.submissionReference
        settlementState: localSettlementState,
        persistedAt: nowIso,
        digest: localDigest,
      },
      privy: {
        authority: 'PROVIDER_OBSERVATION',
        referenceId: providerReferenceId,
        requestFingerprint: binding.requestFingerprint,
        requestStatus: privyStatus,
        transactionHash: txHash,
        retrievedAt: nowIso,
        digest: privyDigest,
      },
      arc: arcEvidence,
    };
  }
}
