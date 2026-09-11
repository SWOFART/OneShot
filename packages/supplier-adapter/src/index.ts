import { createHash } from 'node:crypto';
import {
  asAtomicAmount,
  asEvmAddress,
  parseCreateJobRequest,
  type CreateJobRequest,
  type SupplierOrder,
  type SupplierPort,
  type SupplierResult,
} from '@oneshot/contracts';
import { jobFingerprint } from '@oneshot/domain';

const DEFAULT_REPORT_RECIPIENT = '0x1111111111111111111111111111111111111111';
const DEFAULT_REPORT_PRICE_ATOMIC = '2500000';

export interface TeamReportSupplierOptions {
  /** Destination must also be present in the worker Privy recipient allowlist. */
  readonly recipient?: string;
  /** USDC atomic units; never use a decimal or floating-point value here. */
  readonly amountAtomic?: string;
}

function reference(prefix: string, value: string): string {
  return `${prefix}_${createHash('sha256').update(value, 'utf8').digest('hex').slice(0, 48)}`;
}

/**
 * A deliberately labelled team-operated testnet supplier. Its order and result
 * identifiers are deterministic from the caller idempotency key, so retries
 * and replacement workers reach the same non-chargeable order and result.
 * Replace this adapter only with a supplier that proves equivalent semantics.
 */
export class TeamReportSupplier implements SupplierPort {
  readonly name = 'TeamReportSupplier';
  readonly #recipient: string;
  readonly #amountAtomic: string;
  #orders = new Map<
    string,
    { request: CreateJobRequest; order: SupplierOrder; result?: SupplierResult }
  >();

  constructor(options: TeamReportSupplierOptions = {}) {
    this.#recipient = asEvmAddress(options.recipient ?? DEFAULT_REPORT_RECIPIENT);
    this.#amountAtomic = asAtomicAmount(options.amountAtomic ?? DEFAULT_REPORT_PRICE_ATOMIC);
    if (this.#amountAtomic === '0') {
      throw new Error('Team report supplier amount must be greater than zero');
    }
  }

  async createOrder(value: CreateJobRequest, idempotencyKey: string): Promise<SupplierOrder> {
    const request = parseCreateJobRequest(value);
    const existing = this.#orders.get(idempotencyKey);
    if (existing) return existing.order;
    const orderReference = reference('team_report_order', idempotencyKey);
    const order: SupplierOrder = {
      supplier_id: 'team-report-v1',
      order_reference: orderReference,
      recipient: this.#recipient,
      amount_atomic: this.#amountAtomic,
      asset: 'USDC',
      network: 'eip155:5042002',
      expires_at: new Date(Date.now() + 15 * 60_000).toISOString(),
      supplier_payload_fingerprint: jobFingerprint(request),
    };
    this.#orders.set(idempotencyKey, { request, order });
    return order;
  }

  async fulfillOrder(orderReference: string): Promise<SupplierResult> {
    const entry = [...this.#orders.values()].find(
      (candidate) => candidate.order.order_reference === orderReference,
    );
    if (!entry && !/^team_report_order_[0-9a-f]{48}$/u.test(orderReference)) {
      throw new Error('Supplier order was not found');
    }
    if (entry && !entry.result) {
      const resultReference = reference('team_report_result', orderReference);
      entry.result = {
        order_reference: orderReference,
        result_reference: resultReference,
        report: `Testnet company-data report prepared for ${entry.request.report_subject}.`,
      };
    }
    return (
      entry?.result ?? {
        order_reference: orderReference,
        result_reference: reference('team_report_result', orderReference),
        report:
          'Team-operated testnet company-data report retrieved from the original supplier order.',
      }
    );
  }

  async getResult(orderReference: string): Promise<SupplierResult | null> {
    const entry = [...this.#orders.values()].find(
      (candidate) => candidate.order.order_reference === orderReference,
    );
    return entry?.result ?? null;
  }
}
