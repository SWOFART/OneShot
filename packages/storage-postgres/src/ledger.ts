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
  type SettlementView,
} from '@oneshot/contracts';
import { fingerprintIntent } from '@oneshot/domain';
import type { Pool, PoolClient } from 'pg';

export interface LedgerDependencies {
  readonly now: () => Date;
  readonly nextAttemptId: () => string;
}

export type CreateIntentResult =
  | { readonly kind: 'ACCEPTED'; readonly intent: IntentResponse }
  | { readonly kind: 'REPLAY_IDENTICAL'; readonly intent: IntentResponse }
  | { readonly kind: 'INTENT_PAYLOAD_CONFLICT'; readonly intent: IntentResponse };

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
    const [attemptResult, settlementResult, evidenceResult] = await Promise.all([
      client.query<AttemptRow>(
        `SELECT attempt_id, stage, created_at, sanitized_error
        FROM (
          SELECT attempt_id, stage, created_at, sanitized_error, attempt_sequence
          FROM attempts WHERE business_intent_id = $1
          ORDER BY attempt_sequence DESC LIMIT $2
        ) bounded ORDER BY attempt_sequence ASC`,
        [id, attemptLimit],
      ),
      client.query<SettlementRow>(
        `SELECT provider_reference_id, transaction_hash, block_number, transfer_log_index
        FROM settlements WHERE business_intent_id = $1`,
        [id],
      ),
      client.query<EvidenceRow>(
        `SELECT source, authority_class, retrieved_at, digest, block_number, freshness
        FROM (
          SELECT evidence_id, source, authority_class, retrieved_at, digest,
            block_number, freshness
          FROM evidence_observations WHERE business_intent_id = $1
          ORDER BY evidence_id DESC LIMIT $2
        ) bounded ORDER BY evidence_id ASC`,
        [id, evidenceLimit],
      ),
    ]);

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
}
