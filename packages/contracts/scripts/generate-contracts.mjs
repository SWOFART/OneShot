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
  Attempt: {
    type: 'object',
    additionalProperties: false,
    required: ['attempt_id', 'stage', 'created_at'],
    properties: {
      attempt_id: boundedId,
      stage: { type: 'string', enum: intentStates },
      created_at: { type: 'string', format: 'date-time' },
      sanitized_error: { type: 'string', minLength: 1, maxLength: 256 },
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
  RecoveryView: {
    type: 'object',
    additionalProperties: false,
    required: ['business_intent_id', 'authoritative_state', 'recommended_action', 'evidence'],
    properties: {
      business_intent_id: boundedId,
      authoritative_state: { type: 'string', enum: intentStates },
      recommended_action: { type: 'string', enum: recoveryActions },
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

const generatedTypes = `// Generated by scripts/generate-contracts.mjs. Do not edit.\n\nexport const INTENT_STATES = ${JSON.stringify(intentStates)} as const;\nexport type IntentState = (typeof INTENT_STATES)[number];\n\nexport const ERROR_CODES = ${JSON.stringify(errorCodes)} as const;\nexport type ErrorCode = (typeof ERROR_CODES)[number];\n\nexport const RECOVERY_ACTIONS = ${JSON.stringify(recoveryActions)} as const;\nexport type RecoveryActionName = (typeof RECOVERY_ACTIONS)[number];\n\nexport interface CreateIntentRequest {\n  readonly business_intent_id: string;\n  readonly recipient: string;\n  readonly amount_atomic: string;\n  readonly asset: 'USDC';\n  readonly network: 'eip155:5042002';\n  readonly purpose: string;\n}\n\nexport interface IntentResponse extends CreateIntentRequest {\n  readonly payload_fingerprint: string;\n  readonly state: IntentState;\n  readonly version: number;\n  readonly attempts: readonly AttemptView[];\n  readonly settlement?: SettlementView;\n  readonly evidence: readonly EvidenceView[];\n}\n\nexport interface AttemptView {\n  readonly attempt_id: string;\n  readonly stage: IntentState;\n  readonly created_at: string;\n  readonly sanitized_error?: string;\n}\n\nexport interface SettlementView {\n  readonly provider_reference_id: string;\n  readonly transaction_hash: string;\n  readonly block_number: string;\n  readonly transfer_log_index: number;\n}\n\nexport interface EvidenceView {\n  readonly source: 'ONESHOT' | 'PRIVY' | 'ARC' | 'THE_GRAPH' | 'LLM';\n  readonly authority_class: 'AUTHORITATIVE' | 'OBSERVATION' | 'ADVISORY';\n  readonly retrieved_at: string;\n  readonly digest: string;\n  readonly block_number?: string;\n  readonly freshness?: 'FRESH' | 'LAGGING' | 'UNHEALTHY' | 'UNAVAILABLE' | 'UNKNOWN_FRESHNESS';\n}\n\nexport interface ReconcileResponse {\n  readonly business_intent_id: string;\n  readonly queued: boolean;\n  readonly state: IntentState;\n}\n\nexport interface RecoveryView {\n  readonly business_intent_id: string;\n  readonly authoritative_state: IntentState;\n  readonly recommended_action: RecoveryActionName;\n  readonly evidence: readonly EvidenceView[];\n}\n\nexport interface ErrorResponse {\n  readonly code: ErrorCode;\n  readonly message: string;\n  readonly correlation_id: string;\n}\n`;

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
