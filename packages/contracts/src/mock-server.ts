import type {
  CreateIntentRequest,
  IntentResponse,
  ReconcileResponse,
  RecoveryView,
} from './generated/api-types.js';

export const OPENAPI_MOCK_SERVER_VERSION = '1.0.0';

export interface OpenApiMockServerResult {
  readonly status: number;
  readonly body: unknown;
  readonly headers?: Record<string, string>;
}

export interface UiFixtureScenario {
  readonly scenario: string;
  readonly description: string;
  readonly intent: IntentResponse;
  readonly recovery_view: RecoveryView;
}

export const UI_FIXTURES: Record<string, UiFixtureScenario> = {
  'authorized-committed': {
    scenario: 'authorized-committed',
    description: 'Authorized intent successfully settled on Arc testnet',
    intent: {
      business_intent_id: '018f-ui-committed-001',
      payload_fingerprint: 'a000000000000000000000000000000000000000000000000000000000000001',
      recipient: '0x1111111111111111111111111111111111111111',
      amount_atomic: '1250000',
      asset: 'USDC',
      network: 'eip155:5042002',
      purpose: 'Invoice INV-1001',
      state: 'COMMITTED',
      version: 3,
      policy: {
        policy_id: 'privy-policy-arc-prod',
        status: 'CONFIGURED',
        settlement_cap_atomic: '10000000',
        allowed_recipients: ['0x1111111111111111111111111111111111111111'],
      },
      attempts: [
        {
          attempt_id: 'attempt-ui-001',
          stage: 'COMMITTED',
          created_at: '2026-09-08T12:00:00.000Z',
          authorization_status: 'AUTHORIZED',
        },
      ],
      settlement: {
        provider_reference_id: 'arc-tx-001',
        transaction_hash: '0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa',
        block_number: '100',
        transfer_log_index: 0,
        token_contract: '0x3600000000000000000000000000000000000000',
        explorer_url:
          'https://testnet.arcscan.io/tx/0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa',
      },
      evidence: [
        {
          source: 'PRIVY',
          authority_class: 'AUTHORITATIVE',
          retrieved_at: '2026-09-08T12:00:01.000Z',
          digest: 'digest-privy-001',
        },
        {
          source: 'ARC',
          authority_class: 'AUTHORITATIVE',
          retrieved_at: '2026-09-08T12:00:02.000Z',
          digest: 'digest-arc-001',
          block_number: '100',
        },
      ],
    },
    recovery_view: {
      business_intent_id: '018f-ui-committed-001',
      authoritative_state: 'COMMITTED',
      recommended_action: 'RETURN_EXISTING_RESULT',
      evidence: [
        {
          source: 'ARC',
          authority_class: 'AUTHORITATIVE',
          retrieved_at: '2026-09-08T12:00:02.000Z',
          digest: 'digest-arc-001',
          block_number: '100',
        },
      ],
    },
  },
  'auth-checking': {
    scenario: 'auth-checking',
    description: 'Intent submitted and currently undergoing authorization check',
    intent: {
      business_intent_id: '018f-ui-checking-002',
      payload_fingerprint: 'a000000000000000000000000000000000000000000000000000000000000002',
      recipient: '0x1111111111111111111111111111111111111111',
      amount_atomic: '1250000',
      asset: 'USDC',
      network: 'eip155:5042002',
      purpose: 'Invoice INV-1002',
      state: 'AUTHORIZING',
      version: 1,
      policy: {
        policy_id: 'privy-policy-arc-prod',
        status: 'CONFIGURED',
        settlement_cap_atomic: '10000000',
        allowed_recipients: ['0x1111111111111111111111111111111111111111'],
      },
      attempts: [
        {
          attempt_id: 'attempt-ui-002',
          stage: 'AUTHORIZING',
          created_at: '2026-09-08T12:05:00.000Z',
          authorization_status: 'CHECKING',
        },
      ],
      evidence: [],
    },
    recovery_view: {
      business_intent_id: '018f-ui-checking-002',
      authoritative_state: 'AUTHORIZING',
      recommended_action: 'WAIT',
      evidence: [],
    },
  },
  'auth-denied-recipient': {
    scenario: 'auth-denied-recipient',
    description: 'Intent authorization denied because recipient is not in configured allowlist',
    intent: {
      business_intent_id: '018f-ui-denied-recip-003',
      payload_fingerprint: 'a000000000000000000000000000000000000000000000000000000000000003',
      recipient: '0x1111111111111111111111111111111111111111',
      amount_atomic: '1250000',
      asset: 'USDC',
      network: 'eip155:5042002',
      purpose: 'Invoice INV-1003',
      state: 'REJECTED',
      version: 2,
      policy: {
        policy_id: 'privy-policy-arc-prod',
        status: 'CONFIGURED',
        settlement_cap_atomic: '10000000',
        allowed_recipients: ['0x2222222222222222222222222222222222222222'],
      },
      attempts: [
        {
          attempt_id: 'attempt-ui-003',
          stage: 'REJECTED',
          created_at: '2026-09-08T12:10:00.000Z',
          sanitized_error:
            'Recipient 0x1111111111111111111111111111111111111111 is not on allowlist',
          authorization_status: 'DENIED',
        },
      ],
      evidence: [
        {
          source: 'PRIVY',
          authority_class: 'AUTHORITATIVE',
          retrieved_at: '2026-09-08T12:10:01.000Z',
          digest: 'digest-denied-recipient-003',
        },
      ],
    },
    recovery_view: {
      business_intent_id: '018f-ui-denied-recip-003',
      authoritative_state: 'REJECTED',
      recommended_action: 'RETURN_EXISTING_RESULT',
      evidence: [
        {
          source: 'PRIVY',
          authority_class: 'AUTHORITATIVE',
          retrieved_at: '2026-09-08T12:10:01.000Z',
          digest: 'digest-denied-recipient-003',
        },
      ],
    },
  },
  'auth-cap-exceeded': {
    scenario: 'auth-cap-exceeded',
    description: 'Intent authorization denied because amount exceeds configured settlement cap',
    intent: {
      business_intent_id: '018f-ui-cap-exceeded-004',
      payload_fingerprint: 'a000000000000000000000000000000000000000000000000000000000000004',
      recipient: '0x1111111111111111111111111111111111111111',
      amount_atomic: '50000000',
      asset: 'USDC',
      network: 'eip155:5042002',
      purpose: 'Invoice INV-1004',
      state: 'REJECTED',
      version: 2,
      policy: {
        policy_id: 'privy-policy-arc-prod',
        status: 'EXCEEDED',
        settlement_cap_atomic: '10000000',
        allowed_recipients: ['0x1111111111111111111111111111111111111111'],
      },
      attempts: [
        {
          attempt_id: 'attempt-ui-004',
          stage: 'REJECTED',
          created_at: '2026-09-08T12:15:00.000Z',
          sanitized_error: 'Amount 50000000 exceeds settlement cap 10000000',
          authorization_status: 'DENIED',
        },
      ],
      evidence: [
        {
          source: 'PRIVY',
          authority_class: 'AUTHORITATIVE',
          retrieved_at: '2026-09-08T12:15:01.000Z',
          digest: 'digest-cap-exceeded-004',
        },
      ],
    },
    recovery_view: {
      business_intent_id: '018f-ui-cap-exceeded-004',
      authoritative_state: 'REJECTED',
      recommended_action: 'RETURN_EXISTING_RESULT',
      evidence: [
        {
          source: 'PRIVY',
          authority_class: 'AUTHORITATIVE',
          retrieved_at: '2026-09-08T12:15:01.000Z',
          digest: 'digest-cap-exceeded-004',
        },
      ],
    },
  },
  'auth-unavailable': {
    scenario: 'auth-unavailable',
    description: 'Privy authorization unavailable resulting in safe failure without settlement',
    intent: {
      business_intent_id: '018f-ui-unavailable-005',
      payload_fingerprint: 'a000000000000000000000000000000000000000000000000000000000000005',
      recipient: '0x1111111111111111111111111111111111111111',
      amount_atomic: '1250000',
      asset: 'USDC',
      network: 'eip155:5042002',
      purpose: 'Invoice INV-1005',
      state: 'FAILED_SAFE',
      version: 2,
      policy: {
        policy_id: 'privy-policy-arc-prod',
        status: 'UNKNOWN',
      },
      attempts: [
        {
          attempt_id: 'attempt-ui-005',
          stage: 'FAILED_SAFE',
          created_at: '2026-09-08T12:20:00.000Z',
          sanitized_error: 'Privy authorization service unavailable; timed out after 10000ms',
          authorization_status: 'UNAVAILABLE',
        },
      ],
      evidence: [
        {
          source: 'PRIVY',
          authority_class: 'ADVISORY',
          retrieved_at: '2026-09-08T12:20:01.000Z',
          digest: 'digest-unavailable-005',
        },
      ],
    },
    recovery_view: {
      business_intent_id: '018f-ui-unavailable-005',
      authoritative_state: 'FAILED_SAFE',
      recommended_action: 'RETURN_EXISTING_RESULT',
      evidence: [
        {
          source: 'PRIVY',
          authority_class: 'ADVISORY',
          retrieved_at: '2026-09-08T12:20:01.000Z',
          digest: 'digest-unavailable-005',
        },
      ],
    },
  },
  'auth-config-mismatch': {
    scenario: 'auth-config-mismatch',
    description: 'Policy configuration mismatch resulting in rejected intent',
    intent: {
      business_intent_id: '018f-ui-mismatch-006',
      payload_fingerprint: 'a000000000000000000000000000000000000000000000000000000000000006',
      recipient: '0x1111111111111111111111111111111111111111',
      amount_atomic: '1250000',
      asset: 'USDC',
      network: 'eip155:5042002',
      purpose: 'Invoice INV-1006',
      state: 'REJECTED',
      version: 2,
      policy: {
        policy_id: 'privy-policy-mismatch',
        status: 'NOT_CONFIGURED',
      },
      attempts: [
        {
          attempt_id: 'attempt-ui-006',
          stage: 'REJECTED',
          created_at: '2026-09-08T12:25:00.000Z',
          sanitized_error: 'Policy configuration mismatch: expected configured Arc testnet wallet',
          authorization_status: 'CONFIG_MISMATCH',
        },
      ],
      evidence: [],
    },
    recovery_view: {
      business_intent_id: '018f-ui-mismatch-006',
      authoritative_state: 'REJECTED',
      recommended_action: 'RETURN_EXISTING_RESULT',
      evidence: [],
    },
  },
  'unknown-reconcile-only': {
    scenario: 'unknown-reconcile-only',
    description:
      'Network timeout after broadcast with state UNKNOWN; read-only reconciliation required',
    intent: {
      business_intent_id: '018f-ui-unknown-007',
      payload_fingerprint: 'a000000000000000000000000000000000000000000000000000000000000007',
      recipient: '0x1111111111111111111111111111111111111111',
      amount_atomic: '1250000',
      asset: 'USDC',
      network: 'eip155:5042002',
      purpose: 'Invoice INV-1007',
      state: 'UNKNOWN',
      version: 2,
      policy: {
        policy_id: 'privy-policy-arc-prod',
        status: 'CONFIGURED',
        settlement_cap_atomic: '10000000',
        allowed_recipients: ['0x1111111111111111111111111111111111111111'],
      },
      attempts: [
        {
          attempt_id: 'attempt-ui-007',
          stage: 'SUBMITTING',
          created_at: '2026-09-08T12:30:00.000Z',
          sanitized_error:
            'Connection reset after broadcast; transaction receipt pending verification',
          authorization_status: 'AUTHORIZED',
        },
      ],
      evidence: [
        {
          source: 'THE_GRAPH',
          authority_class: 'OBSERVATION',
          retrieved_at: '2026-09-08T12:30:10.000Z',
          digest: 'digest-subgraph-lagging-007',
          freshness: 'LAGGING',
        },
      ],
    },
    recovery_view: {
      business_intent_id: '018f-ui-unknown-007',
      authoritative_state: 'UNKNOWN',
      recommended_action: 'RECONCILE',
      evidence: [
        {
          source: 'THE_GRAPH',
          authority_class: 'OBSERVATION',
          retrieved_at: '2026-09-08T12:30:10.000Z',
          digest: 'digest-subgraph-lagging-007',
          freshness: 'LAGGING',
        },
      ],
    },
  },
};

