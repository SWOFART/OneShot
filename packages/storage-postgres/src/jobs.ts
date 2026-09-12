import {
  asAtomicAmount,
  asEvmAddress,
  asTransactionHash,
  type ActivityResponse,
  type ActivityTransferView,
  parseCreateJobRequest,
  parseCreateUserWalletJobRequest,
  validateSupplierOrder,
  type DeliveryState,
  type JobView,
  type PaymentMode,
  type SettlementView,
  type SupplierOrder,
  type SupplierResult,
} from '@oneshot/contracts';
import {
  derivedBusinessIntentId,
  derivedJobId,
  fingerprintIntent,
  jobFingerprint,
  userWalletJobFingerprint,
} from '@oneshot/domain';
import type { Pool, PoolClient } from 'pg';

export interface JobLedgerDependencies {
  readonly now: () => Date;
  readonly nextAttemptId: () => string;
}

export type CreateJobResult =
  | { readonly kind: 'ACCEPTED'; readonly job: JobView }
  | { readonly kind: 'REPLAYED'; readonly job: JobView }
  | { readonly kind: 'TASK_PAYLOAD_CONFLICT'; readonly job: JobView };

interface JobRow {
  readonly job_id: string;
  readonly request_fingerprint: string;
  readonly task_key: string;
  readonly tool_id: 'team-report-v1';
  readonly business_intent_id: string;
  readonly supplier_order_reference: string;
  readonly supplier_quote: SupplierOrder;
  readonly delivery_state: DeliveryState;
  readonly delivery_attempt: number;
  readonly result_reference: string | null;
  readonly result_payload: SupplierResult | null;
  readonly payment_mode?: PaymentMode;
  readonly payer_wallet?: string | null;
  readonly payment_transaction_hash?: string | null;
  readonly created_at: Date;
  readonly updated_at: Date;
  readonly payment_state: JobView['payment_state'];
  readonly settlement_provider_reference_id?: string | null;
  readonly settlement_transaction_hash?: string | null;
  readonly settlement_block_number?: string | null;
  readonly settlement_transfer_log_index?: number | null;
}

function quoteForView(order: SupplierOrder) {
  return {
    supplier_id: order.supplier_id,
    order_reference: order.order_reference,
    recipient: order.recipient,
    amount_atomic: order.amount_atomic,
    asset: order.asset,
    network: order.network,
    expires_at: order.expires_at,
  };
}

function settlementForView(row: JobRow): SettlementView | undefined {
  if (
    !row.settlement_provider_reference_id ||
    !row.settlement_transaction_hash ||
    !row.settlement_block_number ||
    row.settlement_transfer_log_index === null ||
    row.settlement_transfer_log_index === undefined
  ) {
    return undefined;
  }
  return {
    provider_reference_id: row.settlement_provider_reference_id,
    transaction_hash: row.settlement_transaction_hash,
    block_number: row.settlement_block_number,
    transfer_log_index: row.settlement_transfer_log_index,
    explorer_url: `https://testnet.arcscan.app/tx/${row.settlement_transaction_hash}`,
  };
}

function asView(row: JobRow): JobView {
  const settlement = settlementForView(row);
  const paymentMode = row.payment_mode ?? 'SERVER_PRIVY';
  const userPayment =
    paymentMode === 'USER_WALLET' && row.payer_wallet
      ? {
          chain_id: 5042002 as const,
          network: 'eip155:5042002' as const,
          token_contract: '0x3600000000000000000000000000000000000000',
          payer_wallet: row.payer_wallet,
          recipient: row.supplier_quote.recipient,
          amount_atomic: row.supplier_quote.amount_atomic,
          ...(row.payment_transaction_hash
            ? { transaction_hash: row.payment_transaction_hash }
            : {}),
        }
      : undefined;
  return {
    job_id: row.job_id,
    task_key: row.task_key,
    tool_id: row.tool_id,
    business_intent_id: row.business_intent_id,
    supplier: quoteForView(row.supplier_quote),
    payment_state: row.payment_state,
    payment_mode: paymentMode,
    ...(userPayment ? { user_payment: userPayment } : {}),
    delivery_state: row.delivery_state,
    ...(settlement ? { settlement } : {}),
    ...(row.delivery_state === 'AVAILABLE' && row.result_payload
      ? { result: row.result_payload }
      : {}),
    created_at: row.created_at.toISOString(),
    updated_at: row.updated_at.toISOString(),
  };
}

