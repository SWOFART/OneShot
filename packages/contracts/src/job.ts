import { asAtomicAmount } from './money.js';
import { asEvmAddress, ContractValidationError } from './ids.js';
import type {
  CreateJobRequest,
  DeliveryState,
  IntentState,
  SupplierQuote,
  SupplierResult,
} from './generated/api-types.js';

export interface SupplierOrder extends SupplierQuote {
  readonly supplier_payload_fingerprint: string;
}

export interface SupplierPort {
  createOrder(request: CreateJobRequest, idempotencyKey: string): Promise<SupplierOrder>;
  fulfillOrder(orderReference: string): Promise<SupplierResult>;
  getResult(orderReference: string): Promise<SupplierResult | null>;
}

export interface JobView {
  readonly job_id: string;
  readonly task_key: string;
  readonly tool_id: 'team-report-v1';
  readonly business_intent_id: string;
  readonly supplier: SupplierQuote;
  readonly payment_state: IntentState;
  readonly delivery_state: DeliveryState;
  readonly result?: SupplierResult;
  readonly created_at: string;
  readonly updated_at: string;
}

function boundedText(value: unknown, field: string, maximum: number): string {
  if (typeof value !== 'string' || value.length === 0 || value.length > maximum) {
    throw new ContractValidationError(
      `${field} must be a non-empty string of at most ${maximum} characters`,
    );
  }
  // eslint-disable-next-line no-control-regex -- Contract input rejects ASCII controls.
  if (value.trim() !== value || /[\u0000-\u001f\u007f]/u.test(value)) {
    throw new ContractValidationError(
      `${field} contains forbidden whitespace or control characters`,
    );
  }
  return value.normalize('NFC');
}

export function parseCreateJobRequest(value: unknown): CreateJobRequest {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    throw new ContractValidationError('job request must be an object');
  }
  const candidate = value as Record<string, unknown>;
  const keys = Object.keys(candidate).sort();
  const expected = ['report_subject', 'task_key', 'tool_id'];
  if (keys.length !== expected.length || keys.some((key, index) => key !== expected[index])) {
    throw new ContractValidationError('job request has missing or unexpected fields');
  }
  if (candidate.tool_id !== 'team-report-v1') {
    throw new ContractValidationError('tool_id is not supported');
  }
  return {
    task_key: boundedText(candidate.task_key, 'task_key', 128),
    tool_id: 'team-report-v1',
    report_subject: boundedText(candidate.report_subject, 'report_subject', 256),
  };
}

export function canonicalJobPayload(request: CreateJobRequest): string {
  const parsed = parseCreateJobRequest(request);
  return JSON.stringify({
    task_key: parsed.task_key,
    tool_id: parsed.tool_id,
    report_subject: parsed.report_subject,
  });
}

export function validateSupplierOrder(order: SupplierOrder): SupplierOrder {
  const reference = boundedText(order.order_reference, 'supplier order_reference', 128);
  const expiresAt = boundedText(order.expires_at, 'supplier expires_at', 64);
  if (!Number.isFinite(Date.parse(expiresAt))) {
    throw new ContractValidationError('supplier expires_at must be an ISO date');
  }
  if (
    order.supplier_id !== 'team-report-v1' ||
    order.asset !== 'USDC' ||
    order.network !== 'eip155:5042002'
  ) {
    throw new ContractValidationError(
      'supplier quote is incompatible with the enabled tool and network',
    );
  }
  if (!/^[0-9a-f]{64}$/u.test(order.supplier_payload_fingerprint)) {
    throw new ContractValidationError('supplier_payload_fingerprint must be a SHA-256 digest');
  }
  return {
    ...order,
    order_reference: reference,
    recipient: asEvmAddress(order.recipient),
    amount_atomic: asAtomicAmount(order.amount_atomic),
    expires_at: expiresAt,
  };
}
