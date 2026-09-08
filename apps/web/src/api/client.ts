import type {
  CreateIntentRequest,
  ErrorResponse,
  IntentResponse,
  ReconcileResponse,
} from '@oneshot/contracts';

export interface ApiClientConfig {
  readonly baseUrl?: string;
  readonly getAuthToken?: () => string | null;
  readonly fetchFn?: typeof fetch;
}

export type CreateIntentResult =
  | { readonly kind: 'ACCEPTED'; readonly intent: IntentResponse; readonly correlationId: string }
  | { readonly kind: 'REPLAYED'; readonly intent: IntentResponse; readonly correlationId: string }
  | { readonly kind: 'PAYLOAD_CONFLICT'; readonly message: string; readonly correlationId: string }
  | { readonly kind: 'UNAUTHORIZED'; readonly message: string; readonly correlationId: string }
  | { readonly kind: 'RATE_LIMITED'; readonly message: string; readonly correlationId: string }
  | { readonly kind: 'NOT_READY'; readonly message: string; readonly correlationId: string }
  | {
      readonly kind: 'ERROR';
      readonly code: string;
      readonly message: string;
      readonly correlationId: string;
    };

export type GetIntentResult =
  | { readonly kind: 'SUCCESS'; readonly intent: IntentResponse; readonly correlationId: string }
  | { readonly kind: 'NOT_FOUND'; readonly correlationId: string }
  | { readonly kind: 'UNAUTHORIZED'; readonly message: string; readonly correlationId: string }
  | {
      readonly kind: 'ERROR';
      readonly code: string;
      readonly message: string;
      readonly correlationId: string;
    };

export type ReconcileResult =
  | {
      readonly kind: 'QUEUED';
      readonly response: ReconcileResponse;
      readonly correlationId: string;
    }
  | { readonly kind: 'NOT_ALLOWED'; readonly message: string; readonly correlationId: string }
  | { readonly kind: 'NOT_FOUND'; readonly correlationId: string }
  | { readonly kind: 'ERROR'; readonly message: string; readonly correlationId: string };

export type ReadinessResult =
  | { readonly status: 'ok'; readonly submissions_disabled?: boolean }
  | { readonly status: 'not_ready'; readonly message: string };

async function parseJsonResponse<T>(res: Response): Promise<T | null> {
  const contentType = res.headers.get('content-type') ?? '';
  if (!contentType.includes('application/json')) {
    return null;
  }
  try {
    return (await res.json()) as T;
  } catch {
    return null;
  }
}

export class OneShotApiClient {
  private readonly baseUrl: string;
  private readonly getAuthToken: () => string | null;
  private readonly fetchFn: typeof fetch;

  constructor(config?: ApiClientConfig) {
    this.baseUrl = config?.baseUrl ?? '';
    this.getAuthToken = config?.getAuthToken ?? (() => null);
    this.fetchFn = config?.fetchFn ?? fetch.bind(globalThis);
  }

  private buildHeaders(customCorrelationId?: string): HeadersInit {
    const headers: Record<string, string> = {
      'content-type': 'application/json',
      'x-correlation-id': customCorrelationId ?? crypto.randomUUID(),
    };
    const token = this.getAuthToken();
    if (token) {
      headers.authorization = `Bearer ${token}`;
    }
    return headers;
  }

  async createOrReplayIntent(
    request: CreateIntentRequest,
    correlationId?: string,
  ): Promise<CreateIntentResult> {
    const headers = this.buildHeaders(correlationId);
    const corrId = (headers as Record<string, string>)['x-correlation-id'] ?? '';

    try {
      const res = await this.fetchFn(`${this.baseUrl}/v1/intents`, {
        method: 'POST',
        headers,
        body: JSON.stringify(request),
      });

      if (res.status === 202) {
        const intent = await parseJsonResponse<IntentResponse>(res);
        if (!intent) {
          return {
            kind: 'ERROR',
            code: 'INVALID_RESPONSE',
            message: 'Backend returned non-JSON response',
            correlationId: corrId,
          };
        }
        return { kind: 'ACCEPTED', intent, correlationId: corrId };
      }

      if (res.status === 200) {
        const intent = await parseJsonResponse<IntentResponse>(res);
        if (!intent) {
          return {
            kind: 'ERROR',
            code: 'INVALID_RESPONSE',
            message: 'Backend returned non-JSON response',
            correlationId: corrId,
          };
        }
        return { kind: 'REPLAYED', intent, correlationId: corrId };
      }

      const err = (await parseJsonResponse<Partial<ErrorResponse>>(res)) ?? {};
      const message =
        err.message ??
        (res.status === 502 || res.status === 503 || res.status === 504
          ? 'Backend unavailable'
          : 'Unknown error');

      if (res.status === 409 && err.code === 'INTENT_PAYLOAD_CONFLICT') {
        return { kind: 'PAYLOAD_CONFLICT', message, correlationId: corrId };
      }

      if (res.status === 401 || res.status === 403) {
        return { kind: 'UNAUTHORIZED', message, correlationId: corrId };
      }

      if (res.status === 429) {
        return { kind: 'RATE_LIMITED', message, correlationId: corrId };
      }

      if (res.status === 503) {
        return { kind: 'NOT_READY', message, correlationId: corrId };
      }

      return {
        kind: 'ERROR',
        code: err.code ?? 'UNKNOWN_ERROR',
        message,
        correlationId: corrId,
      };
    } catch (e) {
      return {
        kind: 'ERROR',
        code: 'NETWORK_ERROR',
        message: e instanceof Error ? e.message : 'Network request failed',
        correlationId: corrId,
      };
    }
  }

