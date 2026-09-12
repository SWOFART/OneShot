import type {
  ApprovePaidApiRequest,
  CreatePaidApiRequest,
  PaidApiQuote,
  PaidApiResponse,
  PreparePaidApiUserWalletRequest,
  SubmitPaidApiUserWalletRequest,
} from '@oneshot/contracts';
import type { ApiClientConfig } from './client.js';

const CIRCLE_AUTHORIZATION_REFUSED_MESSAGE =
  'The Circle authorization is no longer valid. No payment was sent; sign a fresh authorization.';

export class PaidApiUserWalletSubmissionError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'PaidApiUserWalletSubmissionError';
  }
}

async function responseJson<T>(response: Response): Promise<T | null> {
  if (!response.headers.get('content-type')?.includes('application/json')) return null;
  try {
    return (await response.json()) as T;
  } catch {
    return null;
  }
}

function submitErrorMessage(body: unknown): string {
  if (
    body !== null &&
    typeof body === 'object' &&
    'code' in body &&
    body.code === 'INVALID_REQUEST' &&
    'message' in body &&
    body.message === CIRCLE_AUTHORIZATION_REFUSED_MESSAGE
  ) {
    return body.message;
  }
  return 'Could not verify the user-wallet paid API payment';
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
    const body = await responseJson<unknown>(response);
    if (!response.ok) {
      throw new PaidApiUserWalletSubmissionError(submitErrorMessage(body));
    }
    if (!body)
      throw new PaidApiUserWalletSubmissionError(
        'Could not verify the user-wallet paid API payment',
      );
    return body as PaidApiResponse;
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