export interface OpenApiMockState {
  readonly intents: Map<string, IntentResponse>;
  readonly recoveryViews: Map<string, RecoveryView>;
}

export function createDefaultMockState(): OpenApiMockState {
  const intents = new Map<string, IntentResponse>();
  const recoveryViews = new Map<string, RecoveryView>();
  for (const fixture of Object.values(UI_FIXTURES)) {
    intents.set(fixture.intent.business_intent_id, JSON.parse(JSON.stringify(fixture.intent)));
    recoveryViews.set(
      fixture.recovery_view.business_intent_id,
      JSON.parse(JSON.stringify(fixture.recovery_view)),
    );
  }
  return { intents, recoveryViews };
}

export function handleOpenApiMockRequest(
  requestUrl: string | URL,
  method = 'GET',
  body?: unknown,
  state: OpenApiMockState = createDefaultMockState(),
): OpenApiMockServerResult | null {
  const url = requestUrl instanceof URL ? requestUrl : new URL(requestUrl, 'http://localhost');
  const pathname = url.pathname;

  // Reject any blind retry endpoint.
  if (pathname.includes('retry')) {
    return null;
  }

  // Health endpoints
  if (pathname === '/health/live' && method === 'GET') {
    return {
      status: 200,
      body: { status: 'ok' },
      headers: { 'x-oneshot-mock-version': OPENAPI_MOCK_SERVER_VERSION },
    };
  }

  if (pathname === '/health/ready' && method === 'GET') {
    return {
      status: 200,
      body: { status: 'ok' },
      headers: { 'x-oneshot-mock-version': OPENAPI_MOCK_SERVER_VERSION },
    };
  }

  // POST /v1/intents
  if (pathname === '/v1/intents' && method === 'POST') {
    const candidate = body as Partial<CreateIntentRequest> | undefined;
    if (
      !candidate ||
      typeof candidate.business_intent_id !== 'string' ||
      typeof candidate.recipient !== 'string' ||
      typeof candidate.amount_atomic !== 'string' ||
      candidate.asset !== 'USDC' ||
      candidate.network !== 'eip155:5042002' ||
      typeof candidate.purpose !== 'string'
    ) {
      return {
        status: 400,
        body: {
          code: 'INVALID_REQUEST',
          message: 'Invalid intent payload',
          correlation_id: 'mock-correlation-id',
        },
        headers: { 'x-oneshot-mock-version': OPENAPI_MOCK_SERVER_VERSION },
      };
    }

    const existing = state.intents.get(candidate.business_intent_id);
    if (existing) {
      const isIdentical =
        existing.recipient.toLowerCase() === candidate.recipient.toLowerCase() &&
        existing.amount_atomic === candidate.amount_atomic &&
        existing.asset === candidate.asset &&
        existing.network === candidate.network &&
        existing.purpose === candidate.purpose;

      if (isIdentical) {
        return {
          status: 200,
          body: existing,
          headers: { 'x-oneshot-mock-version': OPENAPI_MOCK_SERVER_VERSION },
        };
      }

      return {
        status: 409,
        body: {
          code: 'INTENT_PAYLOAD_CONFLICT',
          message: 'Business Intent already exists with a different immutable payload',
          correlation_id: 'mock-correlation-id',
        },
        headers: { 'x-oneshot-mock-version': OPENAPI_MOCK_SERVER_VERSION },
      };
    }

    const newIntent: IntentResponse = {
      business_intent_id: candidate.business_intent_id,
      payload_fingerprint: 'a000000000000000000000000000000000000000000000000000000000000099',
      recipient: candidate.recipient,
      amount_atomic: candidate.amount_atomic,
      asset: candidate.asset,
      network: candidate.network,
      purpose: candidate.purpose,
      state: 'AUTHORIZING',
      version: 1,
      attempts: [
        {
          attempt_id: `attempt-${candidate.business_intent_id}-1`,
          stage: 'AUTHORIZING',
          created_at: new Date().toISOString(),
          authorization_status: 'CHECKING',
        },
      ],
      evidence: [],
    };
    state.intents.set(candidate.business_intent_id, newIntent);

    return {
      status: 202,
      body: newIntent,
      headers: { 'x-oneshot-mock-version': OPENAPI_MOCK_SERVER_VERSION },
    };
  }

  // GET /v1/intents/:id/recovery-view
  const recoveryViewMatch = /^\/v1\/intents\/([^/]+)\/recovery-view$/u.exec(pathname);
  if (recoveryViewMatch) {
    if (method !== 'GET') {
      return {
        status: 405,
        body: { code: 'METHOD_NOT_ALLOWED', message: 'Method not allowed' },
        headers: { 'x-oneshot-mock-version': OPENAPI_MOCK_SERVER_VERSION },
      };
    }
    const id = decodeURIComponent(recoveryViewMatch[1] ?? '');
    const recoveryView = state.recoveryViews.get(id);
    if (recoveryView) {
      return {
        status: 200,
        body: recoveryView,
        headers: { 'x-oneshot-mock-version': OPENAPI_MOCK_SERVER_VERSION },
      };
    }
    const intent = state.intents.get(id);
    if (intent) {
      const synthesized: RecoveryView = {
        business_intent_id: id,
        authoritative_state: intent.state,
        recommended_action:
          intent.state === 'COMMITTED'
            ? 'RETURN_EXISTING_RESULT'
            : intent.state === 'UNKNOWN'
              ? 'RECONCILE'
              : 'WAIT',
        evidence: intent.evidence,
      };
      return {
        status: 200,
        body: synthesized,
        headers: { 'x-oneshot-mock-version': OPENAPI_MOCK_SERVER_VERSION },
      };
    }
    return {
      status: 404,
      body: {
        code: 'INTENT_NOT_FOUND',
        message: 'Business Intent was not found',
        correlation_id: 'mock-correlation-id',
      },
      headers: { 'x-oneshot-mock-version': OPENAPI_MOCK_SERVER_VERSION },
    };
  }

  // POST /v1/intents/:id/reconcile
  const reconcileMatch = /^\/v1\/intents\/([^/]+)\/reconcile$/u.exec(pathname);
  if (reconcileMatch) {
    if (method !== 'POST') {
      return {
        status: 405,
        body: { code: 'METHOD_NOT_ALLOWED', message: 'Method not allowed' },
        headers: { 'x-oneshot-mock-version': OPENAPI_MOCK_SERVER_VERSION },
      };
    }
    const id = decodeURIComponent(reconcileMatch[1] ?? '');
    const intent = state.intents.get(id);
    if (!intent) {
      return {
        status: 404,
        body: {
          code: 'INTENT_NOT_FOUND',
          message: 'Business Intent was not found',
          correlation_id: 'mock-correlation-id',
        },
        headers: { 'x-oneshot-mock-version': OPENAPI_MOCK_SERVER_VERSION },
      };
    }
    if (intent.state === 'COMMITTED' || intent.state === 'FAILED_SAFE') {
      return {
        status: 409,
        body: {
          code: 'RECONCILIATION_NOT_ALLOWED',
          message: 'Intent state does not permit reconciliation',
          correlation_id: 'mock-correlation-id',
        },
        headers: { 'x-oneshot-mock-version': OPENAPI_MOCK_SERVER_VERSION },
      };
    }
    const reconcileResponse: ReconcileResponse = {
      business_intent_id: id,
      queued: true,
      state: intent.state,
    };
    return {
      status: 202,
      body: reconcileResponse,
      headers: { 'x-oneshot-mock-version': OPENAPI_MOCK_SERVER_VERSION },
    };
  }

  // GET /v1/intents/:id
  const intentMatch = /^\/v1\/intents\/([^/]+)$/u.exec(pathname);
  if (intentMatch) {
    if (method !== 'GET') {
      return {
        status: 405,
        body: { code: 'METHOD_NOT_ALLOWED', message: 'Method not allowed' },
        headers: { 'x-oneshot-mock-version': OPENAPI_MOCK_SERVER_VERSION },
      };
    }
    const id = decodeURIComponent(intentMatch[1] ?? '');
    const intent = state.intents.get(id);
    if (!intent) {
      return {
        status: 404,
        body: {
          code: 'INTENT_NOT_FOUND',
          message: 'Business Intent was not found',
          correlation_id: 'mock-correlation-id',
        },
        headers: { 'x-oneshot-mock-version': OPENAPI_MOCK_SERVER_VERSION },
      };
    }
    return {
      status: 200,
      body: intent,
      headers: { 'x-oneshot-mock-version': OPENAPI_MOCK_SERVER_VERSION },
    };
  }

  return null;
}