interface ActivityTransferInput {
  readonly transaction_hash: string;
  readonly log_index: number;
  readonly recipient: string;
  readonly amount_atomic: string;
}

function parseActivityTransfers(payload: unknown): readonly ActivityTransferInput[] {
  if (typeof payload !== 'object' || payload === null || Array.isArray(payload)) {
    throw new Error('Stored Graph activity observation failed validation');
  }
  const transfers = (payload as Record<string, unknown>).transfers;
  if (!Array.isArray(transfers) || transfers.length > 100) {
    throw new Error('Stored Graph activity observation failed validation');
  }
  try {
    return transfers.map((entry) => {
      if (typeof entry !== 'object' || entry === null || Array.isArray(entry)) {
        throw new Error('invalid transfer');
      }
      const row = entry as Record<string, unknown>;
      const logIndex = row.log_index;
      if (typeof logIndex !== 'number' || !Number.isSafeInteger(logIndex) || logIndex < 0) {
        throw new Error('invalid log index');
      }
      return {
        transaction_hash: asTransactionHash(row.transaction_hash),
        log_index: logIndex,
        recipient: asEvmAddress(row.recipient),
        amount_atomic: asAtomicAmount(row.amount_atomic),
      };
    });
  } catch {
    throw new Error('Stored Graph activity observation failed validation');
  }
}

function activityTransferKey(transactionHash: string, logIndex: number): string {
  return `${transactionHash.toLowerCase()}:${logIndex}`;
}

/**
 * Owns the task-to-intent and delivery projection. It deliberately does not
 * grant settlement ownership: it atomically creates the existing intent/outbox
 * records and the job binding. Server-wallet jobs enter the ordinary worker
 * path; user-wallet jobs enter READY and can only be completed by the API after
 * an exact browser-submitted Arc receipt is verified.
 */
export class JobLedger {
  readonly #pool: Pool;
  readonly #dependencies: JobLedgerDependencies;

  constructor(pool: Pool, dependencies: JobLedgerDependencies) {
    this.#pool = pool;
    this.#dependencies = dependencies;
  }

  async createOrReplay(params: {
    readonly workspaceId: string;
    readonly request: unknown;
    readonly supplierOrder: SupplierOrder;
    readonly correlationId: string;
  }): Promise<CreateJobResult> {
    return this.#createOrReplay({ ...params, paymentMode: 'SERVER_PRIVY' });
  }

