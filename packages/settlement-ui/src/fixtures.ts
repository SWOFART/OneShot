import { UI_FIXTURES, type IntentResponse } from '@oneshot/contracts';

export type ScenarioSource = 'FROZEN_CONTRACT_PACK' | 'LANE_B_LOCAL';

export interface SettlementScenario {
  readonly scenario: string;
  readonly description: string;
  readonly source: ScenarioSource;
  readonly intent: IntentResponse;
}

const RECIPIENT = '0x1111111111111111111111111111111111111111';
const TOKEN_CONTRACT = '0x3600000000000000000000000000000000000000';
const REVERT_HASH = '0xbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb';
const HOSTILE_HASH = '0xcccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccc';

const BASE_POLICY = {
  policy_id: 'privy-policy-arc-prod',
  status: 'CONFIGURED',
  settlement_cap_atomic: '10000000',
  allowed_recipients: [RECIPIENT],
} as const;

function baseIntent(
  overrides: Partial<IntentResponse> & { readonly state: IntentResponse['state'] },
): IntentResponse {
  return {
    business_intent_id: 'placeholder',
    payload_fingerprint: 'b000000000000000000000000000000000000000000000000000000000000001',
    recipient: RECIPIENT,
    amount_atomic: '1250000',
    asset: 'USDC',
    network: 'eip155:5042002',
    purpose: 'Invoice INV-1001',
    version: 1,
    policy: BASE_POLICY,
    attempts: [],
    evidence: [],
    ...overrides,
  };
}

/**
 * States B05.3 requires that the frozen contract pack does not carry.
 *
 * Published contract fixture digests are immutable, so these live in the Lane B
 * package instead of being added to `@oneshot/contracts`. They are built from
 * the same frozen schema and carry no secret or wallet material.
 */
