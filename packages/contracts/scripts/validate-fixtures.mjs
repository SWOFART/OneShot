import { readdir, readFile } from 'node:fs/promises';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import Ajv2020 from 'ajv/dist/2020.js';
import addFormats from 'ajv-formats';

const packageRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const contractBundle = JSON.parse(
  await readFile(resolve(packageRoot, 'generated/contracts.schema.json'), 'utf8'),
);

const resultKinds = [
  'ACCEPTED',
  'REPLAY_IDENTICAL',
  'INTENT_PAYLOAD_CONFLICT',
  'AUTHORIZED',
  'DENIED',
  'UNAVAILABLE',
  'CONFIRMED',
  'DEFINITELY_NOT_SUBMITTED',
  'POSSIBLY_SUBMITTED',
  'FINAL_SUCCESS',
  'FINAL_REVERT',
  'PENDING',
  'NOT_FOUND',
  'FRESH',
  'LAGGING',
  'UNHEALTHY',
  'UNKNOWN_FRESHNESS',
];

const fixtureSchema = {
  $schema: 'https://json-schema.org/draft/2020-12/schema',
  type: 'object',
  additionalProperties: false,
  required: ['version', 'kind', 'intent', 'result_kind', 'expected'],
  properties: {
    version: { const: 'v1' },
    kind: {
      enum: [
        'intent.accepted',
        'intent.replay-identical',
        'intent.replay-conflict',
        'authorization.allowed',
        'authorization.denied',
        'settlement.confirmed',
        'settlement.lost-response',
        'evidence.not-found',
        'index.candidate-one',
      ],
    },
    intent: contractBundle.$defs.CreateIntentRequest,
    result_kind: { enum: resultKinds },
    expected: {
      type: 'object',
      additionalProperties: false,
      required: ['intent_state', 'external_submission_count'],
      properties: {
        intent_state: { enum: contractBundle.$defs.IntentResponse.properties.state.enum },
        external_submission_count: { type: 'integer', minimum: 0, maximum: 1 },
        error_code: { enum: contractBundle.$defs.ErrorResponse.properties.code.enum },
      },
    },
    settlement: contractBundle.$defs.Settlement,
    observation: {
      type: 'object',
      additionalProperties: false,
      required: ['candidate_count', 'health'],
      properties: {
        candidate_count: { type: 'integer', minimum: 0, maximum: 100 },
        health: {
          enum: ['FRESH', 'LAGGING', 'UNHEALTHY', 'UNAVAILABLE', 'UNKNOWN_FRESHNESS'],
        },
      },
    },
  },
};

const uiFixtureSchema = {
  $schema: 'https://json-schema.org/draft/2020-12/schema',
  type: 'object',
  additionalProperties: false,
  required: ['scenario', 'description', 'intent', 'recovery_view'],
  $defs: contractBundle.$defs,
  properties: {
    scenario: { type: 'string', minLength: 1 },
    description: { type: 'string', minLength: 1 },
    intent: contractBundle.$defs.IntentResponse,
    recovery_view: contractBundle.$defs.RecoveryView,
  },
};

const ajv = new Ajv2020({ allErrors: true, strict: true });
addFormats(ajv);
const validate = ajv.compile(fixtureSchema);
const validateUi = ajv.compile(uiFixtureSchema);
const forbiddenKey =
  /^(?:private[_-]?key|seed[_-]?phrase|mnemonic|api[_-]?key|access[_-]?token|wallet[_-]?credentials?)$/iu;

function rejectSensitiveKeys(value, path = '$') {
  if (Array.isArray(value)) {
    value.forEach((entry, index) => rejectSensitiveKeys(entry, `${path}[${index}]`));
    return;
  }
  if (typeof value !== 'object' || value === null) return;
  for (const [key, child] of Object.entries(value)) {
    if (forbiddenKey.test(key))
      throw new Error(`Forbidden sensitive fixture field at ${path}.${key}`);
    rejectSensitiveKeys(child, `${path}.${key}`);
  }
}

export function validateFixtureObject(value, source = '<memory>') {
  rejectSensitiveKeys(value);
  if (!validate(value)) {
    const details = ajv.errorsText(validate.errors, { separator: '; ' });
    throw new Error(`Invalid fixture ${source}: ${details}`);
  }
  return value;
}

export function validateUiFixtureObject(value, source = '<memory>') {
  rejectSensitiveKeys(value);
  if (!validateUi(value)) {
    const details = ajv.errorsText(validateUi.errors, { separator: '; ' });
    throw new Error(`Invalid UI fixture ${source}: ${details}`);
  }
  return value;
}

async function jsonFiles(directory) {
  const result = [];
  for (const entry of await readdir(directory, { withFileTypes: true })) {
    const path = join(directory, entry.name);
    if (entry.isDirectory()) result.push(...(await jsonFiles(path)));
    else if (entry.isFile() && entry.name.endsWith('.json')) result.push(path);
  }
  return result.sort();
}

export async function validateFixtureDirectory(directory = resolve(packageRoot, 'fixtures', 'v1')) {
  const files = await jsonFiles(directory);
  if (files.length === 0) throw new Error(`No fixtures found under ${directory}`);
  for (const file of files) {
    const value = JSON.parse(await readFile(file, 'utf8'));
    validateFixtureObject(value, file);
  }
  return files;
}

export async function validateUiFixtureDirectory(
  directory = resolve(packageRoot, 'fixtures', 'ui', 'v1'),
) {
  const files = await jsonFiles(directory);
  if (files.length === 0) throw new Error(`No UI fixtures found under ${directory}`);
  for (const file of files) {
    const value = JSON.parse(await readFile(file, 'utf8'));
    validateUiFixtureObject(value, file);
  }
  return files;
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const backendFiles = await validateFixtureDirectory();
  const uiFiles = await validateUiFixtureDirectory();
  console.log(
    `Validated ${backendFiles.length} contracts-v1 fixtures and ${uiFiles.length} ui-v1 fixtures.`,
  );
}
