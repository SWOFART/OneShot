import type { CreatePaidApiRequest, PaidApiQuote, PaidApiResponse } from '@oneshot/contracts';
import { fetchCircleX402Quote, type CircleX402Quote } from '@oneshot/supplier-adapter';
import type {
  CreatePaidApiResult,
  IntentLedger,
  PaidApiQuoteSnapshot,
} from '@oneshot/storage-postgres';

export interface PaidApiService {
  quote(request: CreatePaidApiRequest): Promise<PaidApiQuote>;
  start(request: CreatePaidApiRequest, correlationId: string): Promise<CreatePaidApiResult>;
  get(businessIntentId: string): Promise<PaidApiResponse | undefined>;
}

function publicQuote(quote: CircleX402Quote): PaidApiQuote {
  return {
    supplier_id: 'circle-x402-v1',
    resource_url: quote.resourceUrl,
    recipient: quote.requirements.payTo,
    amount_atomic: quote.requirements.amount,
    asset: 'USDC',
    network: 'eip155:5042002',
    x402_version: quote.x402Version,
    max_timeout_seconds: quote.requirements.maxTimeoutSeconds,
  };
}

export class CircleX402PaidApiService implements PaidApiService {
  readonly #ledger: IntentLedger;
  readonly #workspaceId: string;
  readonly #url: string;
  readonly #maxAmountAtomic: bigint;
  readonly #fetch: typeof fetch | undefined;

  constructor(options: {
    readonly ledger: IntentLedger;
    readonly workspaceId: string;
    readonly url: string;
    readonly maxAmountAtomic: bigint;
    readonly fetchFn?: typeof fetch;
  }) {
    this.#ledger = options.ledger;
    this.#workspaceId = options.workspaceId;
    this.#url = options.url;
    this.#maxAmountAtomic = options.maxAmountAtomic;
    this.#fetch = options.fetchFn;
  }

  async #quote(): Promise<CircleX402Quote> {
    return fetchCircleX402Quote(this.#url, {
      maxAmountAtomic: this.#maxAmountAtomic,
      ...(this.#fetch ? { fetchFn: this.#fetch } : {}),
    });
  }

  async quote(): Promise<PaidApiQuote> {
    return publicQuote(await this.#quote());
  }

  async start(request: CreatePaidApiRequest, correlationId: string): Promise<CreatePaidApiResult> {
    const quote = await this.#quote();
    const snapshot: PaidApiQuoteSnapshot = {
      resourceUrl: quote.resourceUrl,
      x402Version: quote.x402Version,
      maxTimeoutSeconds: quote.requirements.maxTimeoutSeconds,
      recipient: quote.requirements.payTo,
      amountAtomic: quote.requirements.amount,
      quotePayload: quote,
    };
    return this.#ledger.createPaidApiOrReplay({
      workspaceId: this.#workspaceId,
      request,
      quote: snapshot,
      correlationId,
    });
  }

  async get(businessIntentId: string): Promise<PaidApiResponse | undefined> {
    return this.#ledger.getPaidApi(this.#workspaceId, businessIntentId);
  }
}

export function createCircleX402PaidApiService(options: {
  readonly ledger: IntentLedger;
  readonly workspaceId: string;
  readonly url: string;
  readonly maxAmountAtomic: bigint;
  readonly fetchFn?: typeof fetch;
}): PaidApiService {
  return new CircleX402PaidApiService(options);
}