const LOCAL_SCENARIOS: readonly SettlementScenario[] = [
  {
    scenario: 'ready-authorized',
    description: 'Authorized and holding submission ownership, with nothing submitted yet',
    source: 'LANE_B_LOCAL',
    intent: baseIntent({
      business_intent_id: '018f-ui-ready-101',
      state: 'READY',
      version: 2,
      attempts: [
        {
          attempt_id: 'attempt-ui-101',
          stage: 'READY',
          created_at: '2026-09-08T13:00:00.000Z',
          authorization_status: 'AUTHORIZED',
        },
      ],
      evidence: [
        {
          source: 'PRIVY',
          authority_class: 'AUTHORITATIVE',
          retrieved_at: '2026-09-08T13:00:01.000Z',
          digest: 'digest-ready-101',
        },
      ],
    }),
  },
  {
    scenario: 'submitting-in-flight',
    description: 'An attempt is crossing the provider boundary with no known outcome',
    source: 'LANE_B_LOCAL',
    intent: baseIntent({
      business_intent_id: '018f-ui-submitting-102',
      state: 'SUBMITTING',
      version: 3,
      attempts: [
        {
          attempt_id: 'attempt-ui-102',
          stage: 'SUBMITTING',
          created_at: '2026-09-08T13:05:00.000Z',
          authorization_status: 'AUTHORIZED',
        },
      ],
      evidence: [
        {
          source: 'ONESHOT',
          authority_class: 'AUTHORITATIVE',
          retrieved_at: '2026-09-08T13:05:01.000Z',
          digest: 'digest-submitting-102',
        },
      ],
    }),
  },
  {
    scenario: 'final-revert',
    description: 'Broadcast transaction reverted on Arc and closed without a committed settlement',
    source: 'LANE_B_LOCAL',
    intent: baseIntent({
      business_intent_id: '018f-ui-revert-103',
      state: 'FAILED_SAFE',
      version: 4,
      attempts: [
        {
          attempt_id: 'attempt-ui-103',
          stage: 'FAILED_SAFE',
          created_at: '2026-09-08T13:10:00.000Z',
          sanitized_error: 'Arc receipt status reverted; no ERC-20 Transfer was emitted',
          authorization_status: 'AUTHORIZED',
        },
      ],
      settlement: {
        provider_reference_id: 'arc-tx-103',
        transaction_hash: REVERT_HASH,
        block_number: '210',
        transfer_log_index: 0,
        token_contract: TOKEN_CONTRACT,
        explorer_url: `https://testnet.arcscan.io/tx/${REVERT_HASH}`,
      },
      evidence: [
        {
          source: 'ARC',
          authority_class: 'AUTHORITATIVE',
          retrieved_at: '2026-09-08T13:10:05.000Z',
          digest: 'digest-revert-103',
          block_number: '210',
        },
      ],
    }),
  },
  {
    scenario: 'hostile-explorer-link',
    description: 'Committed settlement whose published explorer link fails outbound validation',
    source: 'LANE_B_LOCAL',
    intent: baseIntent({
      business_intent_id: '018f-ui-hostile-104',
      state: 'COMMITTED',
      version: 4,
      purpose: 'Invoice <script>alert(1)</script>',
      attempts: [
        {
          attempt_id: 'attempt-ui-104',
          stage: 'COMMITTED',
          created_at: '2026-09-08T13:15:00.000Z',
          authorization_status: 'AUTHORIZED',
        },
      ],
      settlement: {
        provider_reference_id: 'arc-tx-104',
        transaction_hash: HOSTILE_HASH,
        block_number: '220',
        transfer_log_index: 1,
        token_contract: TOKEN_CONTRACT,
        explorer_url: 'javascript:alert(document.domain)',
      },
      evidence: [
        {
          source: 'ARC',
          authority_class: 'AUTHORITATIVE',
          retrieved_at: '2026-09-08T13:15:05.000Z',
          digest: 'digest-hostile-104',
          block_number: '220',
        },
      ],
    }),
  },
  {
    scenario: 'committed-without-arc-evidence',
    description: 'Committed record with no authoritative Arc observation, so details stay withheld',
    source: 'LANE_B_LOCAL',
    intent: baseIntent({
      business_intent_id: '018f-ui-unverified-105',
      state: 'COMMITTED',
      version: 4,
      attempts: [
        {
          attempt_id: 'attempt-ui-105',
          stage: 'COMMITTED',
          created_at: '2026-09-08T13:20:00.000Z',
          authorization_status: 'AUTHORIZED',
        },
      ],
      settlement: {
        provider_reference_id: 'arc-tx-105',
        transaction_hash: '0xdddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddd',
        block_number: '230',
        transfer_log_index: 0,
      },
      evidence: [
        {
          source: 'THE_GRAPH',
          authority_class: 'OBSERVATION',
          retrieved_at: '2026-09-08T13:20:05.000Z',
          digest: 'digest-unverified-105',
          freshness: 'FRESH',
        },
      ],
    }),
  },
];

const FROZEN_SCENARIOS: readonly SettlementScenario[] = Object.values(UI_FIXTURES).map(
  (fixture) => ({
    scenario: fixture.scenario,
    description: fixture.description,
    source: 'FROZEN_CONTRACT_PACK' as const,
    intent: fixture.intent,
  }),
);

export const SETTLEMENT_SCENARIOS: Readonly<Record<string, SettlementScenario>> = Object.freeze(
  Object.fromEntries(
    [...FROZEN_SCENARIOS, ...LOCAL_SCENARIOS].map((scenario) => [scenario.scenario, scenario]),
  ),
);

/** Business Intent id to intent, for `createInMemorySettlementClient`. */
export const SETTLEMENT_SCENARIO_INTENTS: Readonly<Record<string, IntentResponse>> = Object.freeze(
  Object.fromEntries(
    Object.values(SETTLEMENT_SCENARIOS).map((scenario) => [
      scenario.intent.business_intent_id,
      scenario.intent,
    ]),
  ),
);

export function scenarioNames(): readonly string[] {
  return Object.keys(SETTLEMENT_SCENARIOS);
}
