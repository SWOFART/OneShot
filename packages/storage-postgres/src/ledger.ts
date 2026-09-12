import {
  asAttemptId,
  asAtomicAmount,
  asBusinessIntentId,
  asCorrelationId,
  asEvmAddress,
  asTransactionHash,
  CORE_DISPOSITIONS,
  ContractValidationError,
  RECOVERY_ACTIONS,
  type AttemptView,
  type BusinessIntentId,
  type EvidenceView,
  type IntentResponse,
  type IntentState,
  type PaymentMode,
  type PaidApiResponse,
  type RecoveryView,
  type ReconcileResponse,
  type AuthorizationResult,
  type SettlementResult,
  type SettlementView,
  parseCreatePaidApiRequest,
} from '@oneshot/contracts';
import {
  derivedPaidApiBusinessIntentId,
  fingerprintIntent,
  paidApiFingerprint,
  type SystemMetrics,
} from '@oneshot/domain';
import type { Pool, PoolClient } from 'pg';

export interface LedgerDependencies {
  readonly now: () => Date;
  readonly nextAttemptId: () => string;
}

/**
 * Provider request identity persisted before an external submission begins.
 * The adapter owns the derivation; the ledger owns durability and replay.
 */
export interface ProviderRequestIdentity {
  readonly idempotencyKey: string;
  readonly referenceId: string;
  readonly requestFingerprint: string;
  readonly walletId?: string | undefined;
  readonly policyId?: string | undefined;
  readonly providerKind?: 'DIRECT_ARC' | 'CIRCLE_X402' | undefined;
  readonly transactionHash?: string | undefined;
  readonly providerTransferId?: string | undefined;
}

export interface PaidApiQuoteSnapshot {
  readonly resourceUrl: string;
  readonly x402Version: number;
  readonly maxTimeoutSeconds: number;
  readonly recipient: string;
  readonly amountAtomic: string;
  readonly quotePayload: unknown;
}

export interface PaidApiTarget {
  readonly businessIntentId: string;
  readonly resourceUrl: string;
  readonly method: 'GET';
  readonly quotePayload: unknown;
  readonly paymentMode: PaymentMode;
  readonly payerWallet?: string;
}

export type CreatePaidApiResult =
  | { readonly kind: 'ACCEPTED'; readonly request: PaidApiResponse }
  | { readonly kind: 'REPLAY_IDENTICAL'; readonly request: PaidApiResponse }
  | { readonly kind: 'INTENT_PAYLOAD_CONFLICT'; readonly request: PaidApiResponse };

export type CreateIntentResult =
  | { readonly kind: 'ACCEPTED'; readonly intent: IntentResponse }
  | { readonly kind: 'REPLAY_IDENTICAL'; readonly intent: IntentResponse }
  | { readonly kind: 'INTENT_PAYLOAD_CONFLICT'; readonly intent: IntentResponse };

export type ClaimSubmissionResult =
  | {
      readonly claimed: true;
      readonly intent: IntentResponse;
      readonly attemptId: string;
      readonly correlationId: string;
      readonly version: number;
    }
  | {
      readonly claimed: false;
      readonly reason: 'NOT_FOUND' | 'NOT_READY';
      readonly currentState?: IntentState;
      readonly version?: number;
    };

export type BeginUserWalletSubmissionResult =
  | {
      readonly begun: true;
      readonly intent: IntentResponse;
      readonly attemptId: string;
      readonly transactionHash?: string;
      readonly state: 'SUBMITTING' | 'UNKNOWN';
      readonly version: number;
    }
  | {
      readonly begun: false;
      readonly reason: 'NOT_FOUND' | 'NOT_USER_WALLET' | 'NOT_READY';
      readonly currentState?: IntentState;
      readonly version?: number;
      readonly attemptId?: string;
      readonly transactionHash?: string;
    };

export type CompleteSubmissionResult =
  | {
      readonly completed: true;
      readonly state: 'COMMITTED' | 'FAILED_SAFE' | 'UNKNOWN';
      readonly version: number;
    }
  | {
      readonly completed: false;
      readonly reason: 'NOT_FOUND' | 'INVALID_STATE';
      readonly currentState?: IntentState;
    };

export type CompleteAuthorizationResult =
  | {
      readonly completed: true;
      readonly state: 'READY' | 'REJECTED' | 'AUTHORIZING';
      readonly version: number;
    }
  | {
      readonly completed: false;
      readonly reason: 'NOT_FOUND' | 'INVALID_STATE';
      readonly currentState?: IntentState;
    };

export type ScheduleFailedSafeRetryResult =
  | {
      readonly scheduled: true;
      readonly intent: IntentResponse;
      readonly attemptId: string;
      readonly version: number;
    }
  | {
      readonly scheduled: false;
      readonly reason: 'NOT_FOUND' | 'NOT_FAILED_SAFE';
      readonly currentState?: IntentState;
      readonly version?: number;
    };

interface IntentRow {
  readonly business_intent_id: string;
  readonly payload_fingerprint: string;
  readonly recipient: string;
  readonly amount_atomic: string;
  readonly asset: 'USDC';
  readonly network: 'eip155:5042002';
  readonly purpose: string;
  readonly state: IntentState;
  readonly version: number;
  readonly payment_mode: PaymentMode | null;
}

