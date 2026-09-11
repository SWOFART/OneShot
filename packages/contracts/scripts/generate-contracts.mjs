import { readFile, writeFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const packageRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const checkOnly = process.argv.includes('--check');

const intentStates = [
  'AUTHORIZING',
  'READY',
  'SUBMITTING',
  'COMMITTED',
  'FAILED_SAFE',
  'UNKNOWN',
  'REJECTED',
];
const errorCodes = [
  'INVALID_REQUEST',
  'UNAUTHORIZED',
  'FORBIDDEN',
  'INTENT_PAYLOAD_CONFLICT',
  'INTENT_NOT_FOUND',
  'RECONCILIATION_NOT_ALLOWED',
  'RATE_LIMITED',
  'EVIDENCE_UNAVAILABLE',
  'NOT_READY',
  'INTERNAL_ERROR',
];
const recoveryActions = ['WAIT', 'RECONCILE', 'ESCALATE', 'RETURN_EXISTING_RESULT'];
const recoveryDecisionSources = ['RECOVERY_AGENT', 'SAFE_FALLBACK'];
const coreDispositions = [
  'HOLD_UNKNOWN',
  'READ_ONLY_LOOKUP',
  'ESCALATE_UNKNOWN',
  'MARK_COMMITTED',
  'MARK_FAILED_SAFE',
];
const authorizationStatuses = [
  'CHECKING',
  'AUTHORIZED',
  'DENIED',
  'UNAVAILABLE',
  'CONFIG_MISMATCH',
];
const policyStatuses = ['CONFIGURED', 'EXCEEDED', 'NOT_CONFIGURED', 'UNKNOWN'];
const deliveryStates = ['NOT_REQUESTED', 'PENDING', 'AVAILABLE', 'RETRIEVAL_FAILED'];

const boundedId = {
  type: 'string',
  minLength: 1,
  maxLength: 128,
  pattern: '^[^\\s\\u0000-\\u001f\\u007f]+$',
};
const amountAtomic = {
  type: 'string',
  minLength: 1,
  maxLength: 78,
  pattern: '^(0|[1-9][0-9]*)$',
  examples: ['1250000'],
};
const evmAddress = {
  type: 'string',
  pattern: '^0x[0-9a-fA-F]{40}$',
  examples: ['0x1111111111111111111111111111111111111111'],
};

const schemas = {
  CreateIntentRequest: {
    type: 'object',
    additionalProperties: false,
    required: ['business_intent_id', 'recipient', 'amount_atomic', 'asset', 'network', 'purpose'],
    properties: {
      business_intent_id: { ...boundedId, examples: ['018f-example-stable-id'] },
      recipient: evmAddress,
      amount_atomic: amountAtomic,
      asset: { type: 'string', const: 'USDC' },
      network: { type: 'string', const: 'eip155:5042002' },
      purpose: { type: 'string', minLength: 1, maxLength: 256, examples: ['Invoice INV-1001'] },
    },
  },
  PolicySummary: {
    type: 'object',
    additionalProperties: false,
    required: ['status'],
    properties: {
      policy_id: boundedId,
      status: { type: 'string', enum: policyStatuses },
      settlement_cap_atomic: amountAtomic,
      allowed_recipients: {
        type: 'array',
        items: evmAddress,
      },
    },
  },
  Attempt: {
    type: 'object',
    additionalProperties: false,
    required: ['attempt_id', 'stage', 'created_at'],
    properties: {
      attempt_id: boundedId,
      stage: { type: 'string', enum: intentStates },
      created_at: { type: 'string', format: 'date-time' },
      sanitized_error: { type: 'string', minLength: 1, maxLength: 256 },
      authorization_status: { type: 'string', enum: authorizationStatuses },
    },
  },
  Settlement: {
    type: 'object',
    additionalProperties: false,
    required: ['provider_reference_id', 'transaction_hash', 'block_number', 'transfer_log_index'],
    properties: {
      provider_reference_id: boundedId,
      transaction_hash: { type: 'string', pattern: '^0x[0-9a-fA-F]{64}$' },
      block_number: amountAtomic,
      transfer_log_index: { type: 'integer', minimum: 0 },
      token_contract: evmAddress,
      explorer_url: { type: 'string', minLength: 1, maxLength: 256 },
    },
  },
  EvidenceObservation: {
    type: 'object',
    additionalProperties: false,
    required: ['source', 'authority_class', 'retrieved_at', 'digest'],
    properties: {
      source: { type: 'string', enum: ['ONESHOT', 'PRIVY', 'ARC', 'THE_GRAPH', 'LLM'] },
      authority_class: { type: 'string', enum: ['AUTHORITATIVE', 'OBSERVATION', 'ADVISORY'] },
      retrieved_at: { type: 'string', format: 'date-time' },
      digest: { type: 'string', minLength: 1, maxLength: 128 },
      block_number: amountAtomic,
      freshness: {
        type: 'string',
        enum: ['FRESH', 'LAGGING', 'UNHEALTHY', 'UNAVAILABLE', 'UNKNOWN_FRESHNESS'],
      },
    },
  },
  IntentResponse: {
    type: 'object',
    additionalProperties: false,
    required: [
      'business_intent_id',
      'payload_fingerprint',
      'recipient',
      'amount_atomic',
      'asset',
      'network',
      'purpose',
      'state',
      'version',
      'attempts',
      'evidence',
    ],
    properties: {
      business_intent_id: boundedId,
      payload_fingerprint: { type: 'string', pattern: '^[0-9a-f]{64}$' },
      recipient: evmAddress,
      amount_atomic: amountAtomic,
      asset: { type: 'string', const: 'USDC' },
      network: { type: 'string', const: 'eip155:5042002' },
      purpose: { type: 'string', minLength: 1, maxLength: 256 },
      state: { type: 'string', enum: intentStates },
      version: { type: 'integer', minimum: 1 },
      policy: { $ref: '#/$defs/PolicySummary' },
      attempts: { type: 'array', maxItems: 100, items: { $ref: '#/$defs/Attempt' } },
      settlement: { $ref: '#/$defs/Settlement' },
      evidence: { type: 'array', maxItems: 100, items: { $ref: '#/$defs/EvidenceObservation' } },
    },
  },
  ReconcileResponse: {
    type: 'object',
    additionalProperties: false,
    required: ['business_intent_id', 'queued', 'state'],
    properties: {
      business_intent_id: boundedId,
      queued: { type: 'boolean' },
      state: { type: 'string', enum: intentStates },
    },
  },
  CreateJobRequest: {
    type: 'object',
    additionalProperties: false,
    required: ['task_key', 'tool_id', 'report_subject'],
    properties: {
      task_key: boundedId,
      tool_id: { type: 'string', const: 'team-report-v1' },
      report_subject: { type: 'string', minLength: 1, maxLength: 256 },
    },
  },
  SupplierQuote: {
    type: 'object',
    additionalProperties: false,
    required: [
      'supplier_id',
      'order_reference',
      'recipient',
      'amount_atomic',
      'asset',
      'network',
      'expires_at',
    ],
    properties: {
      supplier_id: { type: 'string', const: 'team-report-v1' },
      order_reference: boundedId,
      recipient: evmAddress,
      amount_atomic: amountAtomic,
      asset: { type: 'string', const: 'USDC' },
      network: { type: 'string', const: 'eip155:5042002' },
      expires_at: { type: 'string', format: 'date-time' },
    },
  },
  SupplierResult: {
    type: 'object',
    additionalProperties: false,
    required: ['order_reference', 'result_reference', 'report'],
    properties: {
      order_reference: boundedId,
      result_reference: boundedId,
      report: { type: 'string', minLength: 1, maxLength: 2000 },
    },
  },
  JobResponse: {
    type: 'object',
    additionalProperties: false,
    required: [
      'job_id',
      'task_key',
      'tool_id',
      'business_intent_id',
      'supplier',
      'payment_state',
      'delivery_state',
      'created_at',
      'updated_at',
    ],
    properties: {
      job_id: boundedId,
      task_key: boundedId,
      tool_id: { type: 'string', const: 'team-report-v1' },
      business_intent_id: boundedId,
      supplier: { $ref: '#/$defs/SupplierQuote' },
      payment_state: { type: 'string', enum: intentStates },
      delivery_state: { type: 'string', enum: deliveryStates },
      settlement: { $ref: '#/$defs/Settlement' },
      result: { $ref: '#/$defs/SupplierResult' },
      created_at: { type: 'string', format: 'date-time' },
      updated_at: { type: 'string', format: 'date-time' },
    },
  },
  JobListResponse: {
    type: 'object',
    additionalProperties: false,
    required: ['jobs'],
    properties: { jobs: { type: 'array', maxItems: 100, items: { $ref: '#/$defs/JobResponse' } } },
  },
  ActivityResponse: {
    type: 'object',
    additionalProperties: false,
    required: ['recorded_settlement_count', 'uncertain_job_count'],
    properties: {
      recorded_settlement_count: { type: 'integer', minimum: 0 },
      uncertain_job_count: { type: 'integer', minimum: 0 },
      observation: { type: 'object', additionalProperties: true },
    },
  },
  RecoveryAgentDecision: {
    type: 'object',
    additionalProperties: false,
    required: [
      'accepted',
      'reason',
      'model_name',
      'model_version',
      'prompt_version',
      'evidence_references',
    ],
    properties: {
      accepted: { type: 'boolean' },
      reason: { type: 'string', minLength: 1, maxLength: 500 },
      model_name: boundedId,
      model_version: boundedId,
      prompt_version: boundedId,
      evidence_references: { type: 'array', maxItems: 100, items: boundedId },
    },
  },
  RecoveryCoreDecision: {
    type: 'object',
    additionalProperties: false,
    required: [
      'disposition',
      'target_state',
      'reason',
      'authoritative_proof_present',
      'evidence_references',
    ],
    properties: {
      disposition: { type: 'string', enum: coreDispositions },
      target_state: { type: 'string', enum: ['UNKNOWN', 'COMMITTED', 'FAILED_SAFE'] },
      reason: { type: 'string', minLength: 1, maxLength: 500 },
      authoritative_proof_present: { type: 'boolean' },
      evidence_references: { type: 'array', maxItems: 100, items: boundedId },
    },
  },
  RecoveryCandidate: {
    type: 'object',
    additionalProperties: false,
    required: [
      'candidate_id',
      'transaction_hash',
      'block_number',
      'binding_status',
      'contradiction_codes',
    ],
    properties: {
      candidate_id: boundedId,
      transaction_hash: { type: 'string', pattern: '^0x[0-9a-fA-F]{64}$' },
      block_number: amountAtomic,
      binding_status: { type: 'string', enum: ['MATCH', 'CONTRADICTORY'] },
      contradiction_codes: { type: 'array', maxItems: 25, items: boundedId },
    },
  },
  RecoveryGraphObservation: {
    type: 'object',
    additionalProperties: false,
    required: [
      'retrieval_path',
      'endpoint_url',
      'deployment_id',
      'manifest_cid',
      'health',
      'available',
      'candidate_count',
      'diagnostics',
      'candidates',
    ],
    properties: {
      retrieval_path: { type: 'string', enum: ['STUDIO_GRAPHQL', 'SUBGRAPH_MCP', 'UNKNOWN'] },
      endpoint_url: boundedId,
      server_name: boundedId,
      server_version: boundedId,
      tool_name: boundedId,
      deployment_id: boundedId,
      manifest_cid: boundedId,
      observed_through_block: amountAtomic,
      observed_through_time: { type: 'string', format: 'date-time' },
      health: {
        type: 'string',
        enum: ['FRESH', 'LAGGING', 'UNHEALTHY', 'UNAVAILABLE', 'UNKNOWN_FRESHNESS'],
      },
      available: { type: 'boolean' },
      candidate_count: { type: 'integer', minimum: 0, maximum: 25 },
      diagnostics: { type: 'array', maxItems: 25, items: boundedId },
      candidates: {
        type: 'array',
        maxItems: 25,
        items: { $ref: '#/$defs/RecoveryCandidate' },
      },
    },
  },
  RecoveryView: {
    type: 'object',
    additionalProperties: false,
    required: ['business_intent_id', 'authoritative_state', 'recommended_action', 'evidence'],
    properties: {
      business_intent_id: boundedId,
      authoritative_state: { type: 'string', enum: intentStates },
      recommended_action: { type: 'string', enum: recoveryActions },
      recommendation_source: { type: 'string', enum: recoveryDecisionSources },
      core_disposition: { type: 'string', enum: coreDispositions },
      settlement_permission: { type: 'string', const: 'NEVER' },
      agent_decision: { $ref: '#/$defs/RecoveryAgentDecision' },
      core_decision: { $ref: '#/$defs/RecoveryCoreDecision' },
      graph_observation: { $ref: '#/$defs/RecoveryGraphObservation' },
      contradiction: { type: 'boolean' },
      contradiction_codes: { type: 'array', maxItems: 25, items: boundedId },
      diagnostics: { type: 'array', maxItems: 25, items: boundedId },
      evidence: { type: 'array', maxItems: 100, items: { $ref: '#/$defs/EvidenceObservation' } },
    },
  },
  HealthResponse: {
    type: 'object',
    additionalProperties: false,
    required: ['status'],
    properties: {
      status: { type: 'string', enum: ['ok', 'not_ready'] },
      reason: { type: 'string', minLength: 1, maxLength: 256 },
    },
  },
  ErrorResponse: {
    type: 'object',
    additionalProperties: false,
    required: ['code', 'message', 'correlation_id'],
    properties: {
      code: { type: 'string', enum: errorCodes },
      message: { type: 'string', minLength: 1, maxLength: 256 },
      correlation_id: boundedId,
    },
  },
};

const schemaBundle = {
  $schema: 'https://json-schema.org/draft/2020-12/schema',
  $id: 'https://oneshot.example/schemas/contracts-v1.json',
  title: 'OneShot contracts-v1',
  $defs: schemas,
};

const ref = (name) => ({ $ref: `#/components/schemas/${name}` });
const jsonContent = (name) => ({ 'application/json': { schema: ref(name) } });
const response = (description, name) => ({ description, content: jsonContent(name) });
const errorResponse = (description) => response(description, 'ErrorResponse');
const intentParameters = [
  {
    name: 'id',
    in: 'path',
    required: true,
    schema: boundedId,
    description: 'Stable Business Intent identifier.',
  },
];
const serviceSecurity = [{ serviceBearer: [] }];

const openapi = {
  openapi: '3.1.0',
  info: {
    title: 'OneShot API',
    version: '1.0.0',
    description: 'At-most-once USDC settlement API. No endpoint grants a blind settlement retry.',
  },
  servers: [{ url: 'http://localhost:3000', description: 'Local development' }],
  paths: {
    '/v1/intents': {
      post: {
        operationId: 'createIntent',
        summary: 'Create or replay one Business Intent',
        security: serviceSecurity,
        requestBody: {
          required: true,
          content: jsonContent('CreateIntentRequest'),
        },
        responses: {
          200: response('Identical replay; existing intent returned.', 'IntentResponse'),
          202: response('New intent accepted.', 'IntentResponse'),
          400: errorResponse('INVALID_REQUEST'),
          401: errorResponse('UNAUTHORIZED'),
          403: errorResponse('FORBIDDEN'),
          409: errorResponse('INTENT_PAYLOAD_CONFLICT'),
          429: errorResponse('RATE_LIMITED'),
        },
      },
    },
    '/v1/intents/{id}': {
      get: {
        operationId: 'getIntent',
        summary: 'Read authoritative intent state',
        security: serviceSecurity,
        parameters: intentParameters,
        responses: {
          200: response('Intent state and sanitized evidence.', 'IntentResponse'),
          401: errorResponse('UNAUTHORIZED'),
          403: errorResponse('FORBIDDEN'),
          404: errorResponse('INTENT_NOT_FOUND'),
        },
      },
    },
    '/v1/intents/{id}/reconcile': {
      post: {
        operationId: 'reconcileIntent',
        summary: 'Queue read-only reconciliation; never submit settlement',
        security: serviceSecurity,
        parameters: intentParameters,
        responses: {
          202: response('Reconciliation lookup queued.', 'ReconcileResponse'),
          401: errorResponse('UNAUTHORIZED'),
          403: errorResponse('FORBIDDEN'),
          404: errorResponse('INTENT_NOT_FOUND'),
          409: errorResponse('RECONCILIATION_NOT_ALLOWED'),
          429: errorResponse('RATE_LIMITED'),
        },
      },
    },
    '/v1/intents/{id}/recovery-view': {
      get: {
        operationId: 'getRecoveryView',
        summary: 'Read authority-labelled recovery evidence',
        security: serviceSecurity,
        parameters: intentParameters,
        responses: {
          200: response('Recovery view.', 'RecoveryView'),
          401: errorResponse('UNAUTHORIZED'),
          403: errorResponse('FORBIDDEN'),
          404: errorResponse('INTENT_NOT_FOUND'),
          503: errorResponse('EVIDENCE_UNAVAILABLE; local state is retained.'),
        },
      },
    },
    '/v1/jobs': {
      get: {
        operationId: 'listJobs',
        summary: 'List jobs in the authorized workspace',
        security: serviceSecurity,
        responses: {
          200: response('Jobs.', 'JobListResponse'),
          401: errorResponse('UNAUTHORIZED'),
          403: errorResponse('FORBIDDEN'),
        },
      },
      post: {
        operationId: 'startJob',
        summary: 'Create or replay a task-bound paid job',
        security: serviceSecurity,
        requestBody: { required: true, content: jsonContent('CreateJobRequest') },
        responses: {
          200: response('Existing job.', 'JobResponse'),
          202: response('Job accepted.', 'JobResponse'),
          400: errorResponse('INVALID_REQUEST'),
          409: errorResponse('Task payload conflict'),
          401: errorResponse('UNAUTHORIZED'),
          403: errorResponse('FORBIDDEN'),
        },
      },
    },
    '/v1/jobs/quote': {
      post: {
        operationId: 'quoteJob',
        summary: 'Return a non-chargeable supplier quote before approval',
        security: serviceSecurity,
        requestBody: { required: true, content: jsonContent('CreateJobRequest') },
        responses: {
          200: response('Live supplier quote.', 'SupplierQuote'),
          400: errorResponse('INVALID_REQUEST'),
          401: errorResponse('UNAUTHORIZED'),
          403: errorResponse('FORBIDDEN'),
          503: errorResponse('NOT_READY'),
        },
      },
    },
    '/v1/jobs/{jobId}': {
      get: {
        operationId: 'getJob',
        summary: 'Read a workspace-owned job',
        security: serviceSecurity,
        parameters: [{ name: 'jobId', in: 'path', required: true, schema: boundedId }],
        responses: {
          200: response('Job.', 'JobResponse'),
          404: errorResponse('INTENT_NOT_FOUND'),
          401: errorResponse('UNAUTHORIZED'),
          403: errorResponse('FORBIDDEN'),
        },
      },
    },
    '/v1/jobs/{jobId}/resume': {
      post: {
        operationId: 'resumeJobDelivery',
        summary: 'Resume original supplier delivery only; never pay',
        security: serviceSecurity,
        parameters: [{ name: 'jobId', in: 'path', required: true, schema: boundedId }],
        responses: {
          202: response('Delivery resume queued.', 'JobResponse'),
          404: errorResponse('INTENT_NOT_FOUND'),
          401: errorResponse('UNAUTHORIZED'),
          403: errorResponse('FORBIDDEN'),
        },
      },
    },
    '/v1/jobs/{jobId}/result': {
      get: {
        operationId: 'getJobResult',
        summary: 'Retrieve an existing result; never pay',
        security: serviceSecurity,
        parameters: [{ name: 'jobId', in: 'path', required: true, schema: boundedId }],
        responses: {
          200: response('Supplier result.', 'SupplierResult'),
          404: errorResponse('INTENT_NOT_FOUND'),
          409: errorResponse('Result unavailable'),
          401: errorResponse('UNAUTHORIZED'),
          403: errorResponse('FORBIDDEN'),
        },
      },
    },
    '/v1/activity': {
      get: {
        operationId: 'getWalletActivity',
        summary: 'Read bounded activity and coverage metadata',
        security: serviceSecurity,
        responses: {
          200: response('Activity.', 'ActivityResponse'),
          401: errorResponse('UNAUTHORIZED'),
          403: errorResponse('FORBIDDEN'),
        },
      },
    },
    '/v1/activity/refresh': {
      post: {
        operationId: 'refreshWalletActivity',
        summary: 'Refresh Graph activity without settlement action',
        security: serviceSecurity,
        responses: {
          202: response('Activity refresh.', 'ActivityResponse'),
          401: errorResponse('UNAUTHORIZED'),
          403: errorResponse('FORBIDDEN'),
        },
      },
    },
    '/health/live': {
      get: {
        operationId: 'getLiveness',
        summary: 'Process liveness',
        security: [],
        responses: {
          200: response('Process can serve.', 'HealthResponse'),
          503: response('Process cannot serve.', 'HealthResponse'),
        },
      },
    },
    '/health/ready': {
      get: {
        operationId: 'getReadiness',
        summary: 'Database, configuration, and Arc identity readiness',
        security: [],
        responses: {
          200: response('Service is ready.', 'HealthResponse'),
          503: errorResponse('NOT_READY'),
        },
      },
    },
  },
  components: {
    securitySchemes: {
      serviceBearer: {
        type: 'http',
        scheme: 'bearer',
        bearerFormat: 'opaque service token',
      },
    },
    schemas: Object.fromEntries(
      Object.entries(schemas).map(([name, schema]) => [
        name,
        JSON.parse(JSON.stringify(schema).replaceAll('#/$defs/', '#/components/schemas/')),
      ]),
    ),
  },
};

const generatedTypes = `// Generated by scripts/generate-contracts.mjs. Do not edit.

export const INTENT_STATES = ${JSON.stringify(intentStates)} as const;
export type IntentState = (typeof INTENT_STATES)[number];

export const ERROR_CODES = ${JSON.stringify(errorCodes)} as const;
export type ErrorCode = (typeof ERROR_CODES)[number];

export const RECOVERY_ACTIONS = ${JSON.stringify(recoveryActions)} as const;
export type RecoveryActionName = (typeof RECOVERY_ACTIONS)[number];

export const RECOVERY_DECISION_SOURCES = ${JSON.stringify(recoveryDecisionSources)} as const;
export type RecoveryDecisionSource = (typeof RECOVERY_DECISION_SOURCES)[number];

export const CORE_DISPOSITIONS = ${JSON.stringify(coreDispositions)} as const;
export type CoreDispositionName = (typeof CORE_DISPOSITIONS)[number];

export const AUTHORIZATION_STATUSES = ${JSON.stringify(authorizationStatuses)} as const;
export type AuthorizationStatus = (typeof AUTHORIZATION_STATUSES)[number];

export const POLICY_STATUSES = ${JSON.stringify(policyStatuses)} as const;
export type PolicyStatus = (typeof POLICY_STATUSES)[number];

export const DELIVERY_STATES = ${JSON.stringify(deliveryStates)} as const;
export type DeliveryState = (typeof DELIVERY_STATES)[number];

export interface CreateIntentRequest {
  readonly business_intent_id: string;
  readonly recipient: string;
  readonly amount_atomic: string;
  readonly asset: 'USDC';
  readonly network: 'eip155:5042002';
  readonly purpose: string;
}

export interface PolicySummaryView {
  readonly policy_id?: string;
  readonly status: PolicyStatus;
  readonly settlement_cap_atomic?: string;
  readonly allowed_recipients?: readonly string[];
}

export interface IntentResponse extends CreateIntentRequest {
  readonly payload_fingerprint: string;
  readonly state: IntentState;
  readonly version: number;
  readonly policy?: PolicySummaryView;
  readonly attempts: readonly AttemptView[];
  readonly settlement?: SettlementView;
  readonly evidence: readonly EvidenceView[];
}

export interface AttemptView {
  readonly attempt_id: string;
  readonly stage: IntentState;
  readonly created_at: string;
  readonly sanitized_error?: string;
  readonly authorization_status?: AuthorizationStatus;
}

export interface SettlementView {
  readonly provider_reference_id: string;
  readonly transaction_hash: string;
  readonly block_number: string;
  readonly transfer_log_index: number;
  readonly token_contract?: string;
  readonly explorer_url?: string;
}

export interface EvidenceView {
  readonly source: 'ONESHOT' | 'PRIVY' | 'ARC' | 'THE_GRAPH' | 'LLM';
  readonly authority_class: 'AUTHORITATIVE' | 'OBSERVATION' | 'ADVISORY';
  readonly retrieved_at: string;
  readonly digest: string;
  readonly block_number?: string;
  readonly freshness?: 'FRESH' | 'LAGGING' | 'UNHEALTHY' | 'UNAVAILABLE' | 'UNKNOWN_FRESHNESS';
}

export interface ReconcileResponse {
  readonly business_intent_id: string;
  readonly queued: boolean;
  readonly state: IntentState;
}

export interface CreateJobRequest {
  readonly task_key: string;
  readonly tool_id: 'team-report-v1';
  readonly report_subject: string;
}

export interface SupplierQuote {
  readonly supplier_id: 'team-report-v1';
  readonly order_reference: string;
  readonly recipient: string;
  readonly amount_atomic: string;
  readonly asset: 'USDC';
  readonly network: 'eip155:5042002';
  readonly expires_at: string;
}

export interface SupplierResult {
  readonly order_reference: string;
  readonly result_reference: string;
  readonly report: string;
}

export interface JobResponse {
  readonly job_id: string;
  readonly task_key: string;
  readonly tool_id: 'team-report-v1';
  readonly business_intent_id: string;
  readonly supplier: SupplierQuote;
  readonly payment_state: IntentState;
  readonly delivery_state: DeliveryState;
  readonly settlement?: SettlementView;
  readonly result?: SupplierResult;
  readonly created_at: string;
  readonly updated_at: string;
}

export interface JobListResponse {
  readonly jobs: readonly JobResponse[];
}

export interface ActivityResponse {
  readonly observation?: Record<string, unknown>;
  readonly recorded_settlement_count: number;
  readonly uncertain_job_count: number;
}

export interface RecoveryAgentDecisionView {
  readonly accepted: boolean;
  readonly reason: string;
  readonly model_name: string;
  readonly model_version: string;
  readonly prompt_version: string;
  readonly evidence_references: readonly string[];
}

export interface RecoveryCoreDecisionView {
  readonly disposition: CoreDispositionName;
  readonly target_state: 'UNKNOWN' | 'COMMITTED' | 'FAILED_SAFE';
  readonly reason: string;
  readonly authoritative_proof_present: boolean;
  readonly evidence_references: readonly string[];
}

export interface RecoveryCandidateView {
  readonly candidate_id: string;
  readonly transaction_hash: string;
  readonly block_number: string;
  readonly binding_status: 'MATCH' | 'CONTRADICTORY';
  readonly contradiction_codes: readonly string[];
}

export interface RecoveryGraphObservationView {
  readonly retrieval_path: 'STUDIO_GRAPHQL' | 'SUBGRAPH_MCP' | 'UNKNOWN';
  readonly endpoint_url: string;
  readonly server_name?: string;
  readonly server_version?: string;
  readonly tool_name?: string;
  readonly deployment_id: string;
  readonly manifest_cid: string;
  readonly observed_through_block?: string;
  readonly observed_through_time?: string;
  readonly health: 'FRESH' | 'LAGGING' | 'UNHEALTHY' | 'UNAVAILABLE' | 'UNKNOWN_FRESHNESS';
  readonly available: boolean;
  readonly candidate_count: number;
  readonly diagnostics: readonly string[];
  readonly candidates: readonly RecoveryCandidateView[];
}

export interface RecoveryView {
  readonly business_intent_id: string;
  readonly authoritative_state: IntentState;
  readonly recommended_action: RecoveryActionName;
  readonly recommendation_source?: RecoveryDecisionSource;
  readonly core_disposition?: CoreDispositionName;
  readonly settlement_permission?: 'NEVER';
  readonly agent_decision?: RecoveryAgentDecisionView;
  readonly core_decision?: RecoveryCoreDecisionView;
  readonly graph_observation?: RecoveryGraphObservationView;
  readonly contradiction?: boolean;
  readonly contradiction_codes?: readonly string[];
  readonly diagnostics?: readonly string[];
  readonly evidence: readonly EvidenceView[];
}

export interface ErrorResponse {
  readonly code: ErrorCode;
  readonly message: string;
  readonly correlation_id: string;
}
`;

const artifacts = new Map([
  ['generated/contracts.schema.json', `${JSON.stringify(schemaBundle, null, 2)}\n`],
  ['openapi/openapi.v1.json', `${JSON.stringify(openapi, null, 2)}\n`],
  ['src/generated/api-types.ts', generatedTypes],
]);

const drift = [];
for (const [relativePath, expected] of artifacts) {
  const target = resolve(packageRoot, relativePath);
  if (checkOnly) {
    let actual;
    try {
      actual = await readFile(target, 'utf8');
    } catch {
      actual = undefined;
    }
    if (actual !== expected) drift.push(relativePath);
  } else {
    await writeFile(target, expected, 'utf8');
  }
}

if (drift.length > 0) {
  console.error(`Generated contract drift: ${drift.join(', ')}`);
  process.exitCode = 1;
} else if (checkOnly) {
  console.log('Generated contracts are current.');
}
