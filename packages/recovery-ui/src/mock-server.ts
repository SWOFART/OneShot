import {
  RECOVERY_MOCK_SERVER_VERSION,
  parseRecoveryTimelinePage,
  type RecoveryActionReceipt,
  type RecoveryTimelinePage,
} from './contract.js';
import { isRecoveryScenario, scenarioPage, type RecoveryScenario } from './fixtures.js';

export interface MockServerResult {
  readonly status: number;
  readonly body: unknown;
}

export function handleRecoveryMockRequest(
  requestUrl: string | URL,
  method = 'GET',
): MockServerResult | null {
  const url = requestUrl instanceof URL ? requestUrl : new URL(requestUrl, 'http://localhost');
  const match = /^\/mock\/v1\/intents\/([^/]+)\/recovery(?:\/(refresh|escalations))?$/u.exec(
    url.pathname,
  );
  if (!match) return null;

  const businessIntentId = decodeURIComponent(match[1] ?? '');
  const action = match[2];
  const scenarioParam = url.searchParams.get('scenario');
  const scenario = isRecoveryScenario(scenarioParam) ? scenarioParam : 'aged-unknown';

  if (action === undefined && method === 'GET') {
    const cursor = url.searchParams.get('cursor');
    const page = scenarioPage(scenario, cursor);
    if (page === null) {
      return {
        status: 404,
        body: { code: 'PAGE_NOT_FOUND', message: 'Recovery page does not exist.' },
      };
    }
    return {
      status: 200,
      body: { ...page, businessIntentId },
    };
  }

  if ((action === 'refresh' || action === 'escalations') && method === 'POST') {
    const receipt: RecoveryActionReceipt = {
      schemaVersion: 'recovery-action-receipt-v1',
      businessIntentId,
      action: action === 'refresh' ? 'REFRESH_STATUS' : 'ESCALATE',
      accepted: true,
      message:
        action === 'refresh'
          ? 'Status refresh requested. No settlement action was created.'
          : 'Operator escalation recorded. Settlement remains blocked.',
    };
    return { status: 202, body: receipt };
  }

  return {
    status: 405,
    body: { code: 'METHOD_NOT_ALLOWED', message: 'Only safe recovery reads and actions exist.' },
  };
}

export interface RecoveryClient {
  readPage(businessIntentId: string, cursor: string | null): Promise<RecoveryTimelinePage>;
  refresh(businessIntentId: string): Promise<RecoveryActionReceipt>;
  escalate(businessIntentId: string): Promise<RecoveryActionReceipt>;
}

function parseReceipt(value: unknown): RecoveryActionReceipt {
  if (value === null || typeof value !== 'object')
    throw new Error('Invalid recovery action receipt');
  const receipt = value as Partial<RecoveryActionReceipt>;
  if (
    receipt.schemaVersion !== 'recovery-action-receipt-v1' ||
    typeof receipt.businessIntentId !== 'string' ||
    (receipt.action !== 'REFRESH_STATUS' && receipt.action !== 'ESCALATE') ||
    receipt.accepted !== true ||
    typeof receipt.message !== 'string'
  ) {
    throw new Error('Invalid recovery action receipt');
  }
  return receipt as RecoveryActionReceipt;
}

export function createRecoveryClient(
  options: {
    readonly baseUrl?: string;
    readonly scenario?: RecoveryScenario;
    readonly fetcher?: typeof fetch;
  } = {},
): RecoveryClient {
  const baseUrl = options.baseUrl ?? '/mock/v1';
  const scenario = options.scenario ?? 'aged-unknown';
  const fetcher = options.fetcher ?? fetch;

  async function request(path: string, init?: RequestInit): Promise<unknown> {
    const response = await fetcher(path, init);
    if (!response.ok) throw new Error(`Recovery mock request failed with ${response.status}`);
    return response.json() as Promise<unknown>;
  }

  return {
    async readPage(businessIntentId, cursor) {
      const query = new URLSearchParams({ scenario });
      if (cursor !== null) query.set('cursor', cursor);
      const value = await request(
        `${baseUrl}/intents/${encodeURIComponent(businessIntentId)}/recovery?${query.toString()}`,
      );
      return parseRecoveryTimelinePage(value);
    },
    async refresh(businessIntentId) {
      const value = await request(
        `${baseUrl}/intents/${encodeURIComponent(businessIntentId)}/recovery/refresh?scenario=${scenario}`,
        { method: 'POST' },
      );
      return parseReceipt(value);
    },
    async escalate(businessIntentId) {
      const value = await request(
        `${baseUrl}/intents/${encodeURIComponent(businessIntentId)}/recovery/escalations?scenario=${scenario}`,
        { method: 'POST' },
      );
      return parseReceipt(value);
    },
  };
}

export function createInMemoryRecoveryClient(scenario: RecoveryScenario): RecoveryClient {
  const fetcher: typeof fetch = async (input, init) => {
    const url = typeof input === 'string' ? input : input instanceof URL ? input : input.url;
    const result = handleRecoveryMockRequest(url, init?.method ?? 'GET');
    if (result === null) return new Response('Not found', { status: 404 });
    return new Response(JSON.stringify(result.body), {
      status: result.status,
      headers: {
        'content-type': 'application/json',
        'x-oneshot-mock-version': RECOVERY_MOCK_SERVER_VERSION,
      },
    });
  };
  return createRecoveryClient({ baseUrl: 'http://mock.local/mock/v1', scenario, fetcher });
}