export function createOpenApiMockFetch(
  state: OpenApiMockState = createDefaultMockState(),
): typeof fetch {
  return async (input: RequestInfo | URL, init?: RequestInit): Promise<Response> => {
    const url = typeof input === 'string' ? input : input instanceof URL ? input : input.url;
    const method =
      init?.method ??
      (typeof input === 'object' && input !== null && 'method' in input ? input.method : 'GET') ??
      'GET';
    let body: unknown = undefined;
    if (init?.body && typeof init.body === 'string') {
      try {
        body = JSON.parse(init.body);
      } catch {
        body = init.body;
      }
    }
    const result = handleOpenApiMockRequest(url, method, body, state);
    if (!result) {
      return new Response(
        JSON.stringify({
          code: 'NOT_FOUND',
          message: 'Resource not found on OneShot OpenAPI mock server',
        }),
        {
          status: 404,
          headers: {
            'content-type': 'application/json',
            'x-oneshot-mock-version': OPENAPI_MOCK_SERVER_VERSION,
          },
        },
      );
    }
    return new Response(JSON.stringify(result.body), {
      status: result.status,
      headers: {
        'content-type': 'application/json',
        'x-oneshot-mock-version': OPENAPI_MOCK_SERVER_VERSION,
        ...result.headers,
      },
    });
  };
}

