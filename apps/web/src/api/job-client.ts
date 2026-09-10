import type {
  CreateJobRequest,
  JobListResponse,
  JobView,
  SupplierResult,
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

export class JobApiClient {
  readonly #baseUrl: string;
  readonly #getAuthToken: () => string | null;
  readonly #fetch: typeof fetch;

  constructor(config: ApiClientConfig = {}) {
    this.#baseUrl = config.baseUrl ?? '';
    this.#getAuthToken = config.getAuthToken ?? (() => null);
    this.#fetch = config.fetchFn ?? fetch.bind(globalThis);
  }

  #headers(): HeadersInit {
    const token = this.#getAuthToken();
    return {
      'content-type': 'application/json',
      ...(token ? { authorization: `Bearer ${token}` } : {}),
    };
  }

  async list(): Promise<readonly JobView[]> {
    const response = await this.#fetch(`${this.#baseUrl}/v1/jobs`, { headers: this.#headers() });
    return response.ok ? ((await responseJson<JobListResponse>(response))?.jobs ?? []) : [];
  }

  async start(request: CreateJobRequest): Promise<JobView> {
    const response = await this.#fetch(`${this.#baseUrl}/v1/jobs`, {
      method: 'POST',
      headers: this.#headers(),
      body: JSON.stringify(request),
    });
    const body = await responseJson<JobView>(response);
    if (!response.ok || !body) throw new Error('Could not start the approved job');
    return body;
  }

  async resume(jobId: string): Promise<JobView> {
    const response = await this.#fetch(
      `${this.#baseUrl}/v1/jobs/${encodeURIComponent(jobId)}/resume`,
      {
        method: 'POST',
        headers: this.#headers(),
      },
    );
    const body = await responseJson<JobView>(response);
    if (!response.ok || !body) throw new Error('Could not resume supplier delivery');
    return body;
  }

  async result(jobId: string): Promise<SupplierResult | null> {
    const response = await this.#fetch(
      `${this.#baseUrl}/v1/jobs/${encodeURIComponent(jobId)}/result`,
      { headers: this.#headers() },
    );
    return response.ok ? await responseJson<SupplierResult>(response) : null;
  }

  async refreshActivity(): Promise<{
    readonly observation?: { readonly freshness: string; readonly coverage_note: string };
    readonly recorded_settlement_count: number;
    readonly uncertain_job_count: number;
  }> {
    const response = await this.#fetch(`${this.#baseUrl}/v1/activity/refresh`, {
      method: 'POST',
      headers: this.#headers(),
    });
    const body = await responseJson<{
      readonly observation?: { readonly freshness: string; readonly coverage_note: string };
      readonly recorded_settlement_count: number;
      readonly uncertain_job_count: number;
    }>(response);
    if (!response.ok || !body) throw new Error('Activity refresh is unavailable');
    return body;
  }
}
