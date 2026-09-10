import {
  asBlockNumber,
  asProviderReferenceId,
  asTransactionHash,
  type AuthorizationResult,
  type CreateIntentRequest,
  type SettlementResult,
} from '@oneshot/contracts';
import type { IntentLedger } from '@oneshot/storage-postgres';
import type { Pool } from 'pg';
import type {
  AuthorizationPort,
  SettlementContext,
  SettlementPort,
  WorkerOptions,
} from './types.js';
import {
  RecoveryService,
  UnavailableRecoveryAdvisorPort,
  type RecoveryAdvisorPort,
  type SubgraphMcpRecoveryPort,
} from '@oneshot/reconciliation';
import {
  IntentLedgerLocalRecoveryStatePort,
  IntentLedgerRecoveryCommandStore,
  PrivyArcEvidenceBridge,
  type IntentLedgerLocalRecoveryStatePortOptions,
  type PrivyArcEvidenceBridgeOptions,
} from './recovery-bridge.js';

export const CURRENT_CONTRACT_VERSION = '1.0.0';
export const SUPPORTED_NETWORK = 'eip155:5042002';

export interface ProductionRecoveryServiceOptions {
  readonly localState: IntentLedgerLocalRecoveryStatePortOptions;
  readonly bridge?: PrivyArcEvidenceBridgeOptions;
  /** Production recovery must be admitted through an explicit MCP transport. */
  readonly subgraphMcp: SubgraphMcpRecoveryPort;
  readonly advisor?: RecoveryAdvisorPort;
}

export function createProductionRecoveryService(
  ledger: IntentLedger,
  options: ProductionRecoveryServiceOptions,
): RecoveryService {
  if (!options.subgraphMcp) {
    throw new Error('Production recovery requires an explicit subgraphMcp port');
  }
  const localState = new IntentLedgerLocalRecoveryStatePort(ledger, options.localState);
  const commandStore = new IntentLedgerRecoveryCommandStore(ledger);
  const knownIdentityEvidence = new PrivyArcEvidenceBridge({
    localStatePort: localState,
    ...options.bridge,
  });
  const recoveryAdvisor = options.advisor ?? new UnavailableRecoveryAdvisorPort();
  return new RecoveryService({
    localState,
    knownIdentityEvidence,
    candidateEvidence: knownIdentityEvidence,
    subgraphMcp: options.subgraphMcp,
    advisor: recoveryAdvisor,
    commandStore,
  });
}

export class SimulatorSettlementPort implements SettlementPort {
  readonly name = 'SimulatorSettlementPort';
  readonly contractVersion = CURRENT_CONTRACT_VERSION;
  #callCount = 0;

  get callCount(): number {
    return this.#callCount;
  }

  async submit(
    request: CreateIntentRequest,
    context: SettlementContext,
  ): Promise<SettlementResult> {
    this.#callCount += 1;
    if (request.recipient === '0x0000000000000000000000000000000000000000') {
      return {
        kind: 'DEFINITELY_NOT_SUBMITTED',
        reason: 'Zero address recipient is rejected by settlement policy',
      };
    }
    return {
      kind: 'CONFIRMED',
      provider_reference_id: asProviderReferenceId(`sim-ref-${context.attemptId}`),
      transaction_hash: asTransactionHash(`0x${'e'.repeat(64)}`),
      block_number: asBlockNumber('123456'),
      transfer_log_index: 0,
    };
  }
}

export class SimulatorAuthorizationPort implements AuthorizationPort {
  readonly name = 'SimulatorAuthorizationPort';
  readonly contractVersion = CURRENT_CONTRACT_VERSION;

  async authorize(request: CreateIntentRequest): Promise<AuthorizationResult> {
    if (request.recipient === '0x0000000000000000000000000000000000000000') {
      return {
        kind: 'DENIED',
        reason: 'Recipient denied by sponsor authorization policy',
      };
    }
    return { kind: 'AUTHORIZED' };
  }
}

