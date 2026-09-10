import {
  asAttemptId,
  asBusinessIntentId,
  asCorrelationId,
  CORE_DISPOSITIONS,
  ContractValidationError,
  RECOVERY_ACTIONS,
  type AttemptView,
  type BusinessIntentId,
  type EvidenceView,
  type IntentResponse,
  type IntentState,
  type RecoveryView,
  type ReconcileResponse,
  type AuthorizationResult,
  type SettlementResult,
  type SettlementView,
} from '@oneshot/contracts';
import { fingerprintIntent, type SystemMetrics } from '@oneshot/domain';
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
}

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
          method, native_value_atomic, created_at
        ) VALUES (
          $1, $2, $3, 'SUBMITTING', $4, $5,
          '0x3600000000000000000000000000000000000000', 'transfer', '0', $6
        )`,
        [attemptId, id, attemptSequence, correlationId, row.payload_fingerprint, now],
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
           policy_id = $5
       WHERE attempt_id = $6 AND stage = 'SUBMITTING'`,
      [
        identity.idempotencyKey,
        identity.referenceId,
        identity.requestFingerprint,
        identity.walletId ?? null,
        identity.policyId ?? null,
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
    }>(
      `SELECT privy_idempotency_key, privy_reference_id, request_body_fingerprint,
              wallet_id, policy_id
       FROM attempts
       WHERE business_intent_id = $1
       ORDER BY attempt_sequence DESC
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
    };
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
        await client.query('UPDATE attempts SET stage = $1 WHERE attempt_id = $2', [
          'COMMITTED',
          attemptId,
        ]);
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

  async #readIntent(
    client: PoolClient,
    id: BusinessIntentId,
    limits: { readonly attempts?: number; readonly evidence?: number } = {},
  ): Promise<IntentResponse | undefined> {
    const intentResult = await client.query<IntentRow>(
      `SELECT business_intent_id, payload_fingerprint, recipient, amount_atomic,
        asset, network, purpose, state, version
      FROM business_intents WHERE business_intent_id = $1`,
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
