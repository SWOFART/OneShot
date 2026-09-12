import type {
  ApprovePaidApiRequest,
  CreatePaidApiRequest,
  PaidApiQuote,
  PaidApiResponse,
  PreparePaidApiUserWalletRequest,
  SubmitPaidApiUserWalletRequest,
} from '@oneshot/contracts';
import type { ApiClientConfig } from './client.js';

async function responseJson<T>(response: Response): Promise<T | null> {
  if (!response.headers.get('content-type')?.includes('application/json')) return null;
  try {
    return (await response.json()) as T;
  } catch {
    return null;
  }
}

export class PaidApiClient {
  readonly #baseUrl: string;
  readonly #getAuthToken: () => string | null;
  readonly #fetch: typeof fetch;

  constructor(config: ApiClientConfig = {}) {
    this.#baseUrl = config.baseUrl ?? '';
    this.#getAuthToken = config.getAuthToken ?? (() => null);
    this.#fetch = config.fetchFn ?? fetch.bind(globalThis);
  }

  #headers(withJsonBody = false): HeadersInit {
    const token = this.#getAuthToken();
    return {
      ...(withJsonBody ? { 'content-type': 'application/json' } : {}),
      ...(token ? { authorization: `Bearer ${token}` } : {}),
    };
  }

  #jsonHeaders(): HeadersInit {
    return this.#headers(true);
  }

  async quote(request: CreatePaidApiRequest): Promise<PaidApiQuote> {
    const response = await this.#fetch(`${this.#baseUrl}/v1/paid-api/quote`, {
      method: 'POST',
      headers: this.#jsonHeaders(),
      body: JSON.stringify(request),
    });
    const body = await responseJson<PaidApiQuote>(response);
    if (!response.ok || !body) throw new Error('Could not load a live paid API quote');
    return body;
  }

  async start(request: ApprovePaidApiRequest): Promise<PaidApiResponse> {
    const response = await this.#fetch(`${this.#baseUrl}/v1/paid-api`, {
      method: 'POST',
      headers: this.#jsonHeaders(),
      body: JSON.stringify(request),
    });
    const body = await responseJson<PaidApiResponse>(response);
    if (!response.ok || !body) throw new Error('Could not approve the paid API request');
    return body;
  }

  async prepareUserWallet(request: PreparePaidApiUserWalletRequest): Promise<PaidApiResponse> {
    const response = await this.#fetch(`${this.#baseUrl}/v1/paid-api/user-wallet/prepare`, {
      method: 'POST',
      headers: this.#jsonHeaders(),
      body: JSON.stringify(request),
    });
    const body = await responseJson<PaidApiResponse>(response);
    if (!response.ok || !body)
      throw new Error('Could not prepare the user-wallet paid API request');
    return body;
  }

  async submitUserWalletPayment(
    businessIntentId: string,
    payerWallet: string,
    paymentPayload: SubmitPaidApiUserWalletRequest['payment_payload'],
  ): Promise<PaidApiResponse> {
    const response = await this.#fetch(
      `${this.#baseUrl}/v1/paid-api/${encodeURIComponent(businessIntentId)}/user-wallet/submit`,
      {
        method: 'POST',
        headers: this.#jsonHeaders(),
        body: JSON.stringify({ payer_wallet: payerWallet, payment_payload: paymentPayload }),
      },
    );
    const body = await responseJson<PaidApiResponse>(response);
    if (!response.ok || !body) throw new Error('Could not verify the user-wallet paid API payment');
    return body;
  }

  async get(businessIntentId: string): Promise<PaidApiResponse> {
    const response = await this.#fetch(
      `${this.#baseUrl}/v1/paid-api/${encodeURIComponent(businessIntentId)}`,
      { method: 'GET', headers: this.#headers() },
    );
    const body = await responseJson<PaidApiResponse>(response);
    if (!response.ok || !body) throw new Error('Could not refresh the paid API request');
    return body;
  }

  async reconcileUserWalletPayment(businessIntentId: string): Promise<PaidApiResponse> {
    const response = await this.#fetch(
      `${this.#baseUrl}/v1/paid-api/${encodeURIComponent(businessIntentId)}/user-wallet/reconcile`,
      { method: 'POST', headers: this.#headers() },
    );
    const body = await responseJson<PaidApiResponse>(response);
    if (!response.ok || !body)
      throw new Error('Could not reconcile the user-wallet paid API payment');
    return body;
  }
}