function object(value: unknown): Record<string, unknown> | null {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

function text(value: unknown, maxLength = 500): string | null {
  return typeof value === 'string' && value.length > 0 && value.length <= maxLength ? value : null;
}

function texts(value: unknown): readonly string[] {
  return Array.isArray(value)
    ? value.flatMap((item) => {
        const parsed = text(item, 128);
        return parsed === null ? [] : [parsed];
      })
    : [];
}

function jsonPayload(value: unknown, name: string, maxBytes = 32_768): string {
  let serialized: string | undefined;
  try {
    serialized = JSON.stringify(value);
  } catch {
    throw new ContractValidationError(`${name} must be JSON serializable`);
  }
  if (!serialized || Buffer.byteLength(serialized, 'utf8') > maxBytes) {
    throw new ContractValidationError(`${name} exceeds the bounded storage limit`);
  }
  return serialized;
}

interface PaidApiRow {
  readonly business_intent_id: string;
  readonly task_key: string;
  readonly tool_id: 'circle-x402-api-v1';
  readonly resource_url: string;
  readonly quote_recipient: string;
  readonly quote_amount_atomic: string;
  readonly quote_x402_version: number;
  readonly quote_max_timeout_seconds: number;
  readonly quote_payload: unknown;
  readonly response_payload: unknown;
  readonly provider_transaction_hash: string | null;
  readonly provider_transfer_id: string | null;
  readonly payment_mode: PaymentMode;
  readonly payer_wallet: string | null;
  readonly created_at: Date;
  readonly updated_at: Date;
  readonly payment_state: IntentState;
  readonly settlement_provider_reference_id: string | null;
  readonly settlement_transaction_hash: string | null;
  readonly settlement_block_number: string | null;
  readonly settlement_transfer_log_index: number | null;
}

function paidApiQuoteForView(row: PaidApiRow): PaidApiResponse['quote'] {
  return {
    supplier_id: 'circle-x402-v1',
    resource_url: row.resource_url,
    recipient: row.quote_recipient,
    amount_atomic: row.quote_amount_atomic,
    asset: 'USDC',
    network: 'eip155:5042002',
    x402_version: row.quote_x402_version,
    max_timeout_seconds: row.quote_max_timeout_seconds,
  };
}

function paidApiView(row: PaidApiRow): PaidApiResponse {
  const settlement =
    row.settlement_provider_reference_id &&
    row.settlement_transaction_hash &&
    row.settlement_block_number &&
    row.settlement_transfer_log_index !== null
      ? {
          provider_reference_id: row.settlement_provider_reference_id,
          transaction_hash: row.settlement_transaction_hash,
          block_number: row.settlement_block_number,
          transfer_log_index: row.settlement_transfer_log_index,
          explorer_url: `https://testnet.arcscan.app/tx/${row.settlement_transaction_hash}`,
        }
      : undefined;
  return {
    business_intent_id: row.business_intent_id,
    task_key: row.task_key,
    tool_id: row.tool_id,
    resource_url: row.resource_url,
    payment_state: row.payment_state,
    ...(row.payment_mode ? { payment_mode: row.payment_mode } : {}),
    ...(row.payer_wallet ? { payer_wallet: row.payer_wallet } : {}),
    quote: paidApiQuoteForView(row),
    ...(row.provider_transaction_hash
      ? { provider_transaction_hash: row.provider_transaction_hash }
      : {}),
    ...(settlement ? { settlement } : {}),
    ...(row.response_payload !== null && row.response_payload !== undefined
      ? { response: row.response_payload }
      : {}),
    created_at: row.created_at.toISOString(),
    updated_at: row.updated_at.toISOString(),
  };
}

function persistedRecovery(payload: unknown): {
  readonly action?: RecoveryView['recommended_action'];
  readonly details: Partial<RecoveryView>;
} {
  const pack = object(payload);
  const view = object(pack?.['recoveryView']);
  const command = object(pack?.['reconciliationCommand']);
  const action = RECOVERY_ACTIONS.find((value) => value === view?.['recommendedAction']);
  const core = CORE_DISPOSITIONS.find((value) => value === view?.['coreDisposition']);
  if (!view || !command || !action || !core) return { details: {} };

  const records = Array.isArray(pack?.['appendCommands'])
    ? pack['appendCommands'].flatMap((entry) => {
        const record = object(object(entry)?.['record']);
        return record === null ? [] : [record];
      })
    : [];
  const agentRecord = records.find(
    (record) => record['recordType'] === 'DECISION' && record['source'] === 'LLM',
  );
  const model = object(object(agentRecord?.['provenance'])?.['modelIdentity']);
  const agentReason = text(agentRecord?.['reason']);
  const modelName = text(model?.['modelName'], 128);
  const modelVersion = text(model?.['modelVersion'], 128);
  const promptVersion = text(model?.['promptVersion'], 128);

  const graphRecord = records.find(
    (record) => record['recordType'] === 'OBSERVATION' && record['source'] === 'THE_GRAPH',
  );
  const graph = object(graphRecord?.['provenance']);
  const candidates = Array.isArray(view['indexedCandidates'])
    ? view['indexedCandidates'].flatMap((value) => {
        const candidate = object(value);
        const candidateId = text(candidate?.['id'], 128);
        const transactionHash = text(candidate?.['transactionHash'], 66);
        const blockNumber = text(candidate?.['blockNumber'], 78);
        const bindingStatus = candidate?.['bindingStatus'];
        const contradictionCodes = texts(candidate?.['contradictionCodes']);
        if (
          !candidateId ||
          !transactionHash?.match(/^0x[0-9a-fA-F]{64}$/u) ||
          !blockNumber?.match(/^(0|[1-9][0-9]*)$/u) ||
          (bindingStatus !== 'MATCH' && bindingStatus !== 'CONTRADICTORY')
        ) {
          return [];
        }
        const normalizedBindingStatus: 'MATCH' | 'CONTRADICTORY' = bindingStatus;
        return [
          {
            candidate_id: candidateId,
            transaction_hash: transactionHash,
            block_number: blockNumber,
            binding_status: normalizedBindingStatus,
            contradiction_codes: contradictionCodes,
          },
        ];
      })
    : [];
  const health =
    view['indexHealth'] === 'FRESH' ||
    view['indexHealth'] === 'LAGGING' ||
    view['indexHealth'] === 'UNHEALTHY' ||
    view['indexHealth'] === 'UNAVAILABLE' ||
    view['indexHealth'] === 'UNKNOWN_FRESHNESS'
      ? view['indexHealth']
      : null;
  const serverName = text(graph?.['serverName'], 128);
  const serverVersion = text(graph?.['serverVersion'], 128);
  const toolName = text(graph?.['toolName'], 128);
  const deploymentId = text(graph?.['deploymentId'], 128);
  const manifestCid = text(graph?.['manifestCid'], 128);
  const endpointUrl = text(graph?.['endpointUrl'], 512) ?? 'not-exposed-by-legacy-record';
  const retrievalPath =
    graph?.['retrieval'] === 'STUDIO_GRAPHQL' || graph?.['retrieval'] === 'SUBGRAPH_MCP'
      ? graph['retrieval']
      : graph?.['kind'] === 'MCP'
        ? 'SUBGRAPH_MCP'
        : 'UNKNOWN';
  const observedThroughBlock = text(graphRecord?.['blockNumber'], 78);
  const observedThroughTime = text(graphRecord?.['retrievedAt'], 128);

  const targetState = command['targetState'];
  const coreReason = text(command['reason']);
  const details: Partial<RecoveryView> = {
    core_disposition: core,
    settlement_permission: 'NEVER',
    contradiction: view['contradiction'] === true,
    contradiction_codes: texts(view['contradictionCodes']),
    diagnostics: texts(view['diagnostics']),
    ...(agentRecord &&
    typeof agentRecord['accepted'] === 'boolean' &&
    agentReason &&
    modelName &&
    modelVersion &&
    promptVersion
      ? {
          agent_decision: {
            accepted: agentRecord['accepted'],
            reason: agentReason,
            model_name: modelName,
            model_version: modelVersion,
            prompt_version: promptVersion,
            evidence_references: texts(agentRecord['evidenceReferences']),
          },
        }
      : {}),
    ...(coreReason &&
    (targetState === 'UNKNOWN' || targetState === 'COMMITTED' || targetState === 'FAILED_SAFE')
      ? {
          core_decision: {
            disposition: core,
            target_state: targetState,
            reason: coreReason,
            authoritative_proof_present: command['authoritativeProofPresent'] === true,
            evidence_references: texts(command['evidenceReferences']),
          },
        }
      : {}),
    ...(health && deploymentId && manifestCid
      ? {
          graph_observation: {
            retrieval_path: retrievalPath,
            endpoint_url: endpointUrl,
            ...(serverName ? { server_name: serverName } : {}),
            ...(serverVersion ? { server_version: serverVersion } : {}),
            ...(toolName ? { tool_name: toolName } : {}),
            deployment_id: deploymentId,
            manifest_cid: manifestCid,
            ...(observedThroughBlock ? { observed_through_block: observedThroughBlock } : {}),
            ...(observedThroughTime ? { observed_through_time: observedThroughTime } : {}),
            health,
            available: health !== 'UNAVAILABLE',
            candidate_count: candidates.length,
            diagnostics: texts(view['diagnostics']),
            candidates,
          },
        }
      : {}),
  };

  return { action, details };
}

interface AttemptRow {
  readonly attempt_id: string;
  readonly stage: IntentState;
  readonly created_at: Date;
  readonly sanitized_error: string | null;
}

interface SettlementRow {
  readonly provider_reference_id: string;
  readonly transaction_hash: string;
  readonly block_number: string;
  readonly transfer_log_index: number;
}

interface EvidenceRow {
  readonly source: EvidenceView['source'];
  readonly authority_class: EvidenceView['authority_class'];
  readonly retrieved_at: Date;
  readonly digest: string;
  readonly block_number: string | null;
  readonly freshness: EvidenceView['freshness'] | null;
}

const MAX_PROJECTION_ITEMS = 100;

function boundedLimit(value: number | undefined): number {
  if (value === undefined) return MAX_PROJECTION_ITEMS;
  if (!Number.isSafeInteger(value) || value < 1 || value > MAX_PROJECTION_ITEMS) {
    throw new ContractValidationError('projection limit must be an integer from 1 through 100');
  }
  return value;
}

type MetricEventType =
  | 'DUPLICATE_REQUEST'
  | 'CAS_CONFLICT'
  | 'POLICY_DENIAL'
  | 'PROVIDER_ERROR'
  | 'RECONCILIATION_OUTCOME';

function reconciliationOutcome(payload: unknown): 'COMMITTED' | 'FAILED_SAFE' | 'UNKNOWN' {
  const command = object(object(payload)?.['reconciliationCommand']);
  const targetState = command?.['targetState'];
  return targetState === 'COMMITTED' || targetState === 'FAILED_SAFE' ? targetState : 'UNKNOWN';
}

export class IntentLedger {
  readonly #pool: Pool;
  readonly #dependencies: LedgerDependencies;

  constructor(pool: Pool, dependencies: LedgerDependencies) {
    this.#pool = pool;
    this.#dependencies = dependencies;
  }

  async #recordMetricEvent(
    businessIntentId: BusinessIntentId,
    eventType: MetricEventType,
    outcome?: string,
  ): Promise<void> {
    try {
      await this.#pool.query(
        `INSERT INTO operational_metric_events (
          business_intent_id, event_type, outcome, created_at
        ) VALUES ($1, $2, $3, $4)`,
        [businessIntentId, eventType, outcome ?? null, this.#dependencies.now()],
      );
    } catch {
      // Metrics are operational evidence only and must never change ledger behavior.
    }
  }

  async #recordMetricEventOnClient(
    client: PoolClient,
    businessIntentId: BusinessIntentId,
    eventType: MetricEventType,
    outcome?: string,
  ): Promise<void> {
    let savepointCreated = false;
    try {
      await client.query('SAVEPOINT oneshot_metric_event');
      savepointCreated = true;
      await client.query(
        `INSERT INTO operational_metric_events (
          business_intent_id, event_type, outcome, created_at
        ) VALUES ($1, $2, $3, $4)`,
        [businessIntentId, eventType, outcome ?? null, this.#dependencies.now()],
      );
      await client.query('RELEASE SAVEPOINT oneshot_metric_event');
    } catch {
      // Isolate metric failures from the surrounding ledger transaction. PostgreSQL
      // marks a transaction failed after a statement error; catching the INSERT
      // alone is not sufficient to preserve the business transition.
      if (savepointCreated) {
        try {
          await client.query('ROLLBACK TO SAVEPOINT oneshot_metric_event');
          await client.query('RELEASE SAVEPOINT oneshot_metric_event');
        } catch {
          // The business transaction remains authoritative; metric evidence is not.
        }
      }
    }
  }

  async ping(): Promise<void> {
    await this.#pool.query('SELECT 1');
  }

  async createOrReplay(value: unknown, correlationIdValue: unknown): Promise<CreateIntentResult> {
    const fingerprinted = fingerprintIntent(value);
    const correlationId = asCorrelationId(correlationIdValue);
    const attemptId = asAttemptId(this.#dependencies.nextAttemptId());
    const now = this.#dependencies.now();
    const client = await this.#pool.connect();
    try {
      await client.query('BEGIN');
      const inserted = await client.query<{ business_intent_id: string }>(
        `INSERT INTO business_intents (
          business_intent_id, payload_fingerprint, recipient, amount_atomic,
          asset, network, purpose, state, version, created_at, updated_at
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, 'AUTHORIZING', 1, $8, $8)
        ON CONFLICT (business_intent_id) DO NOTHING
        RETURNING business_intent_id`,
        [
          fingerprinted.request.business_intent_id,
          fingerprinted.payload_fingerprint,
          fingerprinted.request.recipient,
          fingerprinted.request.amount_atomic,
          fingerprinted.request.asset,
          fingerprinted.request.network,
          fingerprinted.request.purpose,
          now,
        ],
      );

      let kind: CreateIntentResult['kind'];
      if (inserted.rowCount === 1) {
        await client.query(
          `INSERT INTO attempts (
            attempt_id, business_intent_id, attempt_sequence, stage,
            correlation_id, request_body_fingerprint, token_contract,
            method, native_value_atomic, created_at
          ) VALUES (
            $1, $2, 1, 'AUTHORIZING', $3, $4,
            '0x3600000000000000000000000000000000000000', 'transfer', '0', $5
          )`,
          [
            attemptId,
            fingerprinted.request.business_intent_id,
            correlationId,
            fingerprinted.payload_fingerprint,
            now,
          ],
        );
        await client.query(
          `INSERT INTO outbox_jobs (
            business_intent_id, job_key, task_identifier, payload,
            available_at, created_at
          ) VALUES ($1, $2, 'authorize_intent', $3::jsonb, $4, $4)`,
          [
            fingerprinted.request.business_intent_id,
            `authorize:${fingerprinted.request.business_intent_id}:1`,
            JSON.stringify({ business_intent_id: fingerprinted.request.business_intent_id }),
            now,
          ],
        );
        kind = 'ACCEPTED';
      } else {
        const existing = await client.query<{ payload_fingerprint: string }>(
          'SELECT payload_fingerprint FROM business_intents WHERE business_intent_id = $1',
          [fingerprinted.request.business_intent_id],
        );
        kind =
          existing.rows[0]?.payload_fingerprint === fingerprinted.payload_fingerprint
            ? 'REPLAY_IDENTICAL'
            : 'INTENT_PAYLOAD_CONFLICT';
      }
      const businessIntentId = asBusinessIntentId(fingerprinted.request.business_intent_id);
      const intent = await this.#readIntent(client, businessIntentId);
      if (kind !== 'ACCEPTED') {
        await this.#recordMetricEventOnClient(client, businessIntentId, 'DUPLICATE_REQUEST', kind);
      }
      await client.query('COMMIT');
      return { kind, intent } as CreateIntentResult;
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
  }

  async createPaidApiOrReplay(params: {
    readonly workspaceId: string;
    readonly request: unknown;
    readonly quote: PaidApiQuoteSnapshot;
    readonly correlationId: string;
    readonly paymentMode?: PaymentMode;
    readonly payerWallet?: string;
  }): Promise<CreatePaidApiResult> {
    const request = parseCreatePaidApiRequest(params.request);
    const paymentMode = params.paymentMode ?? 'SERVER_PRIVY';
    const payerWallet =
      params.payerWallet === undefined ? undefined : asEvmAddress(params.payerWallet);
    if (paymentMode === 'USER_WALLET' && !payerWallet) {
      throw new ContractValidationError('User-wallet paid API requests require a payer wallet');
    }
    if (paymentMode === 'SERVER_PRIVY' && payerWallet) {
      throw new ContractValidationError('Server-paid API requests cannot bind a payer wallet');
    }
    const businessIntentId = asBusinessIntentId(
      derivedPaidApiBusinessIntentId(params.workspaceId, request),
    );
    const requestFingerprint = paidApiFingerprint(request, params.quote.resourceUrl, payerWallet);
    const recipient = asEvmAddress(params.quote.recipient);
    const amountAtomic = asAtomicAmount(params.quote.amountAtomic);
    const quotePayload = jsonPayload(params.quote.quotePayload, 'x402 quote');
    const intent = fingerprintIntent({
      business_intent_id: businessIntentId,
      recipient,
      amount_atomic: amountAtomic,
      asset: 'USDC',
      network: 'eip155:5042002',
      purpose: `Paid API purchase: ${request.task_key}`,
    });
    const now = this.#dependencies.now();
    const client = await this.#pool.connect();
    try {
      await client.query('BEGIN');
      const existing = await client.query<{ request_fingerprint: string }>(
        `SELECT request_fingerprint FROM paid_api_requests
         WHERE workspace_id = $1 AND task_key = $2 FOR UPDATE`,
        [params.workspaceId, request.task_key],
      );
      if (existing.rows[0]) {
        const view = await this.#readPaidApi(client, params.workspaceId, businessIntentId);
        if (!view) throw new Error('Paid API request binding is missing its Business Intent');
        const kind =
          existing.rows[0].request_fingerprint === requestFingerprint
            ? 'REPLAY_IDENTICAL'
            : 'INTENT_PAYLOAD_CONFLICT';
        await this.#recordMetricEventOnClient(client, businessIntentId, 'DUPLICATE_REQUEST', kind);
        await client.query('COMMIT');
        return { kind, request: view };
      }

      const insertedIntent = await client.query(
        `INSERT INTO business_intents (
          business_intent_id, payload_fingerprint, recipient, amount_atomic,
          asset, network, purpose, state, version, created_at, updated_at
        ) VALUES ($1, $2, $3, $4, 'USDC', 'eip155:5042002', $5, $6, 1, $7, $7)
        ON CONFLICT (business_intent_id) DO NOTHING`,
        [
          businessIntentId,
          intent.payload_fingerprint,
          intent.request.recipient,
          intent.request.amount_atomic,
          intent.request.purpose,
          paymentMode === 'USER_WALLET' ? 'READY' : 'AUTHORIZING',
          now,
        ],
      );
      if (insertedIntent.rowCount !== 1) {
        const existingIntent = await client.query<{ payload_fingerprint: string }>(
          'SELECT payload_fingerprint FROM business_intents WHERE business_intent_id = $1',
          [businessIntentId],
        );
        if (existingIntent.rows[0]?.payload_fingerprint !== intent.payload_fingerprint) {
          throw new Error('Paid API task identity is already bound to a different intent');
        }
      }

      const insertedRequest = await client.query(
        `INSERT INTO paid_api_requests (
          business_intent_id, workspace_id, task_key, tool_id, request_fingerprint,
          resource_url, method, quote_payload, quote_recipient, quote_amount_atomic,
          quote_x402_version, quote_max_timeout_seconds, created_at, updated_at,
          payment_mode, payer_wallet
        ) VALUES ($1, $2, $3, $4, $5, $6, 'GET', $7::jsonb, $8, $9, $10, $11, $12, $12, $13, $14)
        ON CONFLICT (workspace_id, task_key) DO NOTHING
        RETURNING business_intent_id`,
        [
          businessIntentId,
          params.workspaceId,
          request.task_key,
          request.tool_id,
          requestFingerprint,
          params.quote.resourceUrl,
          quotePayload,
          recipient,
          amountAtomic,
          params.quote.x402Version,
          params.quote.maxTimeoutSeconds,
          now,
          paymentMode,
          payerWallet ?? null,
        ],
      );
      if (insertedRequest.rowCount !== 1) {
        const raced = await client.query<{
          request_fingerprint: string;
          business_intent_id: string;
        }>(
          `SELECT request_fingerprint, business_intent_id FROM paid_api_requests
           WHERE workspace_id = $1 AND task_key = $2 FOR UPDATE`,
          [params.workspaceId, request.task_key],
        );
        const racedRow = raced.rows[0];
        if (!racedRow) throw new Error('Paid API request race lost without a durable binding');
        const view = await this.#readPaidApi(
          client,
          params.workspaceId,
          asBusinessIntentId(racedRow.business_intent_id),
        );
        if (!view) throw new Error('Paid API request race lost without a readable binding');
        const kind =
          racedRow.request_fingerprint === requestFingerprint
            ? 'REPLAY_IDENTICAL'
            : 'INTENT_PAYLOAD_CONFLICT';
        await this.#recordMetricEventOnClient(
          client,
          asBusinessIntentId(racedRow.business_intent_id),
          'DUPLICATE_REQUEST',
          kind,
        );
        await client.query('COMMIT');
        return { kind, request: view };
      }

      const attemptId = asAttemptId(this.#dependencies.nextAttemptId());
      await client.query(
        `INSERT INTO attempts (
          attempt_id, business_intent_id, attempt_sequence, stage,
          correlation_id, request_body_fingerprint, token_contract,
          method, native_value_atomic, provider_kind, created_at
        ) VALUES ($1, $2, 1, $3, $4, $5,
                  '0x3600000000000000000000000000000000000000', 'x402', '0', 'CIRCLE_X402', $6)`,
        [
          attemptId,
          businessIntentId,
          paymentMode === 'USER_WALLET' ? 'READY' : 'AUTHORIZING',
          params.correlationId,
          intent.payload_fingerprint,
          now,
        ],
      );
      if (paymentMode === 'SERVER_PRIVY') {
        await client.query(
          `INSERT INTO outbox_jobs (
            business_intent_id, job_key, task_identifier, payload,
            available_at, created_at
          ) VALUES ($1, $2, 'authorize_intent', $3::jsonb, $4, $4)`,
          [
            businessIntentId,
            `authorize:${businessIntentId}:1`,
            JSON.stringify({ business_intent_id: businessIntentId }),
            now,
          ],
        );
      }
      const view = await this.#readPaidApi(client, params.workspaceId, businessIntentId);
      if (!view) throw new Error('Created paid API request was not readable');
      await client.query('COMMIT');
      return { kind: 'ACCEPTED', request: view };
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
  }

  async getPaidApiByTaskKey(
    workspaceIdValue: unknown,
    taskKey: string,
  ): Promise<PaidApiResponse | undefined> {
    const workspaceId = String(workspaceIdValue);
    const client = await this.#pool.connect();
    try {
      return await this.#readPaidApiByTaskKey(client, workspaceId, taskKey);
    } finally {
      client.release();
    }
  }

  async getPaidApi(
    workspaceIdValue: unknown,
    businessIntentIdValue: unknown,
  ): Promise<PaidApiResponse | undefined> {
    const workspaceId = String(workspaceIdValue);
    const businessIntentId = asBusinessIntentId(businessIntentIdValue);
    const client = await this.#pool.connect();
    try {
      return await this.#readPaidApi(client, workspaceId, businessIntentId);
    } finally {
      client.release();
    }
  }

  async getPaidApiTarget(businessIntentIdValue: unknown): Promise<PaidApiTarget | undefined> {
    const businessIntentId = asBusinessIntentId(businessIntentIdValue);
    const result = await this.#pool.query<{
      business_intent_id: string;
      resource_url: string;
      method: 'GET';
      quote_payload: unknown;
      payment_mode: PaymentMode;
      payer_wallet: string | null;
    }>(
      `SELECT business_intent_id, resource_url, method, quote_payload, payment_mode, payer_wallet
       FROM paid_api_requests WHERE business_intent_id = $1`,
      [businessIntentId],
    );
    const row = result.rows[0];
    return row
      ? {
          businessIntentId: row.business_intent_id,
          resourceUrl: row.resource_url,
          method: row.method,
          quotePayload: row.quote_payload,
          paymentMode: row.payment_mode,
          ...(row.payer_wallet ? { payerWallet: row.payer_wallet } : {}),
        }
      : undefined;
  }

  async recordProviderTransaction(
    attemptIdValue: unknown,
    transactionHashValue: unknown,
  ): Promise<void> {
    const attemptId = asAttemptId(attemptIdValue);
    const transactionHash = asTransactionHash(transactionHashValue);
    const result = await this.#pool.query(
      `UPDATE attempts
       SET provider_transaction_hash = $1
       WHERE attempt_id = $2 AND provider_kind = 'CIRCLE_X402'`,
      [transactionHash, attemptId],
    );
    if (result.rowCount !== 1) {
      throw new Error(`Cannot persist provider transaction for attempt ${attemptId}`);
    }
    await this.#pool.query(
      `UPDATE paid_api_requests p SET provider_transaction_hash = $1, updated_at = $2
       FROM attempts a
       WHERE a.attempt_id = $3 AND p.business_intent_id = a.business_intent_id`,
      [transactionHash, this.#dependencies.now(), attemptId],
    );
  }

  async recordPaidApiResponse(
    businessIntentIdValue: unknown,
    response: unknown,
    transactionHashValue?: unknown,
  ): Promise<void> {
    const businessIntentId = asBusinessIntentId(businessIntentIdValue);
    const transactionHash =
      transactionHashValue === undefined ? undefined : asTransactionHash(transactionHashValue);
    const result = await this.#pool.query(
      `UPDATE paid_api_requests
       SET response_payload = $1::jsonb,
           provider_transaction_hash = COALESCE($2, provider_transaction_hash),
           updated_at = $3
       WHERE business_intent_id = $4`,
      [
        jsonPayload(response, 'paid API response'),
        transactionHash ?? null,
        this.#dependencies.now(),
        businessIntentId,
      ],
    );
    if (result.rowCount !== 1) {
      throw new Error(`Cannot persist paid API response for intent ${businessIntentId}`);
    }
  }

  async recordPaidApiTransfer(
    businessIntentIdValue: unknown,
    response: unknown,
    providerTransferIdValue: unknown,
  ): Promise<void> {
    const businessIntentId = asBusinessIntentId(businessIntentIdValue);
    const providerTransferId = String(providerTransferIdValue);
    if (
      !/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/iu.test(
        providerTransferId,
      )
    ) {
      throw new ContractValidationError('Circle x402 transfer ID is malformed');
    }
    const result = await this.#pool.query(
      `UPDATE paid_api_requests
       SET response_payload = $1::jsonb, provider_transfer_id = $2, updated_at = $3
       WHERE business_intent_id = $4`,
      [
        jsonPayload(response, 'paid API response'),
        providerTransferId,
        this.#dependencies.now(),
        businessIntentId,
      ],
    );
    if (result.rowCount !== 1) {
      throw new Error(`Cannot persist Circle transfer for intent ${businessIntentId}`);
    }
  }

  async getIntent(
    idValue: unknown,
    limits: { readonly attempts?: number; readonly evidence?: number } = {},
  ): Promise<IntentResponse | undefined> {
    const id = asBusinessIntentId(idValue);
    const client = await this.#pool.connect();
    try {
      return await this.#readIntent(client, id, limits);
    } finally {
      client.release();
    }
  }

  async getRecoveryView(idValue: unknown): Promise<RecoveryView | undefined> {
    const intent = await this.getIntent(idValue);
    if (!intent) return undefined;
    const latestRecovery = await this.#pool.query<{ payload: unknown }>(
      `SELECT payload
       FROM outbox_jobs
       WHERE business_intent_id = $1
         AND job_key LIKE 'recovery-event:%'
       ORDER BY outbox_job_id DESC
       LIMIT 1`,
      [intent.business_intent_id],
    );
    const persisted = persistedRecovery(latestRecovery.rows[0]?.payload);
    return {
      business_intent_id: intent.business_intent_id,
      authoritative_state: intent.state,
      recommended_action:
        persisted.action ?? (intent.state === 'COMMITTED' ? 'RETURN_EXISTING_RESULT' : 'WAIT'),
      recommendation_source: persisted.action ? 'RECOVERY_AGENT' : 'SAFE_FALLBACK',
      ...persisted.details,
      settlement_permission: 'NEVER',
      evidence: intent.evidence,
    };
  }

  async enqueueReconciliation(idValue: unknown): Promise<ReconcileResponse | undefined> {
    const id = asBusinessIntentId(idValue);
    const client = await this.#pool.connect();
    try {
      await client.query('BEGIN');
      const intent = await client.query<{ state: IntentState; version: number }>(
        'SELECT state, version FROM business_intents WHERE business_intent_id = $1 FOR UPDATE',
        [id],
      );
      const row = intent.rows[0];
      if (!row) {
        await client.query('COMMIT');
        return undefined;
      }
      if (row.state !== 'UNKNOWN' && row.state !== 'SUBMITTING') {
        await client.query('COMMIT');
        return { business_intent_id: id, queued: false, state: row.state };
      }
      const reconciliationJobs = await client.query<{ count: string; pending: boolean | null }>(
        `SELECT count(*)::text AS count, bool_or(status = 'PENDING') AS pending
         FROM outbox_jobs
         WHERE business_intent_id = $1
           AND job_key LIKE 'reconcile:%'`,
        [id],
      );
      const jobs = reconciliationJobs.rows[0];
      if (jobs?.pending === true) {
        await client.query('COMMIT');
        return { business_intent_id: id, queued: false, state: row.state };
      }
      const now = this.#dependencies.now();
      const generation = BigInt(jobs?.count ?? '0') + 1n;
      const inserted = await client.query(
        `INSERT INTO outbox_jobs (
          business_intent_id, job_key, task_identifier, payload,
          available_at, created_at
        ) VALUES ($1, $2, 'reconcile_intent', $3::jsonb, $4, $4)
        ON CONFLICT (job_key) DO NOTHING`,
        [
          id,
          `reconcile:${id}:${row.version}:${generation}`,
          JSON.stringify({ business_intent_id: id }),
          now,
        ],
      );
      await client.query('COMMIT');
      return { business_intent_id: id, queued: inserted.rowCount === 1, state: row.state };
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
  }

  async appendEvidence(idValue: unknown, evidence: EvidenceView): Promise<void> {
    const id = asBusinessIntentId(idValue);
    await this.#pool.query(
      `INSERT INTO evidence_observations (
        business_intent_id, source, authority_class, retrieved_at,
        digest, block_number, freshness
      ) VALUES ($1, $2, $3, $4, $5, $6, $7)`,
      [
        id,
        evidence.source,
        evidence.authority_class,
        evidence.retrieved_at,
        evidence.digest,
        evidence.block_number ?? null,
        evidence.freshness ?? null,
      ],
    );
  }

  async completeAuthorization(
    idValue: unknown,
    expectedVersion: number,
    result: AuthorizationResult,
  ): Promise<CompleteAuthorizationResult> {
    const id = asBusinessIntentId(idValue);
    const client = await this.#pool.connect();
    try {
      await client.query('BEGIN');
      const intent = await client.query<{ state: IntentState; version: number }>(
        'SELECT state, version FROM business_intents WHERE business_intent_id = $1 FOR UPDATE',
        [id],
      );
      const row = intent.rows[0];
      if (!row) {
        await client.query('ROLLBACK');
        return { completed: false, reason: 'NOT_FOUND' };
      }
      if (row.state !== 'AUTHORIZING') {
        await client.query('ROLLBACK');
        return { completed: false, reason: 'INVALID_STATE', currentState: row.state };
      }
      const now = this.#dependencies.now();
      if (result.kind === 'AUTHORIZED') {
        const newVersion = expectedVersion + 1;
        await client.query(
          'UPDATE business_intents SET state = $1, version = $2, updated_at = $3 WHERE business_intent_id = $4 AND version = $5',
          ['READY', newVersion, now, id, expectedVersion],
        );
        await client.query(
          `INSERT INTO outbox_jobs (
            business_intent_id, job_key, task_identifier, payload,
            available_at, created_at
          ) VALUES ($1, $2, 'submit_settlement', $3::jsonb, $4, $4)
          ON CONFLICT (job_key) DO NOTHING`,
          [id, `submit:${id}:${newVersion}`, JSON.stringify({ business_intent_id: id }), now],
        );
        await client.query('COMMIT');
        return { completed: true, state: 'READY', version: newVersion };
      }
      if (result.kind === 'DENIED') {
        const newVersion = expectedVersion + 1;
        await client.query(
          'UPDATE business_intents SET state = $1, version = $2, updated_at = $3 WHERE business_intent_id = $4 AND version = $5',
          ['REJECTED', newVersion, now, id, expectedVersion],
        );
        await client.query(
          'UPDATE attempts SET stage = $1, sanitized_error = $2 WHERE business_intent_id = $3 AND attempt_sequence = 1',
          ['REJECTED', result.reason, id],
        );
        await this.#recordMetricEventOnClient(client, id, 'POLICY_DENIAL', 'AUTHORIZATION');
        await client.query('COMMIT');
        return { completed: true, state: 'REJECTED', version: newVersion };
      }
      if (result.kind === 'UNAVAILABLE') {
        const newVersion = row.version;
        await client.query(
          `UPDATE attempts
           SET sanitized_error = $1
           WHERE attempt_id = (
             SELECT attempt_id
             FROM attempts
             WHERE business_intent_id = $2 AND stage = 'AUTHORIZING'
             ORDER BY attempt_sequence DESC
             LIMIT 1
           )`,
          [result.reason, id],
        );
        await this.#recordMetricEventOnClient(
          client,
          id,
          'PROVIDER_ERROR',
          'AUTHORIZATION_UNAVAILABLE',
        );
        await client.query('COMMIT');
        return { completed: true, state: 'AUTHORIZING', version: newVersion };
      }
      await client.query('COMMIT');
      return { completed: true, state: 'AUTHORIZING', version: row.version };
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
  }

  async claimSubmission(
    idValue: unknown,
    correlationIdValue?: unknown,
    providerIdentity?: ProviderRequestIdentity,
  ): Promise<ClaimSubmissionResult> {
    const id = asBusinessIntentId(idValue);
    const correlationId = correlationIdValue
      ? asCorrelationId(correlationIdValue)
      : asCorrelationId(`corr-${id}`);
    const client = await this.#pool.connect();
    try {
      await client.query('BEGIN');
      const intentResult = await client.query<{
        state: IntentState;
        version: number;
        payload_fingerprint: string;
      }>(
        'SELECT state, version, payload_fingerprint FROM business_intents WHERE business_intent_id = $1 FOR UPDATE',
        [id],
      );
      const row = intentResult.rows[0];
      if (!row) {
        await client.query('ROLLBACK');
        return { claimed: false, reason: 'NOT_FOUND' };
      }
      if (row.state !== 'READY') {
        await this.#recordMetricEventOnClient(client, id, 'CAS_CONFLICT', row.state);
        await client.query('COMMIT');
        return {
          claimed: false,
          reason: 'NOT_READY',
          currentState: row.state,
          version: row.version,
        };
      }
      const newVersion = row.version + 1;
      const now = this.#dependencies.now();
      const attemptId = asAttemptId(this.#dependencies.nextAttemptId());
      const countResult = await client.query<{ count: string }>(
        'SELECT count(*)::text AS count FROM attempts WHERE business_intent_id = $1',
        [id],
      );
      const attemptSequence = Number(countResult.rows[0]?.count ?? '0') + 1;

      await client.query(
        'UPDATE business_intents SET state = $1, version = $2, updated_at = $3 WHERE business_intent_id = $4 AND version = $5',
        ['SUBMITTING', newVersion, now, id, row.version],
      );
      await client.query(
        `INSERT INTO attempts (
          attempt_id, business_intent_id, attempt_sequence, stage,
          correlation_id, request_body_fingerprint, token_contract,
          method, native_value_atomic, provider_kind,
          privy_idempotency_key, privy_reference_id, wallet_id, policy_id,
          created_at
        )
        SELECT $1, $2, $3, 'SUBMITTING', $4, $5,
          '0x3600000000000000000000000000000000000000',
          CASE WHEN EXISTS (
            SELECT 1 FROM paid_api_requests WHERE business_intent_id = $2
          ) THEN 'x402' ELSE 'transfer' END,
          '0',
          COALESCE($7::text, CASE WHEN EXISTS (
            SELECT 1 FROM paid_api_requests WHERE business_intent_id = $2
          ) THEN 'CIRCLE_X402' ELSE 'DIRECT_ARC' END),
          $8::text, $9::text, $10::text, $11::text,
          $6`,
        [
          attemptId,
          id,
          attemptSequence,
          correlationId,
          providerIdentity?.requestFingerprint ?? row.payload_fingerprint,
          now,
          providerIdentity?.providerKind ?? null,
          providerIdentity?.idempotencyKey ?? null,
          providerIdentity?.referenceId ?? null,
          providerIdentity?.walletId ?? null,
          providerIdentity?.policyId ?? null,
        ],
      );
      const intent = await this.#readIntent(client, id);
      await client.query('COMMIT');
      return {
        claimed: true,
        intent: intent!,
        attemptId,
        correlationId,
        version: newVersion,
      };
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
  }

  async persistProviderRequestIdentity(
    attemptIdValue: unknown,
    identity: ProviderRequestIdentity,
  ): Promise<void> {
    const attemptId = asAttemptId(attemptIdValue);
    const result = await this.#pool.query(
      `UPDATE attempts
       SET privy_idempotency_key = $1,
           privy_reference_id = $2,
           request_body_fingerprint = $3,
           wallet_id = $4,
           policy_id = $5,
           provider_kind = COALESCE($6, provider_kind)
       WHERE attempt_id = $7 AND stage = 'SUBMITTING'`,
      [
        identity.idempotencyKey,
        identity.referenceId,
        identity.requestFingerprint,
        identity.walletId ?? null,
        identity.policyId ?? null,
        identity.providerKind ?? null,
        attemptId,
      ],
    );
    if (result.rowCount !== 1) {
      throw new Error(`Cannot persist provider request identity for attempt ${attemptId}`);
    }
  }

  async getProviderRequestIdentity(idValue: unknown): Promise<ProviderRequestIdentity | null> {
    const id = asBusinessIntentId(idValue);
    const result = await this.#pool.query<{
      privy_idempotency_key: string | null;
      privy_reference_id: string | null;
      request_body_fingerprint: string;
      wallet_id: string | null;
      policy_id: string | null;
      provider_kind: 'DIRECT_ARC' | 'CIRCLE_X402';
      provider_transaction_hash: string | null;
      provider_transfer_id: string | null;
    }>(
      `SELECT a.privy_idempotency_key, a.privy_reference_id, a.request_body_fingerprint,
              a.wallet_id, a.policy_id, a.provider_kind, a.provider_transaction_hash,
              p.provider_transfer_id
       FROM attempts a
       LEFT JOIN paid_api_requests p ON p.business_intent_id = a.business_intent_id
       WHERE a.business_intent_id = $1
       ORDER BY a.attempt_sequence DESC
       LIMIT 1`,
      [id],
    );
    const row = result.rows[0];
    if (!row?.privy_idempotency_key || !row.privy_reference_id) return null;
    return {
      idempotencyKey: row.privy_idempotency_key,
      referenceId: row.privy_reference_id,
      requestFingerprint: row.request_body_fingerprint,
      ...(row.wallet_id ? { walletId: row.wallet_id } : {}),
      ...(row.policy_id ? { policyId: row.policy_id } : {}),
      ...(row.provider_kind === 'CIRCLE_X402' ? { providerKind: row.provider_kind } : {}),
      ...(row.provider_transaction_hash ? { transactionHash: row.provider_transaction_hash } : {}),
      ...(row.provider_transfer_id ? { providerTransferId: row.provider_transfer_id } : {}),
    };
  }

  /**
   * Claims the already-created user-wallet intent after the browser has
   * obtained a transaction hash. The task's payer binding is checked inside
   * the same transaction that owns the submission attempt.
   */
  async beginUserWalletSubmission(
    idValue: unknown,
    payerWalletValue: unknown,
    correlationIdValue: unknown,
  ): Promise<BeginUserWalletSubmissionResult> {
    const id = asBusinessIntentId(idValue);
    const payerWallet = asEvmAddress(payerWalletValue);
    const correlationId = asCorrelationId(correlationIdValue);
    const client = await this.#pool.connect();
    try {
      await client.query('BEGIN');
      const result = await client.query<{
        state: IntentState;
        version: number;
        payment_mode: 'SERVER_PRIVY' | 'USER_WALLET';
        payer_wallet: string | null;
        payment_transaction_hash: string | null;
        attempt_id: string | null;
      }>(
        `SELECT i.state, i.version, j.payment_mode, j.payer_wallet,
                j.payment_transaction_hash, a.attempt_id
         FROM business_intents i
         JOIN resumable_jobs j ON j.business_intent_id = i.business_intent_id
         LEFT JOIN LATERAL (
           SELECT attempt_id
           FROM attempts
           WHERE business_intent_id = i.business_intent_id
           ORDER BY attempt_sequence DESC
           LIMIT 1
         ) a ON true
         WHERE i.business_intent_id = $1
         FOR UPDATE OF i, j`,
        [id],
      );
      const row = result.rows[0];
      if (!row) {
        await client.query('ROLLBACK');
        return { begun: false, reason: 'NOT_FOUND' };
      }
      if (
        row.payment_mode !== 'USER_WALLET' ||
        !row.payer_wallet ||
        row.payer_wallet.toLowerCase() !== payerWallet.toLowerCase()
      ) {
        await client.query('ROLLBACK');
        return { begun: false, reason: 'NOT_USER_WALLET', currentState: row.state };
      }
      if (row.state === 'READY') {
        if (!row.attempt_id) {
          await client.query('ROLLBACK');
          return { begun: false, reason: 'NOT_READY', currentState: row.state };
        }
        const now = this.#dependencies.now();
        const newVersion = row.version + 1;
        const updated = await client.query(
          `UPDATE business_intents
           SET state = 'SUBMITTING', version = $1, updated_at = $2
           WHERE business_intent_id = $3 AND state = 'READY' AND version = $4`,
          [newVersion, now, id, row.version],
        );
        if (updated.rowCount !== 1) {
          await client.query('ROLLBACK');
          return { begun: false, reason: 'NOT_READY', currentState: row.state };
        }
        await client.query(
          `UPDATE attempts SET stage = 'SUBMITTING', correlation_id = $1
           WHERE attempt_id = $2 AND stage = 'READY'`,
          [correlationId, row.attempt_id],
        );
        const intent = await this.#readIntent(client, id);
        await client.query('COMMIT');
        return {
          begun: true,
          intent: intent!,
          attemptId: asAttemptId(row.attempt_id),
          state: 'SUBMITTING',
          version: newVersion,
        };
      }
      if (row.state === 'SUBMITTING' || row.state === 'UNKNOWN') {
        if (!row.attempt_id) {
          await client.query('ROLLBACK');
          return { begun: false, reason: 'NOT_READY', currentState: row.state };
        }
        const intent = await this.#readIntent(client, id);
        await client.query('COMMIT');
        return {
          begun: true,
          intent: intent!,
          attemptId: asAttemptId(row.attempt_id),
          ...(row.payment_transaction_hash
            ? { transactionHash: asTransactionHash(row.payment_transaction_hash) }
            : {}),
          state: row.state,
          version: row.version,
        };
      }
      await client.query('COMMIT');
      return {
        begun: false,
        reason: 'NOT_READY',
        currentState: row.state,
        version: row.version,
        ...(row.attempt_id ? { attemptId: row.attempt_id } : {}),
        ...(row.payment_transaction_hash
          ? { transactionHash: asTransactionHash(row.payment_transaction_hash) }
          : {}),
      };
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
  }

  async recordUserWalletTransaction(
    attemptIdValue: unknown,
    transactionHashValue: unknown,
  ): Promise<'RECORDED' | 'REPLAYED' | 'CONFLICT' | 'NOT_FOUND'> {
    const attemptId = asAttemptId(attemptIdValue);
    const transactionHash = asTransactionHash(transactionHashValue);
    const client = await this.#pool.connect();
    try {
      await client.query('BEGIN');
      const existing = await client.query<{
        business_intent_id: string;
        provider_transaction_hash: string | null;
        stage: IntentState;
      }>(
        `SELECT business_intent_id, provider_transaction_hash, stage
         FROM attempts WHERE attempt_id = $1 FOR UPDATE`,
        [attemptId],
      );
      const row = existing.rows[0];
      if (!row) {
        await client.query('ROLLBACK');
        return 'NOT_FOUND';
      }
      if (row.provider_transaction_hash && row.provider_transaction_hash !== transactionHash) {
        await client.query('ROLLBACK');
        return 'CONFLICT';
      }
      if (row.stage !== 'SUBMITTING' && row.stage !== 'UNKNOWN') {
        await client.query('ROLLBACK');
        return row.provider_transaction_hash === transactionHash ? 'REPLAYED' : 'NOT_FOUND';
      }
      const wasRecorded = row.provider_transaction_hash === transactionHash;
      if (!wasRecorded) {
        await client.query(
          'UPDATE attempts SET provider_transaction_hash = $1 WHERE attempt_id = $2',
          [transactionHash, attemptId],
        );
        const jobUpdate = await client.query(
          `UPDATE resumable_jobs SET payment_transaction_hash = $1, updated_at = $2
           WHERE business_intent_id = $3`,
          [transactionHash, this.#dependencies.now(), row.business_intent_id],
        );
        if (jobUpdate.rowCount !== 1) {
          await client.query('ROLLBACK');
          return 'NOT_FOUND';
        }
      }
      await client.query('COMMIT');
      return wasRecorded ? 'REPLAYED' : 'RECORDED';
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
  }

  /** Mark a browser-submitted payment UNKNOWN without handing it to the server-wallet recovery path. */
  async markUserWalletUnknown(
    idValue: unknown,
    attemptIdValue: unknown,
    reason: string,
  ): Promise<CompleteSubmissionResult> {
    const id = asBusinessIntentId(idValue);
    const attemptId = asAttemptId(attemptIdValue);
    const client = await this.#pool.connect();
    try {
      await client.query('BEGIN');
      const result = await client.query<{ state: IntentState; version: number }>(
        'SELECT state, version FROM business_intents WHERE business_intent_id = $1 FOR UPDATE',
        [id],
      );
      const row = result.rows[0];
      if (!row) {
        await client.query('ROLLBACK');
        return { completed: false, reason: 'NOT_FOUND' };
      }
      if (row.state === 'UNKNOWN') {
        await client.query('COMMIT');
        return { completed: true, state: 'UNKNOWN', version: row.version };
      }
      if (row.state !== 'SUBMITTING') {
        await client.query('ROLLBACK');
        return { completed: false, reason: 'INVALID_STATE', currentState: row.state };
      }
      const now = this.#dependencies.now();
      const newVersion = row.version + 1;
      await client.query(
        `UPDATE business_intents SET state = 'UNKNOWN', version = $1, updated_at = $2
         WHERE business_intent_id = $3 AND state = 'SUBMITTING' AND version = $4`,
        [newVersion, now, id, row.version],
      );
      await client.query(
        "UPDATE attempts SET stage = 'UNKNOWN', sanitized_error = $1 WHERE attempt_id = $2",
        [reason.slice(0, 256), attemptId],
      );
      await this.#recordMetricEventOnClient(client, id, 'PROVIDER_ERROR', 'USER_WALLET_UNKNOWN');
      await client.query('COMMIT');
      return { completed: true, state: 'UNKNOWN', version: newVersion };
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
  }

  async completeSubmission(
    idValue: unknown,
    attemptIdValue: unknown,
    result: SettlementResult,
  ): Promise<CompleteSubmissionResult> {
    const id = asBusinessIntentId(idValue);
    const attemptId = asAttemptId(attemptIdValue);
    const client = await this.#pool.connect();
    try {
      await client.query('BEGIN');
      const intentResult = await client.query<{ state: IntentState; version: number }>(
        'SELECT state, version FROM business_intents WHERE business_intent_id = $1 FOR UPDATE',
        [id],
      );
      const row = intentResult.rows[0];
      if (!row) {
        await client.query('ROLLBACK');
        return { completed: false, reason: 'NOT_FOUND' };
      }
      if (row.state !== 'SUBMITTING' && row.state !== 'UNKNOWN') {
        await client.query('ROLLBACK');
        return { completed: false, reason: 'INVALID_STATE', currentState: row.state };
      }
      const newVersion = row.version + 1;
      const now = this.#dependencies.now();

      if (result.kind === 'CONFIRMED') {
        const updateRes = await client.query(
          'UPDATE business_intents SET state = $1, version = $2, updated_at = $3 WHERE business_intent_id = $4 AND (state = $5 OR state = $6)',
          ['COMMITTED', newVersion, now, id, 'SUBMITTING', 'UNKNOWN'],
        );
        if (updateRes.rowCount !== 1) {
          await client.query('ROLLBACK');
          return { completed: false, reason: 'INVALID_STATE', currentState: row.state };
        }
        await client.query(
          `INSERT INTO settlements (
            business_intent_id, provider_reference_id, transaction_hash,
            block_number, transfer_log_index, committed_at
          ) VALUES ($1, $2, $3, $4, $5, $6)
          ON CONFLICT (business_intent_id) DO NOTHING`,
          [
            id,
            result.provider_reference_id,
            result.transaction_hash,
            result.block_number,
            result.transfer_log_index,
            now,
          ],
        );
        await client.query(
          `INSERT INTO evidence_observations (
            business_intent_id, source, authority_class, retrieved_at,
            digest, block_number, freshness
          ) VALUES ($1, 'ONESHOT', 'AUTHORITATIVE', $2, $3, $4, 'FRESH')`,
          [id, now, result.transaction_hash, result.block_number],
        );
        if (result.verified_by === 'ARC_RPC_EXACT_TRANSFER') {
          await client.query(
            `INSERT INTO evidence_observations (
              business_intent_id, source, authority_class, retrieved_at,
              digest, block_number, freshness
            ) VALUES ($1, 'ARC', 'AUTHORITATIVE', $2, $3, $4, 'FRESH')`,
            [id, now, result.transaction_hash, result.block_number],
          );
        }
        await client.query('UPDATE attempts SET stage = $1 WHERE attempt_id = $2', [
          'COMMITTED',
          attemptId,
        ]);
        // A job delivery is a separate, non-financial state machine. Scheduling
        // fulfillment in this same transaction preserves the committed payment
        // even when the supplier is unavailable, and never grants another pay.
        const delivery = await client.query<{
          job_id: string;
          supplier_order_reference: string;
          delivery_attempt: number;
        }>(
          `UPDATE resumable_jobs
           SET delivery_state = 'PENDING', delivery_attempt = delivery_attempt + 1, updated_at = $1
           WHERE business_intent_id = $2 AND delivery_state = 'NOT_REQUESTED'
           RETURNING job_id, supplier_order_reference, delivery_attempt`,
          [now, id],
        );
        for (const job of delivery.rows) {
          await client.query(
            `INSERT INTO outbox_jobs (
               business_intent_id, job_key, task_identifier, payload, available_at, created_at
             ) VALUES ($1, $2, 'fulfill_supplier_order', $3::jsonb, $4, $4)
             ON CONFLICT (job_key) DO NOTHING`,
            [
              id,
              `fulfill:${job.job_id}:${job.supplier_order_reference}:${job.delivery_attempt}`,
              JSON.stringify({ job_id: job.job_id, delivery_attempt: job.delivery_attempt }),
              now,
            ],
          );
        }
        await client.query('COMMIT');
        return { completed: true, state: 'COMMITTED', version: newVersion };
      }

      if (result.kind === 'DEFINITELY_NOT_SUBMITTED') {
        const updateRes = await client.query(
          'UPDATE business_intents SET state = $1, version = $2, updated_at = $3 WHERE business_intent_id = $4 AND (state = $5 OR state = $6)',
          ['FAILED_SAFE', newVersion, now, id, 'SUBMITTING', 'UNKNOWN'],
        );
        if (updateRes.rowCount !== 1) {
          await client.query('ROLLBACK');
          return { completed: false, reason: 'INVALID_STATE', currentState: row.state };
        }
        await client.query(
          'UPDATE attempts SET stage = $1, sanitized_error = $2 WHERE attempt_id = $3',
          ['FAILED_SAFE', result.reason, attemptId],
        );
        await client.query('COMMIT');
        return { completed: true, state: 'FAILED_SAFE', version: newVersion };
      }

      // POSSIBLY_SUBMITTED or any unexpected variant -> UNKNOWN
      if (row.state === 'SUBMITTING') {
        await client.query(
          'UPDATE business_intents SET state = $1, version = $2, updated_at = $3 WHERE business_intent_id = $4 AND state = $5',
          ['UNKNOWN', newVersion, now, id, 'SUBMITTING'],
        );
        await client.query(
          'UPDATE attempts SET stage = $1, sanitized_error = $2 WHERE attempt_id = $3',
          [
            'UNKNOWN',
            (result as { reason?: string } | null | undefined)?.reason ??
              'Settlement outcome uncertain',
            attemptId,
          ],
        );
        await client.query(
          `INSERT INTO outbox_jobs (
            business_intent_id, job_key, task_identifier, payload,
            available_at, created_at
          ) VALUES ($1, $2, 'reconcile_intent', $3::jsonb, $4, $4)
          ON CONFLICT (job_key) DO NOTHING`,
          [id, `reconcile:${id}:${newVersion}`, JSON.stringify({ business_intent_id: id }), now],
        );
        await this.#recordMetricEventOnClient(client, id, 'PROVIDER_ERROR', 'POSSIBLY_SUBMITTED');
        await client.query('COMMIT');
        return { completed: true, state: 'UNKNOWN', version: newVersion };
      }
      await client.query('COMMIT');
      return { completed: true, state: 'UNKNOWN', version: row.version };
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
  }

  /**
   * Opens a fresh authorization attempt only after authoritative no-effect
   * proof. This is intentionally a storage primitive for a policy layer; the
   * public API must not expose a generic blind retry control.
   */
  async scheduleFailedSafeRetry(
    idValue: unknown,
    correlationIdValue: unknown,
  ): Promise<ScheduleFailedSafeRetryResult> {
    const id = asBusinessIntentId(idValue);
    const correlationId = asCorrelationId(correlationIdValue);
    const client = await this.#pool.connect();
    try {
      await client.query('BEGIN');
      const intentResult = await client.query<{
        state: IntentState;
        version: number;
        payload_fingerprint: string;
        recipient: string;
        amount_atomic: string;
        asset: 'USDC';
        network: 'eip155:5042002';
        purpose: string;
      }>(
        `SELECT state, version, payload_fingerprint, recipient, amount_atomic,
                asset, network, purpose
         FROM business_intents
         WHERE business_intent_id = $1
         FOR UPDATE`,
        [id],
      );
      const row = intentResult.rows[0];
      if (!row) {
        await client.query('ROLLBACK');
        return { scheduled: false, reason: 'NOT_FOUND' };
      }
      if (row.state !== 'FAILED_SAFE') {
        await client.query('ROLLBACK');
        return {
          scheduled: false,
          reason: 'NOT_FAILED_SAFE',
          currentState: row.state,
          version: row.version,
        };
      }

      const countResult = await client.query<{ count: string }>(
        'SELECT count(*)::text AS count FROM attempts WHERE business_intent_id = $1',
        [id],
      );
      const attemptSequence = Number(countResult.rows[0]?.count ?? '0') + 1;
      const attemptId = asAttemptId(this.#dependencies.nextAttemptId());
      const newVersion = row.version + 1;
      const now = this.#dependencies.now();

      const updateResult = await client.query(
        `UPDATE business_intents
         SET state = 'AUTHORIZING', version = $1, updated_at = $2
         WHERE business_intent_id = $3 AND state = 'FAILED_SAFE' AND version = $4`,
        [newVersion, now, id, row.version],
      );
      if (updateResult.rowCount !== 1) {
        await client.query('ROLLBACK');
        return {
          scheduled: false,
          reason: 'NOT_FAILED_SAFE',
          currentState: row.state,
          version: row.version,
        };
      }
      await client.query(
        `INSERT INTO attempts (
          attempt_id, business_intent_id, attempt_sequence, stage,
          correlation_id, request_body_fingerprint, token_contract,
          method, native_value_atomic, created_at
        ) VALUES ($1, $2, $3, 'AUTHORIZING', $4, $5,
                  '0x3600000000000000000000000000000000000000', 'transfer', '0', $6)`,
        [attemptId, id, attemptSequence, correlationId, row.payload_fingerprint, now],
      );
      await client.query(
        `INSERT INTO outbox_jobs (
          business_intent_id, job_key, task_identifier, payload,
          available_at, created_at
        ) VALUES ($1, $2, 'authorize_intent', $3::jsonb, $4, $4)`,
        [id, `authorize:${id}:${newVersion}`, JSON.stringify({ business_intent_id: id }), now],
      );
      const intent = await this.#readIntent(client, id);
      await client.query('COMMIT');
      return { scheduled: true, intent: intent!, attemptId, version: newVersion };
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
  }

  async #readPaidApiByTaskKey(
    client: PoolClient,
    workspaceId: string,
    taskKey: string,
  ): Promise<PaidApiResponse | undefined> {
    const result = await client.query<{ business_intent_id: string }>(
      `SELECT business_intent_id FROM paid_api_requests
       WHERE workspace_id = $1 AND task_key = $2`,
      [workspaceId, taskKey],
    );
    const businessIntentId = result.rows[0]?.business_intent_id;
    return businessIntentId
      ? this.#readPaidApi(client, workspaceId, asBusinessIntentId(businessIntentId))
      : undefined;
  }

  async #readPaidApi(
    client: PoolClient,
    workspaceId: string,
    businessIntentId: BusinessIntentId,
  ): Promise<PaidApiResponse | undefined> {
    const result = await client.query<PaidApiRow>(
      `SELECT p.business_intent_id, p.task_key, p.tool_id, p.resource_url,
          p.quote_recipient, p.quote_amount_atomic, p.quote_x402_version,
          p.quote_max_timeout_seconds, p.quote_payload, p.response_payload,
          p.provider_transaction_hash, p.provider_transfer_id, p.payment_mode, p.payer_wallet,
          p.created_at, p.updated_at,
          i.state AS payment_state,
          s.provider_reference_id AS settlement_provider_reference_id,
          s.transaction_hash AS settlement_transaction_hash,
          s.block_number AS settlement_block_number,
          s.transfer_log_index AS settlement_transfer_log_index
       FROM paid_api_requests p
       JOIN business_intents i ON i.business_intent_id = p.business_intent_id
       LEFT JOIN settlements s ON s.business_intent_id = p.business_intent_id
       WHERE p.workspace_id = $1 AND p.business_intent_id = $2`,
      [workspaceId, businessIntentId],
    );
    const row = result.rows[0];
    return row ? paidApiView(row) : undefined;
  }

  async #readIntent(
    client: PoolClient,
    id: BusinessIntentId,
    limits: { readonly attempts?: number; readonly evidence?: number } = {},
  ): Promise<IntentResponse | undefined> {
    const intentResult = await client.query<IntentRow>(
      `SELECT i.business_intent_id, i.payload_fingerprint, i.recipient, i.amount_atomic,
        i.asset, i.network, i.purpose, i.state, i.version,
        COALESCE(j.payment_mode, p.payment_mode) AS payment_mode
      FROM business_intents i
      LEFT JOIN resumable_jobs j ON j.business_intent_id = i.business_intent_id
      LEFT JOIN paid_api_requests p ON p.business_intent_id = i.business_intent_id
      WHERE i.business_intent_id = $1`,
      [id],
    );
    const intent = intentResult.rows[0];
    if (!intent) return undefined;

    const attemptLimit = boundedLimit(limits.attempts);
    const evidenceLimit = boundedLimit(limits.evidence);
    const attemptResult = await client.query<AttemptRow>(
      `SELECT attempt_id, stage, created_at, sanitized_error
      FROM (
        SELECT attempt_id, stage, created_at, sanitized_error, attempt_sequence
        FROM attempts WHERE business_intent_id = $1
        ORDER BY attempt_sequence DESC LIMIT $2
      ) bounded ORDER BY attempt_sequence ASC`,
      [id, attemptLimit],
    );
    const settlementResult = await client.query<SettlementRow>(
      `SELECT provider_reference_id, transaction_hash, block_number, transfer_log_index
      FROM settlements WHERE business_intent_id = $1`,
      [id],
    );
    const evidenceResult = await client.query<EvidenceRow>(
      `SELECT source, authority_class, retrieved_at, digest, block_number, freshness
      FROM (
        SELECT evidence_id, source, authority_class, retrieved_at, digest,
          block_number, freshness
        FROM evidence_observations WHERE business_intent_id = $1
        ORDER BY evidence_id DESC LIMIT $2
      ) bounded ORDER BY evidence_id ASC`,
      [id, evidenceLimit],
    );

    const attempts: AttemptView[] = attemptResult.rows.map((row) => ({
      attempt_id: row.attempt_id,
      stage: row.stage,
      created_at: row.created_at.toISOString(),
      ...(row.sanitized_error ? { sanitized_error: row.sanitized_error } : {}),
    }));
    const settlementRow = settlementResult.rows[0];
    const settlement: SettlementView | undefined = settlementRow
      ? {
          provider_reference_id: settlementRow.provider_reference_id,
          transaction_hash: settlementRow.transaction_hash,
          block_number: settlementRow.block_number,
          transfer_log_index: settlementRow.transfer_log_index,
        }
      : undefined;
    const evidence: EvidenceView[] = evidenceResult.rows.map((row) => ({
      source: row.source,
      authority_class: row.authority_class,
      retrieved_at: row.retrieved_at.toISOString(),
      digest: row.digest,
      ...(row.block_number ? { block_number: row.block_number } : {}),
      ...(row.freshness ? { freshness: row.freshness } : {}),
    }));

    return {
      business_intent_id: intent.business_intent_id,
      payload_fingerprint: intent.payload_fingerprint,
      recipient: intent.recipient,
      amount_atomic: intent.amount_atomic,
      asset: intent.asset,
      network: intent.network,
      purpose: intent.purpose,
      state: intent.state,
      version: intent.version,
      ...(intent.payment_mode ? { payment_mode: intent.payment_mode } : {}),
      attempts,
      ...(settlement ? { settlement } : {}),
      evidence,
    };
  }

  async recoverOrphanedSubmissions(
    staleBefore: Date,
  ): Promise<readonly { readonly businessIntentId: string; readonly newVersion: number }[]> {
    const client = await this.#pool.connect();
    const now = this.#dependencies.now().toISOString();
    try {
      await client.query('BEGIN');
      const orphans = await client.query<{ business_intent_id: string; version: number }>(
        `SELECT business_intent_id, version
        FROM business_intents
        WHERE state = 'SUBMITTING' AND updated_at <= $1
        FOR UPDATE SKIP LOCKED`,
        [staleBefore.toISOString()],
      );

      const recovered: { businessIntentId: string; newVersion: number }[] = [];

      for (const orphan of orphans.rows) {
        const newVersion = orphan.version + 1;
        await client.query(
          `UPDATE business_intents
          SET state = 'UNKNOWN', version = $1, updated_at = $2
          WHERE business_intent_id = $3 AND state = 'SUBMITTING'`,
          [newVersion, now, orphan.business_intent_id],
        );

        await client.query(
          `UPDATE attempts
          SET stage = 'UNKNOWN', sanitized_error = 'Lease expired during SUBMITTING, routed to reconciliation'
          WHERE business_intent_id = $1 AND stage = 'SUBMITTING'`,
          [orphan.business_intent_id],
        );

        await client.query(
          `INSERT INTO outbox_jobs (
            business_intent_id, job_key, task_identifier, payload,
            available_at, created_at
          ) VALUES ($1, $2, 'reconcile_intent', $3::jsonb, $4, $4)
          ON CONFLICT (job_key) DO NOTHING`,
          [
            orphan.business_intent_id,
            `reconcile:${orphan.business_intent_id}:${newVersion}`,
            JSON.stringify({ business_intent_id: orphan.business_intent_id }),
            now,
          ],
        );

        recovered.push({ businessIntentId: orphan.business_intent_id, newVersion });
      }

      await client.query('COMMIT');
      return recovered;
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
  }

  async getSystemMetrics(): Promise<SystemMetrics> {
    const client = await this.#pool.connect();
    try {
      const stateCountsResult = await client.query<{ state: IntentState; count: string }>(
        'SELECT state, count(*)::text AS count FROM business_intents GROUP BY state',
      );
      const stateCounts: Record<IntentState, number> = {
        AUTHORIZING: 0,
        READY: 0,
        SUBMITTING: 0,
        COMMITTED: 0,
        FAILED_SAFE: 0,
        UNKNOWN: 0,
        REJECTED: 0,
      };
      for (const row of stateCountsResult.rows) {
        if (row.state in stateCounts) {
          stateCounts[row.state] = Number(row.count);
        }
      }

      const unknownMetrics = await client.query<{ count: string; oldest_age_ms: string }>(
        `SELECT
          count(*)::text AS count,
          COALESCE(EXTRACT(EPOCH FROM (now() - MIN(updated_at))) * 1000, 0)::bigint::text AS oldest_age_ms
        FROM business_intents WHERE state = 'UNKNOWN'`,
      );

      const queueLagResult = await client.query<{ queue_lag_ms: string }>(
        `SELECT
          COALESCE(EXTRACT(EPOCH FROM (now() - MIN(available_at))) * 1000, 0)::bigint::text AS queue_lag_ms
        FROM outbox_jobs WHERE status = 'PENDING' AND available_at <= now()`,
      );

      const metricEventsResult = await client.query<{
        event_type: MetricEventType;
        outcome: string | null;
        count: string;
      }>(
        `SELECT event_type, outcome, count(*)::text AS count
         FROM operational_metric_events
         GROUP BY event_type, outcome`,
      );
      let casConflictsCount = 0;
      let duplicateCount = 0;
      let policyDenialCount = 0;
      let providerErrorCount = 0;
      const reconciliationOutcomeCounts: Record<string, number> = {};
      for (const row of metricEventsResult.rows) {
        const count = Number(row.count);
        if (row.event_type === 'CAS_CONFLICT') casConflictsCount += count;
        if (row.event_type === 'DUPLICATE_REQUEST') duplicateCount += count;
        if (row.event_type === 'POLICY_DENIAL') policyDenialCount += count;
        if (row.event_type === 'PROVIDER_ERROR') providerErrorCount += count;
        if (row.event_type === 'RECONCILIATION_OUTCOME' && row.outcome) {
          reconciliationOutcomeCounts[row.outcome] =
            (reconciliationOutcomeCounts[row.outcome] ?? 0) + count;
        }
      }

      return {
        timestamp: new Date().toISOString(),
        stateCounts,
        unknownCount: Number(unknownMetrics.rows[0]?.count ?? '0'),
        oldestUnknownAgeMs: Number(unknownMetrics.rows[0]?.oldest_age_ms ?? '0'),
        casConflictsCount,
        queueLagMs: Number(queueLagResult.rows[0]?.queue_lag_ms ?? '0'),
        duplicateCount,
        policyDenialCount,
        providerErrorCount,
        reconciliationOutcomeCounts,
      };
    } finally {
      client.release();
    }
  }

  async recordRecoveryEvent(
    businessIntentId: unknown,
    eventId: string,
    payload: unknown,
  ): Promise<{ readonly inserted: boolean }> {
    const id = asBusinessIntentId(businessIntentId);
    const now = this.#dependencies.now();
    const result = await this.#pool.query(
      `INSERT INTO outbox_jobs (
        business_intent_id, job_key, task_identifier, payload,
        status, available_at, created_at
      ) VALUES ($1, $2, 'reconcile_intent', $3::jsonb, 'DELIVERED', $4, $4)
      ON CONFLICT (job_key) DO NOTHING
      RETURNING outbox_job_id`,
      [id, `recovery-event:${eventId}`, JSON.stringify(payload), now],
    );
    const inserted = (result.rowCount ?? 0) === 1;
    if (inserted) {
      await this.#recordMetricEvent(id, 'RECONCILIATION_OUTCOME', reconciliationOutcome(payload));
    }
    return { inserted };
  }

  async getRecoveryEventPayload(eventId: string): Promise<unknown | undefined> {
    const result = await this.#pool.query<{ payload: unknown }>(
      'SELECT payload FROM outbox_jobs WHERE job_key = $1',
      [`recovery-event:${eventId}`],
    );
    return result.rows[0]?.payload;
  }
}
