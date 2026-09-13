import {
  createOpenApiMockFetch,
  createDefaultMockState,
  type IntentResponse,
} from '@oneshot/contracts';

import { assertNoSensitiveFields } from './contract.js';

export type SettlementClientFailure =
  'INTENT_NOT_FOUND' | 'EVIDENCE_UNAVAILABLE' | 'UNAUTHORIZED' | 'TRANSPORT_UNAVAILABLE';

export class SettlementClientError extends Error {
  readonly failure: SettlementClientFailure;

  constructor(failure: SettlementClientFailure, message: string) {
    super(message);
    this.name = 'SettlementClientError';
    this.failure = failure;
  }
}

/**
 * The read seam this slice needs. It is deliberately read-only: there is no
 * submit, resend, or reconcile method, so no composition of this package can
 * introduce a settlement action through the client.
 */
export interface SettlementClient {
  readIntent(businessIntentId: string): Promise<IntentResponse>;
}

export interface SettlementHttpClientOptions {
  readonly baseUrl?: string;
  readonly getAuthToken?: () => string | null;
  readonly fetcher?: typeof fetch;
}

function failureForStatus(status: number): SettlementClientFailure {
  if (status === 404) return 'INTENT_NOT_FOUND';
  if (status === 401 || status === 403) return 'UNAUTHORIZED';
  if (status === 503) return 'EVIDENCE_UNAVAILABLE';
  return 'TRANSPORT_UNAVAILABLE';
}

/**
 * HTTP client for the frozen OpenAPI seam. It is used against the real API and
 * against the frozen mock server without change, because both serve the same
 * contract.
 */
export function createSettlementClient(
  options: SettlementHttpClientOptions = {},
): SettlementClient {
  const baseUrl = (options.baseUrl ?? '').replace(/\/+$/u, '');
  const fetcher = options.fetcher ?? globalThis.fetch;

  return {
    async readIntent(businessIntentId: string): Promise<IntentResponse> {
      const token = options.getAuthToken?.() ?? null;
      const headers: Record<string, string> = { accept: 'application/json' };
      if (token !== null && token !== '') {
        headers.authorization = `Bearer ${token}`;
      }

      let response: Response;
      try {
        response = await fetcher(`${baseUrl}/v1/intents/${encodeURIComponent(businessIntentId)}`, {
          headers,
        });
      } catch {
        throw new SettlementClientError(
          'TRANSPORT_UNAVAILABLE',
          'The OneShot API could not be reached.',
        );
      }

      if (!response.ok) {
        throw new SettlementClientError(
          failureForStatus(response.status),
          `The OneShot API returned status ${response.status}.`,
        );
      }

      const payload: unknown = await response.json();
      assertNoSensitiveFields(payload);
      return payload as IntentResponse;
    },
  };
}

/** Client bound to the frozen mock server published by `@oneshot/contracts`. */
export function createMockSettlementClient(
  options: { readonly baseUrl?: string } = {},
): SettlementClient {
  const fetcher = createOpenApiMockFetch(createDefaultMockState());
  const httpOptions: SettlementHttpClientOptions = {
    baseUrl: options.baseUrl ?? 'http://mock.local',
    fetcher,
  };
  return createSettlementClient(httpOptions);
}

/**
 * Deterministic client for component tests. It answers from an in-memory map
 * and needs no network, timers, or mock-server routing.
 */
export function createInMemorySettlementClient(
  intents: Readonly<Record<string, IntentResponse>>,
  failures: Readonly<Record<string, SettlementClientFailure>> = {},
): SettlementClient {
  return {
    readIntent(businessIntentId: string): Promise<IntentResponse> {
      const failure = failures[businessIntentId];
      if (failure !== undefined) {
        return Promise.reject(
          new SettlementClientError(failure, `Fixture client failure: ${failure}`),
        );
      }
      const intent = intents[businessIntentId];
      if (intent === undefined) {
        return Promise.reject(
          new SettlementClientError('INTENT_NOT_FOUND', 'No fixture for this Business Intent.'),
        );
      }
      return Promise.resolve(intent);
    },
  };
}