  async createUserWalletOrReplay(params: {
    readonly workspaceId: string;
    readonly request: unknown;
    readonly supplierOrder: SupplierOrder;
    readonly correlationId: string;
  }): Promise<CreateJobResult> {
    const request = parseCreateUserWalletJobRequest(params.request);
    const { payer_wallet: payerWallet, ...baseRequest } = request;
    return this.#createOrReplay({
      ...params,
      request: baseRequest,
      paymentMode: 'USER_WALLET',
      payerWallet,
    });
  }

  async #createOrReplay(params: {
    readonly workspaceId: string;
    readonly request: unknown;
    readonly supplierOrder: SupplierOrder;
    readonly correlationId: string;
    readonly paymentMode: PaymentMode;
    readonly payerWallet?: string;
  }): Promise<CreateJobResult> {
    const request = parseCreateJobRequest(params.request);
    const supplierOrder = validateSupplierOrder(params.supplierOrder);
    if (Date.parse(supplierOrder.expires_at) <= this.#dependencies.now().getTime()) {
      throw new Error('Supplier quote has expired; approval cannot silently change');
    }
    const jobId = derivedJobId(params.workspaceId, request);
    const businessIntentId = derivedBusinessIntentId(params.workspaceId, request);
    const supplierRequestFingerprint = jobFingerprint(request);
    const requestFingerprint =
      params.paymentMode === 'USER_WALLET'
        ? userWalletJobFingerprint(request, params.payerWallet)
        : jobFingerprint(request);
    const now = this.#dependencies.now();
    const client = await this.#pool.connect();
    try {
      await client.query('BEGIN');
      const existing = await this.#readJob(client, params.workspaceId, jobId, true);
      if (existing) {
        await client.query('COMMIT');
        return {
          kind:
            existing.request_fingerprint === requestFingerprint
              ? 'REPLAYED'
              : 'TASK_PAYLOAD_CONFLICT',
          job: asView(existing),
        };
      }

      if (supplierOrder.supplier_payload_fingerprint !== supplierRequestFingerprint) {
        throw new Error('Supplier order payload does not bind the approved task');
      }

      const intent = fingerprintIntent({
        business_intent_id: businessIntentId,
        recipient: supplierOrder.recipient,
        amount_atomic: supplierOrder.amount_atomic,
        asset: supplierOrder.asset,
        network: supplierOrder.network,
        purpose: `Team report: ${request.report_subject}`,
      });

      const insertedIntent = await client.query(
        `INSERT INTO business_intents (
          business_intent_id, payload_fingerprint, recipient, amount_atomic,
          asset, network, purpose, state, version, created_at, updated_at
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, 1, $9, $9)
        ON CONFLICT (business_intent_id) DO NOTHING`,
        [
          businessIntentId,
          intent.payload_fingerprint,
          intent.request.recipient,
          intent.request.amount_atomic,
          intent.request.asset,
          intent.request.network,
          intent.request.purpose,
          params.paymentMode === 'USER_WALLET' ? 'READY' : 'AUTHORIZING',
          now,
        ],
      );
      if (insertedIntent.rowCount !== 1) {
        const raced = await this.#readJob(client, params.workspaceId, jobId, true);
        if (raced) {
          await client.query('COMMIT');
          return {
            kind:
              raced.request_fingerprint === requestFingerprint
                ? 'REPLAYED'
                : 'TASK_PAYLOAD_CONFLICT',
            job: asView(raced),
          };
        }
        throw new Error(
          'Task identity is already bound without a resumable job; operator review required',
        );
      }
      await client.query(
        `INSERT INTO resumable_jobs (
          job_id, workspace_id, tool_id, task_key, request_fingerprint,
          business_intent_id, supplier_order_reference, supplier_quote,
          delivery_state, payment_mode, payer_wallet, created_at, updated_at
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8::jsonb, 'NOT_REQUESTED', $9, $10, $11, $11)`,
        [
          jobId,
          params.workspaceId,
          request.tool_id,
          request.task_key,
          requestFingerprint,
          businessIntentId,
          supplierOrder.order_reference,
          JSON.stringify(supplierOrder),
          params.paymentMode,
          params.payerWallet ?? null,
          now,
        ],
      );
      await client.query(
        `INSERT INTO attempts (
          attempt_id, business_intent_id, attempt_sequence, stage,
          correlation_id, request_body_fingerprint, token_contract,
          method, native_value_atomic, created_at
        ) VALUES ($1, $2, 1, $3, $4, $5,
                  '0x3600000000000000000000000000000000000000', 'transfer', '0', $6)`,
        [
          this.#dependencies.nextAttemptId(),
          businessIntentId,
          params.paymentMode === 'USER_WALLET' ? 'READY' : 'AUTHORIZING',
          params.correlationId,
          intent.payload_fingerprint,
          now,
        ],
      );
      if (params.paymentMode === 'SERVER_PRIVY') {
        await client.query(
          `INSERT INTO outbox_jobs (
            business_intent_id, job_key, task_identifier, payload, available_at, created_at
          ) VALUES ($1, $2, 'authorize_intent', $3::jsonb, $4, $4)`,
          [
            businessIntentId,
            `authorize:${businessIntentId}:1`,
            JSON.stringify({ business_intent_id: businessIntentId }),
            now,
          ],
        );
      }
      const created = await this.#readJob(client, params.workspaceId, jobId, false);
      await client.query('COMMIT');
      if (!created) throw new Error('Created job was not readable');
      return { kind: 'ACCEPTED', job: asView(created) };
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
  }

  async get(workspaceId: string, jobId: string): Promise<JobView | undefined> {
    const client = await this.#pool.connect();
    try {
      const row = await this.#readJob(client, workspaceId, jobId, false);
      return row ? asView(row) : undefined;
    } finally {
      client.release();
    }
  }

  async list(workspaceId: string, limit = 50): Promise<readonly JobView[]> {
    const bounded = Number.isSafeInteger(limit) && limit > 0 && limit <= 100 ? limit : 50;
    const result = await this.#pool.query<JobRow>(
      `${this.#selectJob()} WHERE j.workspace_id = $1 ORDER BY j.updated_at DESC LIMIT $2`,
      [workspaceId, bounded],
    );
    return result.rows.map(asView);
  }

  /** Queue only supplier delivery/retrieval after a known committed payment. */
  async resumeDelivery(workspaceId: string, jobId: string): Promise<JobView | undefined> {
    const client = await this.#pool.connect();
    try {
      await client.query('BEGIN');
      const job = await this.#readJob(client, workspaceId, jobId, true);
      if (!job) {
        await client.query('COMMIT');
        return undefined;
      }
      if (
        job.payment_state === 'COMMITTED' &&
        (job.delivery_state === 'NOT_REQUESTED' || job.delivery_state === 'RETRIEVAL_FAILED')
      ) {
        const now = this.#dependencies.now();
        const resumed = await client.query<{ delivery_attempt: number }>(
          `UPDATE resumable_jobs
           SET delivery_state = 'PENDING', delivery_attempt = delivery_attempt + 1, updated_at = $1
           WHERE job_id = $2 AND delivery_state IN ('NOT_REQUESTED', 'RETRIEVAL_FAILED')
           RETURNING delivery_attempt`,
          [now, jobId],
        );
        const deliveryAttempt = resumed.rows[0]?.delivery_attempt;
        if (deliveryAttempt === undefined) {
          throw new Error('Delivery retry was not claimed; operator review required');
        }
        await client.query(
          `INSERT INTO outbox_jobs (
             business_intent_id, job_key, task_identifier, payload, available_at, created_at
           ) VALUES ($1, $2, 'fulfill_supplier_order', $3::jsonb, $4, $4)
           ON CONFLICT (job_key) DO NOTHING`,
          [
            job.business_intent_id,
            `fulfill:${jobId}:${job.supplier_order_reference}:${deliveryAttempt}`,
            JSON.stringify({ job_id: jobId, delivery_attempt: deliveryAttempt }),
            now,
          ],
        );
      }
      const updated = await this.#readJob(client, workspaceId, jobId, false);
      await client.query('COMMIT');
      return updated ? asView(updated) : undefined;
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
  }

  async deliveryWork(
    jobId: string,
    deliveryAttempt: number,
  ): Promise<{ readonly orderReference: string } | undefined> {
    const result = await this.#pool.query<{
      supplier_order_reference: string;
      delivery_state: DeliveryState;
      state: string;
    }>(
      `SELECT j.supplier_order_reference, j.delivery_state, i.state
       FROM resumable_jobs j JOIN business_intents i ON i.business_intent_id = j.business_intent_id
       WHERE j.job_id = $1 AND j.delivery_attempt = $2`,
      [jobId, deliveryAttempt],
    );
    const row = result.rows[0];
    return row?.state === 'COMMITTED' && row.delivery_state === 'PENDING'
      ? { orderReference: row.supplier_order_reference }
      : undefined;
  }

  async completeDelivery(
    jobId: string,
    deliveryAttempt: number,
    result: SupplierResult,
  ): Promise<void> {
    await this.#pool.query(
      `UPDATE resumable_jobs SET delivery_state = 'AVAILABLE', result_reference = $1,
       result_payload = $2::jsonb, updated_at = $3
       WHERE job_id = $4 AND delivery_state = 'PENDING' AND delivery_attempt = $5`,
      [
        result.result_reference,
        JSON.stringify(result),
        this.#dependencies.now(),
        jobId,
        deliveryAttempt,
      ],
    );
  }

  async failDelivery(jobId: string, deliveryAttempt: number): Promise<void> {
    await this.#pool.query(
      `UPDATE resumable_jobs SET delivery_state = 'RETRIEVAL_FAILED', updated_at = $1
       WHERE job_id = $2 AND delivery_state = 'PENDING' AND delivery_attempt = $3`,
      [this.#dependencies.now(), jobId, deliveryAttempt],
    );
  }

  async recordActivityObservation(params: {
    readonly workspaceId: string;
    readonly freshness: 'FRESH' | 'LAGGING' | 'UNHEALTHY' | 'UNAVAILABLE' | 'UNKNOWN_FRESHNESS';
    readonly coverageNote: string;
    readonly payload: unknown;
  }): Promise<void> {
    parseActivityTransfers(params.payload);
    await this.#pool.query(
      `INSERT INTO wallet_activity_observations (
        workspace_id, source, freshness, coverage_note, observed_at, payload
      ) VALUES ($1, 'THE_GRAPH', $2, $3, $4, $5::jsonb)`,
      [
        params.workspaceId,
        params.freshness,
        params.coverageNote,
        this.#dependencies.now(),
        JSON.stringify(params.payload),
      ],
    );
  }

  async activity(workspaceId: string): Promise<ActivityResponse> {
    const [observation, settlements, uncertain, recordedTransfers] = await Promise.all([
      this.#pool.query<{
        freshness: string;
        coverage_note: string;
        observed_at: Date;
        payload: unknown;
      }>(
        `SELECT freshness, coverage_note, observed_at, payload FROM wallet_activity_observations
         WHERE workspace_id = $1 ORDER BY observation_id DESC LIMIT 1`,
        [workspaceId],
      ),
      this.#pool.query<{ count: string }>(
        `SELECT count(*)::text AS count FROM (
           SELECT j.business_intent_id FROM resumable_jobs j
           JOIN settlements s ON s.business_intent_id = j.business_intent_id
           WHERE j.workspace_id = $1
           UNION ALL
           SELECT p.business_intent_id FROM paid_api_requests p
           JOIN settlements s ON s.business_intent_id = p.business_intent_id
           WHERE p.workspace_id = $1
         ) recorded`,
        [workspaceId],
      ),
      this.#pool.query<{ count: string }>(
        `SELECT count(*)::text AS count FROM (
           SELECT j.business_intent_id FROM resumable_jobs j
           JOIN business_intents i ON i.business_intent_id = j.business_intent_id
           WHERE j.workspace_id = $1 AND i.state = 'UNKNOWN'
           UNION ALL
           SELECT p.business_intent_id FROM paid_api_requests p
           JOIN business_intents i ON i.business_intent_id = p.business_intent_id
           WHERE p.workspace_id = $1 AND i.state = 'UNKNOWN'
         ) uncertain`,
        [workspaceId],
      ),
      this.#pool.query<{
        transaction_hash: string;
        transfer_log_index: number;
        job_id: string;
      }>(
        `SELECT s.transaction_hash, s.transfer_log_index, j.job_id
         FROM settlements s
         JOIN resumable_jobs j ON j.business_intent_id = s.business_intent_id
         WHERE j.workspace_id = $1
         UNION ALL
         SELECT s.transaction_hash, s.transfer_log_index, p.business_intent_id AS job_id
         FROM settlements s
         JOIN paid_api_requests p ON p.business_intent_id = s.business_intent_id
         WHERE p.workspace_id = $1`,
        [workspaceId],
      ),
    ]);
    const row = observation.rows[0];
    const indexedTransfers = row ? parseActivityTransfers(row.payload) : [];
    const recordedByTransfer = new Map(
      recordedTransfers.rows.map((settlement) => [
        activityTransferKey(settlement.transaction_hash, settlement.transfer_log_index),
        settlement.job_id,
      ]),
    );
    const transfers: readonly ActivityTransferView[] = indexedTransfers.map((transfer) => {
      const jobId = recordedByTransfer.get(
        activityTransferKey(transfer.transaction_hash, transfer.log_index),
      );
      return {
        ...transfer,
        match: jobId ? 'RECORDED_SETTLEMENT' : 'UNMATCHED',
        ...(jobId ? { job_id: jobId } : {}),
      };
    });
    return {
      ...(row ? { observation: { ...row, observed_at: row.observed_at.toISOString() } } : {}),
      recorded_settlement_count: Number(settlements.rows[0]?.count ?? '0'),
      uncertain_job_count: Number(uncertain.rows[0]?.count ?? '0'),
      unmatched_transfer_count: transfers.filter((transfer) => transfer.match === 'UNMATCHED')
        .length,
      transfers,
    };
  }

  #selectJob(): string {
    return `SELECT j.job_id, j.request_fingerprint, j.task_key, j.tool_id, j.business_intent_id,
      j.supplier_order_reference, j.supplier_quote, j.delivery_state, j.delivery_attempt,
      j.result_reference, j.result_payload, j.payment_mode, j.payer_wallet,
      j.payment_transaction_hash,
      j.created_at, j.updated_at, i.state AS payment_state,
      s.provider_reference_id AS settlement_provider_reference_id,
      s.transaction_hash AS settlement_transaction_hash,
      s.block_number AS settlement_block_number,
      s.transfer_log_index AS settlement_transfer_log_index
      FROM resumable_jobs j
      JOIN business_intents i ON i.business_intent_id = j.business_intent_id
      LEFT JOIN settlements s ON s.business_intent_id = j.business_intent_id`;
  }

  async #readJob(
    client: PoolClient,
    workspaceId: string,
    jobId: string,
    lock: boolean,
  ): Promise<JobRow | undefined> {
    const result = await client.query<JobRow>(
      `${this.#selectJob()} WHERE j.workspace_id = $1 AND j.job_id = $2${lock ? ' FOR UPDATE OF j' : ''}`,
      [workspaceId, jobId],
    );
    return result.rows[0];
  }
}
