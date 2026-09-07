import type { EvidenceView } from '@oneshot/contracts';

export interface DatabaseIntentRow {
  readonly business_intent_id: string;
  readonly payload_fingerprint: string;
  readonly recipient: string;
  readonly amount_atomic: string;
  readonly asset: 'USDC';
  readonly network: 'eip155:5042002';
  readonly purpose: string;
  readonly state:
    'AUTHORIZING' | 'READY' | 'SUBMITTING' | 'COMMITTED' | 'FAILED_SAFE' | 'UNKNOWN' | 'REJECTED';
  readonly version: number;
  readonly created_at: string;
  readonly updated_at: string;
}

export interface DatabaseAttemptRow {
  readonly attempt_id: string;
  readonly business_intent_id: string;
  readonly attempt_sequence: number;
  readonly stage:
    'AUTHORIZING' | 'READY' | 'SUBMITTING' | 'COMMITTED' | 'FAILED_SAFE' | 'UNKNOWN' | 'REJECTED';
  readonly correlation_id: string;
  readonly request_body_fingerprint: string;
  readonly token_contract: string;
  readonly method: string;
  readonly native_value_atomic: string;
  readonly sanitized_error?: string | null;
  readonly created_at: string;
}

export interface DatabaseSettlementRow {
  readonly business_intent_id: string;
  readonly provider_reference_id: string;
  readonly transaction_hash: string;
  readonly block_number: string;
  readonly transfer_log_index: number;
  readonly committed_at: string;
}

export interface DatabaseEvidenceRow {
  readonly business_intent_id: string;
  readonly source: EvidenceView['source'];
  readonly authority_class: EvidenceView['authority_class'];
  readonly retrieved_at: string;
  readonly digest: string;
  readonly block_number?: string | null;
  readonly freshness?: EvidenceView['freshness'] | null;
}

export interface DatabaseOutboxRow {
  readonly business_intent_id: string;
  readonly job_key: string;
  readonly task_identifier: 'authorize_intent' | 'reconcile_intent' | 'submit_settlement';
  readonly payload: Record<string, unknown>;
  readonly status: 'PENDING' | 'DELIVERED' | 'DISABLED';
  readonly available_at: string;
  readonly created_at: string;
}

export interface StorageV1Snapshot {
  readonly name: string;
  readonly description: string;
  readonly intents: readonly DatabaseIntentRow[];
  readonly attempts: readonly DatabaseAttemptRow[];
  readonly settlements: readonly DatabaseSettlementRow[];
  readonly evidence: readonly DatabaseEvidenceRow[];
  readonly outbox_jobs: readonly DatabaseOutboxRow[];
}

export const SYNTHETIC_ACCEPTED_INTENT_FIXTURE: StorageV1Snapshot = {
  name: 'accepted-authorizing',
  description: 'Initial intent accepted with first attempt and queued authorize outbox job',
  intents: [
    {
      business_intent_id: 'intent-fixture-accepted-1',
      payload_fingerprint: 'd846986fabcaf95b53dcd425108fe8fe0b8e59f58a21427b2a806ff5564ef4f9',
      recipient: '0xabcdefabcdefabcdefabcdefabcdefabcdefabcd',
      amount_atomic: '1250000',
      asset: 'USDC',
      network: 'eip155:5042002',
      purpose: 'Café invoice',
      state: 'AUTHORIZING',
      version: 1,
      created_at: '2026-09-07T12:00:00.000Z',
      updated_at: '2026-09-07T12:00:00.000Z',
    },
  ],
  attempts: [
    {
      attempt_id: 'attempt-fixture-1',
      business_intent_id: 'intent-fixture-accepted-1',
      attempt_sequence: 1,
      stage: 'AUTHORIZING',
      correlation_id: 'correlation-fixture-1',
      request_body_fingerprint: 'd846986fabcaf95b53dcd425108fe8fe0b8e59f58a21427b2a806ff5564ef4f9',
      token_contract: '0x3600000000000000000000000000000000000000',
      method: 'transfer',
      native_value_atomic: '0',
      sanitized_error: null,
      created_at: '2026-09-07T12:00:00.000Z',
    },
  ],
  settlements: [],
  evidence: [],
  outbox_jobs: [
    {
      business_intent_id: 'intent-fixture-accepted-1',
      job_key: 'authorize:intent-fixture-accepted-1:1',
      task_identifier: 'authorize_intent',
      payload: { business_intent_id: 'intent-fixture-accepted-1' },
      status: 'PENDING',
      available_at: '2026-09-07T12:00:00.000Z',
      created_at: '2026-09-07T12:00:00.000Z',
    },
  ],
};