export interface OpenApiMockClient {
  readonly version: string;
  createIntent(request: CreateIntentRequest): Promise<{ status: number; data: IntentResponse }>;
  getIntent(id: string): Promise<{ status: number; data: IntentResponse }>;
  reconcile(id: string): Promise<{ status: number; data: ReconcileResponse }>;
  getRecoveryView(id: string): Promise<{ status: number; data: RecoveryView }>;
  getLiveness(): Promise<{ status: number; data: { status: string } }>;
  getReadiness(): Promise<{ status: number; data: { status: string } }>;
}

export function createOpenApiMockClient(
  options: {
    readonly baseUrl?: string;
    readonly fetcher?: typeof fetch;
    readonly state?: OpenApiMockState;
  } = {},
): OpenApiMockClient {
  const baseUrl = (options.baseUrl ?? 'http://mock.local').replace(/\/+$/u, '');
  const fetcher = options.fetcher ?? createOpenApiMockFetch(options.state);

  async function request<T>(
    path: string,
    init?: RequestInit,
  ): Promise<{ status: number; data: T }> {
    const res = await fetcher(`${baseUrl}${path}`, init);
    const data = (await res.json()) as T;
    return { status: res.status, data };
  }

  return {
    version: OPENAPI_MOCK_SERVER_VERSION,
    async createIntent(req: CreateIntentRequest) {
      return request<IntentResponse>('/v1/intents', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(req),
      });
    },
    async getIntent(id: string) {
      return request<IntentResponse>(`/v1/intents/${encodeURIComponent(id)}`);
    },
    async reconcile(id: string) {
      return request<ReconcileResponse>(`/v1/intents/${encodeURIComponent(id)}/reconcile`, {
        method: 'POST',
      });
    },
    async getRecoveryView(id: string) {
      return request<RecoveryView>(`/v1/intents/${encodeURIComponent(id)}/recovery-view`);
    },
    async getLiveness() {
      return request<{ status: string }>('/health/live');
    },
    async getReadiness() {
      return request<{ status: string }>('/health/ready');
    },
  };
}