  async getIntent(id: string, correlationId?: string): Promise<GetIntentResult> {
    const headers = this.buildHeaders(correlationId);
    const corrId = (headers as Record<string, string>)['x-correlation-id'] ?? '';

    try {
      const res = await this.fetchFn(`${this.baseUrl}/v1/intents/${encodeURIComponent(id)}`, {
        method: 'GET',
        headers,
      });

      if (res.status === 200) {
        const intent = await parseJsonResponse<IntentResponse>(res);
        if (!intent) {
          return {
            kind: 'ERROR',
            code: 'INVALID_RESPONSE',
            message: 'Backend returned non-JSON response',
            correlationId: corrId,
          };
        }
        return { kind: 'SUCCESS', intent, correlationId: corrId };
      }

      if (res.status === 404) {
        return { kind: 'NOT_FOUND', correlationId: corrId };
      }

      const err = (await parseJsonResponse<Partial<ErrorResponse>>(res)) ?? {};
      const message = err.message ?? `Request failed with status ${res.status}`;

      if (res.status === 401 || res.status === 403) {
        return { kind: 'UNAUTHORIZED', message, correlationId: corrId };
      }

      return {
        kind: 'ERROR',
        code: err.code ?? 'UNKNOWN_ERROR',
        message,
        correlationId: corrId,
      };
    } catch (e) {
      return {
        kind: 'ERROR',
        code: 'NETWORK_ERROR',
        message: e instanceof Error ? e.message : 'Network request failed',
        correlationId: corrId,
      };
    }
  }

  async reconcileIntent(id: string, correlationId?: string): Promise<ReconcileResult> {
    const headers = this.buildHeaders(correlationId);
    const corrId = (headers as Record<string, string>)['x-correlation-id'] ?? '';

    try {
      const res = await this.fetchFn(
        `${this.baseUrl}/v1/intents/${encodeURIComponent(id)}/reconcile`,
        {
          method: 'POST',
          headers,
        },
      );

      if (res.status === 202) {
        const response = await parseJsonResponse<ReconcileResponse>(res);
        if (!response) {
          return {
            kind: 'ERROR',
            message: 'Backend returned non-JSON response',
            correlationId: corrId,
          };
        }
        return { kind: 'QUEUED', response, correlationId: corrId };
      }

      if (res.status === 404) {
        return { kind: 'NOT_FOUND', correlationId: corrId };
      }

      const err = (await parseJsonResponse<Partial<ErrorResponse>>(res)) ?? {};
      const message =
        err.message ??
        (res.status === 409
          ? 'Reconciliation not allowed'
          : `Request failed with status ${res.status}`);

      if (res.status === 409) {
        return { kind: 'NOT_ALLOWED', message, correlationId: corrId };
      }

      return { kind: 'ERROR', message, correlationId: corrId };
    } catch (e) {
      return {
        kind: 'ERROR',
        message: e instanceof Error ? e.message : 'Network error',
        correlationId: corrId,
      };
    }
  }

  async getReadiness(): Promise<ReadinessResult> {
    try {
      const res = await this.fetchFn(`${this.baseUrl}/health/ready`, {
        method: 'GET',
      });

      if (res.status === 200) {
        const body = await parseJsonResponse<{
          status: 'ok';
          submissions_disabled?: boolean;
        }>(res);
        if (!body || body.status !== 'ok') {
          return {
            status: 'not_ready',
            message: 'Backend unavailable (HTML or invalid response received)',
          };
        }
        return {
          status: 'ok',
          ...(body.submissions_disabled !== undefined
            ? { submissions_disabled: body.submissions_disabled }
            : {}),
        };
      }

      const err = (await parseJsonResponse<Partial<ErrorResponse>>(res)) ?? {};
      return { status: 'not_ready', message: err.message ?? `Service not ready (${res.status})` };
    } catch (e) {
      return {
        status: 'not_ready',
        message: e instanceof Error ? e.message : 'Readiness check failed',
      };
    }
  }
}