export const SYNTHETIC_COMMITTED_INTENT_FIXTURE: StorageV1Snapshot = {
  name: 'committed-with-settlement',
  description:
    'Committed intent with confirmed settlement row and authoritative evidence observation',
  intents: [
    {
      business_intent_id: 'intent-fixture-committed-1',
      payload_fingerprint: 'd846986fabcaf95b53dcd425108fe8fe0b8e59f58a21427b2a806ff5564ef4f9',
      recipient: '0xabcdefabcdefabcdefabcdefabcdefabcdefabcd',
      amount_atomic: '1250000',
      asset: 'USDC',
      network: 'eip155:5042002',
      purpose: 'Café invoice',
      state: 'COMMITTED',
      version: 2,
      created_at: '2026-09-07T12:00:00.000Z',
      updated_at: '2026-09-07T12:00:05.000Z',
    },
  ],
  attempts: [
    {
      attempt_id: 'attempt-fixture-2',
      business_intent_id: 'intent-fixture-committed-1',
      attempt_sequence: 1,
      stage: 'COMMITTED',
      correlation_id: 'correlation-fixture-2',
      request_body_fingerprint: 'd846986fabcaf95b53dcd425108fe8fe0b8e59f58a21427b2a806ff5564ef4f9',
      token_contract: '0x3600000000000000000000000000000000000000',
      method: 'transfer',
      native_value_atomic: '0',
      sanitized_error: null,
      created_at: '2026-09-07T12:00:00.000Z',
    },
  ],
  settlements: [
    {
      business_intent_id: 'intent-fixture-committed-1',
      provider_reference_id: 'provider-ref-fixture-1',
      transaction_hash: '0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa',
      block_number: '5042002',
      transfer_log_index: 0,
      committed_at: '2026-09-07T12:00:05.000Z',
    },
  ],
  evidence: [
    {
      business_intent_id: 'intent-fixture-committed-1',
      source: 'ONESHOT',
      authority_class: 'AUTHORITATIVE',
      retrieved_at: '2026-09-07T12:00:05.000Z',
      digest: 'digest-fixture-settled',
      block_number: '5042002',
      freshness: 'FRESH',
    },
  ],
  outbox_jobs: [
    {
      business_intent_id: 'intent-fixture-committed-1',
      job_key: 'authorize:intent-fixture-committed-1:1',
      task_identifier: 'authorize_intent',
      payload: { business_intent_id: 'intent-fixture-committed-1' },
      status: 'DELIVERED',
      available_at: '2026-09-07T12:00:00.000Z',
      created_at: '2026-09-07T12:00:00.000Z',
    },
  ],
};

export const SYNTHETIC_UNKNOWN_RECONCILING_FIXTURE: StorageV1Snapshot = {
  name: 'unknown-reconciling',
  description: 'Intent in UNKNOWN state with failed attempt and reconcile outbox job queued',
  intents: [
    {
      business_intent_id: 'intent-fixture-unknown-1',
      payload_fingerprint: 'd846986fabcaf95b53dcd425108fe8fe0b8e59f58a21427b2a806ff5564ef4f9',
      recipient: '0xabcdefabcdefabcdefabcdefabcdefabcdefabcd',
      amount_atomic: '1250000',
      asset: 'USDC',
      network: 'eip155:5042002',
      purpose: 'Café invoice',
      state: 'UNKNOWN',
      version: 2,
      created_at: '2026-09-07T12:00:00.000Z',
      updated_at: '2026-09-07T12:01:00.000Z',
    },
  ],
  attempts: [
    {
      attempt_id: 'attempt-fixture-3',
      business_intent_id: 'intent-fixture-unknown-1',
      attempt_sequence: 1,
      stage: 'UNKNOWN',
      correlation_id: 'correlation-fixture-3',
      request_body_fingerprint: 'd846986fabcaf95b53dcd425108fe8fe0b8e59f58a21427b2a806ff5564ef4f9',
      token_contract: '0x3600000000000000000000000000000000000000',
      method: 'transfer',
      native_value_atomic: '0',
      sanitized_error: 'Provider response timeout during settlement',
      created_at: '2026-09-07T12:00:00.000Z',
    },
  ],
  settlements: [],
  evidence: [
    {
      business_intent_id: 'intent-fixture-unknown-1',
      source: 'ARC',
      authority_class: 'OBSERVATION',
      retrieved_at: '2026-09-07T12:01:00.000Z',
      digest: 'digest-fixture-observation',
      block_number: null,
      freshness: 'UNKNOWN_FRESHNESS',
    },
  ],
  outbox_jobs: [
    {
      business_intent_id: 'intent-fixture-unknown-1',
      job_key: 'reconcile:intent-fixture-unknown-1:2',
      task_identifier: 'reconcile_intent',
      payload: { business_intent_id: 'intent-fixture-unknown-1' },
      status: 'PENDING',
      available_at: '2026-09-07T12:01:00.000Z',
      created_at: '2026-09-07T12:01:00.000Z',
    },
  ],
};

export const SYNTHETIC_STORAGE_FIXTURES: readonly StorageV1Snapshot[] = [
  SYNTHETIC_ACCEPTED_INTENT_FIXTURE,
  SYNTHETIC_COMMITTED_INTENT_FIXTURE,
  SYNTHETIC_UNKNOWN_RECONCILING_FIXTURE,
];