export interface CompositionOptions {
  readonly profile: 'simulator' | 'production';
  readonly settlementPort?: SettlementPort & {
    readonly contractVersion?: string;
    readonly network?: string;
  };
  readonly authorizationPort?: AuthorizationPort & {
    readonly contractVersion?: string;
  };
  readonly recoveryService?: RecoveryService;
  readonly recovery?: ProductionRecoveryServiceOptions;
  readonly submissionsDisabled?: boolean;
  readonly expectedContractVersion?: string;
  readonly expectedNetwork?: string;
}

export interface ComposedWorker {
  readonly options: WorkerOptions;
  readonly checkReadiness: () => Promise<{ readonly ready: boolean; readonly reason?: string }>;
}

export function composeWorker(
  pool: Pool,
  ledger: IntentLedger,
  options: CompositionOptions,
): ComposedWorker {
  const expectedContractVersion = options.expectedContractVersion ?? CURRENT_CONTRACT_VERSION;
  const expectedNetwork = options.expectedNetwork ?? SUPPORTED_NETWORK;

  let settlementPort: SettlementPort;
  let authorizationPort: AuthorizationPort | undefined;

  if (options.profile === 'simulator') {
    settlementPort = options.settlementPort ?? new SimulatorSettlementPort();
    authorizationPort = options.authorizationPort ?? new SimulatorAuthorizationPort();
  } else {
    if (!options.settlementPort) {
      throw new Error('Production composition profile requires an injected settlementPort');
    }
    if (!options.authorizationPort) {
      throw new Error('Production composition profile requires an injected authorizationPort');
    }
    if (!options.settlementPort.getSubmissionIdentity) {
      throw new Error(
        'Production composition profile requires settlement provider identity support',
      );
    }
    settlementPort = options.settlementPort;
    authorizationPort = options.authorizationPort;
  }

  let recoveryService = options.recoveryService;
  if (!recoveryService && options.profile === 'production' && options.recovery) {
    recoveryService = createProductionRecoveryService(ledger, options.recovery);
  }
  if (options.profile === 'production' && !recoveryService) {
    throw new Error('Production composition profile requires an injected recoveryService');
  }

  const workerOptions: WorkerOptions = {
    pool,
    ledger,
    settlementPort,
    authorizationPort,
    recoveryService,
    config: {
      submissionsDisabled: options.submissionsDisabled,
      contractVersion: expectedContractVersion,
      network: expectedNetwork,
    },
  };

  const checkReadiness = async (): Promise<{
    readonly ready: boolean;
    readonly reason?: string;
  }> => {
    try {
      await ledger.ping();
    } catch {
      return { ready: false, reason: 'Database ping failed' };
    }

    const adapterVersion = (settlementPort as { readonly contractVersion?: string })
      .contractVersion;
    if (adapterVersion && adapterVersion !== expectedContractVersion) {
      return {
        ready: false,
        reason: `Settlement adapter contract version ${adapterVersion} does not match expected ${expectedContractVersion}`,
      };
    }

    const adapterNetwork = (settlementPort as { readonly network?: string }).network;
    if (adapterNetwork && adapterNetwork !== expectedNetwork) {
      return {
        ready: false,
        reason: `Settlement adapter network ${adapterNetwork} does not match expected ${expectedNetwork}`,
      };
    }

    if (authorizationPort) {
      const authVersion = (authorizationPort as { readonly contractVersion?: string })
        .contractVersion;
      if (authVersion && authVersion !== expectedContractVersion) {
        return {
          ready: false,
          reason: `Authorization adapter contract version ${authVersion} does not match expected ${expectedContractVersion}`,
        };
      }
    }

    if (options.profile === 'production' && !recoveryService) {
      return { ready: false, reason: 'Production recovery service is unavailable' };
    }

    return { ready: true };
  };

  return {
    options: workerOptions,
    checkReadiness,
  };
}
