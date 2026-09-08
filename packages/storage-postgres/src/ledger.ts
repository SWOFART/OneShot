import {
  asAttemptId,
  asBusinessIntentId,
  asCorrelationId,
  ContractValidationError,
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

export class IntentLedger {
  readonly #pool: Pool;
  readonly #dependencies: LedgerDependencies;

  constructor(pool: Pool, dependencies: LedgerDependencies) {
    this.#pool = pool;
    this.#dependencies = dependencies;
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
      const intent = await this.#readIntent(
        client,
        asBusinessIntentId(fingerprinted.request.business_intent_id),
      );
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
    return {
      business_intent_id: intent.business_intent_id,
      authoritative_state: intent.state,
      recommended_action: intent.state === 'COMMITTED' ? 'RETURN_EXISTING_RESULT' : 'WAIT',
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
      const now = this.#dependencies.now();
      const inserted = await client.query(
        `INSERT INTO outbox_jobs (
          business_intent_id, job_key, task_identifier, payload,
          available_at, created_at
        ) VALUES ($1, $2, 'reconcile_intent', $3::jsonb, $4, $4)
        ON CONFLICT (job_key) DO NOTHING`,
        [id, `reconcile:${id}:${row.version}`, JSON.stringify({ business_intent_id: id }), now],
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
        await client.query('COMMIT');
        return { completed: true, state: 'REJECTED', version: newVersion };
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
        await client.query('ROLLBACK');
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

      const duplicateResult = await client.query<{ duplicates: string }>(
        `SELECT count(*)::text AS duplicates FROM attempts WHERE attempt_sequence > 1`,
      );

      const policyDenialsResult = await client.query<{ denials: string }>(
        `SELECT count(*)::text AS denials FROM attempts WHERE stage = 'REJECTED' OR sanitized_error LIKE '%policy%' OR sanitized_error LIKE '%denied%'`,
      );

      return {
        timestamp: new Date().toISOString(),
        stateCounts,
        unknownCount: Number(unknownMetrics.rows[0]?.count ?? '0'),
        oldestUnknownAgeMs: Number(unknownMetrics.rows[0]?.oldest_age_ms ?? '0'),
        casConflictsCount: 0,
        queueLagMs: Number(queueLagResult.rows[0]?.queue_lag_ms ?? '0'),
        duplicateCount: Number(duplicateResult.rows[0]?.duplicates ?? '0'),
        policyDenialCount: Number(policyDenialsResult.rows[0]?.denials ?? '0'),
        providerErrorCount: 0,
        reconciliationOutcomeCounts: {},
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
    return { inserted: (result.rowCount ?? 0) === 1 };
  }

  async getRecoveryEventPayload(eventId: string): Promise<unknown | undefined> {
    const result = await this.#pool.query<{ payload: unknown }>(
      'SELECT payload FROM outbox_jobs WHERE job_key = $1',
      [`recovery-event:${eventId}`],
    );
    return result.rows[0]?.payload;
  }
}
