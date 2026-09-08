import type { IntentResponse } from '@oneshot/contracts';
import { describe, expect, it } from 'vitest';

import {
  DEFAULT_EXPLORER_HOSTS,
  SanitizationError,
  assertNoSensitiveFields,
  sanitizeText,
  toSettlementDetailsView,
  validateExplorerUrl,
} from '../src/contract.js';
import { FIXTURE_EXPLORER_HOSTS, SETTLEMENT_SCENARIOS } from '../src/fixtures.js';

const COMMITTED = SETTLEMENT_SCENARIOS['authorized-committed']?.intent as IntentResponse;
const HASH = '0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa';

function scenarioIntent(name: string): IntentResponse {
  const scenario = SETTLEMENT_SCENARIOS[name];
  if (scenario === undefined) throw new Error(`Missing fixture: ${name}`);
  return scenario.intent;
}

describe('outbound explorer URL validation', () => {
  it('accepts an https link that references the displayed transaction', () => {
    const result = validateExplorerUrl(`https://testnet.arcscan.app/tx/${HASH}`, HASH);
    expect(result.href).toBe(`https://testnet.arcscan.app/tx/${HASH}`);
    expect(result.rejectedReason).toBeNull();
  });

  it('accepts the hash in a query parameter', () => {
    const result = validateExplorerUrl(`https://testnet.arcscan.app/search?tx=${HASH}`, HASH);
    expect(result.href).toBe(`https://testnet.arcscan.app/search?tx=${HASH}`);
  });

  it.each([
    ['javascript:alert(1)', 'scheme'],
    ['JavaScript:alert(1)', 'uppercase scheme'],
    [`data:text/html,<script>alert(1)</script>${HASH}`, 'data URL'],
    [`http://testnet.arcscan.app/tx/${HASH}`, 'plaintext http'],
    [`vbscript:msgbox(${HASH})`, 'vbscript'],
    [`https://user:pass@evil.example/tx/${HASH}`, 'embedded credentials'],
    ['https://testnet.arcscan.app/tx/0xdeadbeef', 'different transaction'],
    ['https://testnet.arcscan.app/tx/', 'no transaction reference'],
    ['/tx/relative', 'relative URL'],
    ['not a url', 'unparsable'],
    [`https://testnet.arcscan.app/tx/${HASH}\nlocation=1`, 'embedded newline'],
  ])('rejects %j (%s)', (candidate) => {
    const result = validateExplorerUrl(candidate, HASH);
    expect(result.href).toBeNull();
    expect(result.rejectedReason).not.toBeNull();
  });

  it('rejects a link longer than the contract bound', () => {
    const long = `https://testnet.arcscan.app/tx/${HASH}?padding=${'a'.repeat(300)}`;
    expect(validateExplorerUrl(long, HASH).href).toBeNull();
  });

  it('reports no link and no rejection when the field is absent', () => {
    expect(validateExplorerUrl(undefined, HASH)).toEqual({ href: null, rejectedReason: null });
    expect(validateExplorerUrl('   ', HASH)).toEqual({ href: null, rejectedReason: null });
  });

  it('refuses to bind a link to a malformed transaction hash', () => {
    expect(validateExplorerUrl('https://testnet.arcscan.app/tx/0xabc', '0xabc').href).toBeNull();
  });

  it('rejects a hostile host that quotes the real transaction hash back', () => {
    const result = validateExplorerUrl(`https://arcscan-app.example/tx/${HASH}`, HASH);
    expect(result.href).toBeNull();
    expect(result.rejectedReason).toBe('Explorer host is not on the allowlist.');
  });

  it.each([
    `https://evil.example/tx/${HASH}`,
    `https://testnet.arcscan.app.evil.example/tx/${HASH}`,
    `https://sub.testnet.arcscan.app/tx/${HASH}`,
  ])('rejects the off-allowlist host %j', (candidate) => {
    expect(validateExplorerUrl(candidate, HASH).rejectedReason).toBe(
      'Explorer host is not on the allowlist.',
    );
  });

  it('accepts a host on a caller-supplied allowlist, case-insensitively', () => {
    const result = validateExplorerUrl(`https://Explorer.Example/tx/${HASH}`, HASH, [
      'explorer.example',
    ]);
    expect(result.href).toBe(`https://explorer.example/tx/${HASH}`);
  });

  it('rejects every host when the allowlist is empty', () => {
    expect(validateExplorerUrl(`https://testnet.arcscan.app/tx/${HASH}`, HASH, []).href).toBeNull();
  });

  it('defaults to the documented Arc testnet explorer host', () => {
    expect(DEFAULT_EXPLORER_HOSTS).toEqual(['testnet.arcscan.app']);
  });
});

describe('sensitive field rejection', () => {
  it.each([
    ['app_secret', { app_secret: 'x' }],
    ['private_key', { private_key: 'x' }],
    ['seed_phrase', { seed_phrase: 'x' }],
    ['signature', { signature: '0xsig' }],
    ['access_token', { access_token: 'x' }],
    ['raw_policy_response', { raw_policy_response: {} }],
  ])('throws when the payload carries %s', (_label, extra) => {
    expect(() => assertNoSensitiveFields({ ...COMMITTED, ...extra })).toThrow(SanitizationError);
  });

  it('rejects a sensitive field nested inside an array element', () => {
    const payload = { attempts: [{ attempt_id: 'a', wallet_credential: 'x' }] };
    expect(() => assertNoSensitiveFields(payload)).toThrow(SanitizationError);
  });

  it('accepts every published fixture', () => {
    for (const scenario of Object.values(SETTLEMENT_SCENARIOS)) {
      expect(() => assertNoSensitiveFields(scenario.intent)).not.toThrow();
    }
  });
});

describe('text sanitization', () => {
  it('strips control characters', () => {
    expect(sanitizeText('Invoice\u0000 INV-1001\u001b')).toBe('Invoice  INV-1001');
  });

  it('bounds length', () => {
    const sanitized = sanitizeText('x'.repeat(400));
    expect(sanitized).not.toBeNull();
    expect(sanitized?.length).toBe(256);
  });

  it('returns null for empty or non-string input', () => {
    expect(sanitizeText('   ')).toBeNull();
    expect(sanitizeText(undefined)).toBeNull();
    expect(sanitizeText(null)).toBeNull();
  });
});

describe('settlement details projection', () => {
  it('projects every published scenario without throwing', () => {
    for (const scenario of Object.values(SETTLEMENT_SCENARIOS)) {
      expect(() => toSettlementDetailsView(scenario.intent)).not.toThrow();
    }
  });

  it('marks UNKNOWN as non-terminal', () => {
    const view = toSettlementDetailsView(scenarioIntent('unknown-reconcile-only'));
    expect(view.phase).toBe('PENDING_UNKNOWN');
    expect(view.terminal).toBe(false);
    expect(view.transaction).toBeNull();
  });

  it.each([
    ['authorized-committed', true],
    ['auth-denied-recipient', true],
    ['auth-cap-exceeded', true],
    ['auth-config-mismatch', true],
    ['auth-unavailable', true],
    ['auth-checking', false],
    ['ready-authorized', false],
    ['submitting-in-flight', false],
    ['unknown-reconcile-only', false],
  ])('derives terminality for %s as %s', (name, terminal) => {
    expect(toSettlementDetailsView(scenarioIntent(name)).terminal).toBe(terminal);
  });

  it('verifies a committed settlement backed by authoritative Arc evidence', () => {
    const view = toSettlementDetailsView(scenarioIntent('authorized-committed'), {
      allowedExplorerHosts: FIXTURE_EXPLORER_HOSTS,
    });
    expect(view.verification).toBe('VERIFIED');
    expect(view.transaction?.transactionHash).toBe(HASH);
    expect(view.transaction?.amountDisplay).toBe('1.250000');
    expect(view.transaction?.tokenContract).toBe('0x3600000000000000000000000000000000000000');
    expect(view.transaction?.transferLogIndex).toBe(0);
    expect(view.transaction?.explorer.href).toBe(`https://testnet.arcscan.io/tx/${HASH}`);
  });

  it('withholds transaction details when Arc evidence is not authoritative', () => {
    const view = toSettlementDetailsView(scenarioIntent('committed-without-arc-evidence'));
    expect(view.verification).toBe('UNVERIFIED');
    expect(view.transaction).toBeNull();
  });

  it('keeps a reverted settlement out of the verified path', () => {
    const view = toSettlementDetailsView(scenarioIntent('final-revert'));
    expect(view.phase).toBe('FINAL_FAILED_SAFE');
    expect(view.verification).toBe('UNVERIFIED');
    expect(view.transaction).toBeNull();
  });

  it('drops an unsafe explorer link on an otherwise verified settlement', () => {
    const view = toSettlementDetailsView(scenarioIntent('hostile-explorer-link'), {
      allowedExplorerHosts: FIXTURE_EXPLORER_HOSTS,
    });
    expect(view.verification).toBe('VERIFIED');
    expect(view.transaction?.explorer.href).toBeNull();
    expect(view.transaction?.explorer.rejectedReason).toBe('Explorer link must use https.');
  });

  it('reports cap comparison from integer atomic units', () => {
    const withinCap = toSettlementDetailsView(scenarioIntent('authorized-committed')).policy;
    expect(withinCap.amountWithinCap).toBe(true);
    expect(withinCap.settlementCapDisplay).toBe('10.000000');

    const exceeded = toSettlementDetailsView(scenarioIntent('auth-cap-exceeded')).policy;
    expect(exceeded.amountWithinCap).toBe(false);
    expect(exceeded.status).toBe('EXCEEDED');
  });

  it('treats a missing allowlist as unknown rather than allowed', () => {
    const view = toSettlementDetailsView(scenarioIntent('auth-config-mismatch'));
    expect(view.policy.recipientAllowlisted).toBeNull();
    expect(view.policy.status).toBe('NOT_CONFIGURED');
  });

  it('flags a recipient that is absent from a reported allowlist', () => {
    const view = toSettlementDetailsView(scenarioIntent('auth-denied-recipient'));
    expect(view.policy.recipientAllowlisted).toBe(false);
    expect(view.authorization.status).toBe('DENIED');
    expect(view.authorization.terminal).toBe(true);
  });

  it('drops a malformed cap instead of comparing against it', () => {
    const intent: IntentResponse = {
      ...COMMITTED,
      policy: { status: 'CONFIGURED', settlement_cap_atomic: '10.00' },
    };
    const view = toSettlementDetailsView(intent);
    expect(view.policy.settlementCapAtomic).toBeNull();
    expect(view.policy.amountWithinCap).toBeNull();
  });

  it('drops a malformed allowlist entry', () => {
    const intent: IntentResponse = {
      ...COMMITTED,
      policy: { status: 'CONFIGURED', allowed_recipients: ['not-an-address'] },
    };
    expect(toSettlementDetailsView(intent).policy.allowedRecipients).toEqual([]);
  });

  it('refuses to verify a settlement with a malformed transaction hash', () => {
    const settlement = COMMITTED.settlement;
    if (settlement === undefined) throw new Error('fixture is missing its settlement');
    const intent: IntentResponse = {
      ...COMMITTED,
      settlement: { ...settlement, transaction_hash: '0xshort' },
    };
    const view = toSettlementDetailsView(intent);
    expect(view.verification).toBe('UNVERIFIED');
    expect(view.transaction).toBeNull();
  });

  it('reports evidence availability without inferring non-payment from absence', () => {
    const view = toSettlementDetailsView(scenarioIntent('auth-checking'));
    expect(view.evidenceAvailable).toBe(false);
    expect(view.evidence).toEqual([]);
    expect(view.state).toBe('AUTHORIZING');
  });

  it('selects the attempt with the latest timestamp, not the last array element', () => {
    const intent: IntentResponse = {
      ...COMMITTED,
      attempts: [
        {
          attempt_id: 'attempt-newest',
          stage: 'REJECTED',
          created_at: '2026-09-08T12:30:00.000Z',
          authorization_status: 'DENIED',
        },
        {
          attempt_id: 'attempt-oldest',
          stage: 'AUTHORIZING',
          created_at: '2026-09-08T12:00:00.000Z',
          authorization_status: 'CHECKING',
        },
      ],
    };
    const view = toSettlementDetailsView(intent);
    expect(view.authorization.attemptId).toBe('attempt-newest');
    expect(view.authorization.status).toBe('DENIED');
  });

  it('keeps the later element when two attempts share a timestamp', () => {
    const intent: IntentResponse = {
      ...COMMITTED,
      attempts: [
        {
          attempt_id: 'attempt-first',
          stage: 'AUTHORIZING',
          created_at: '2026-09-08T12:00:00.000Z',
          authorization_status: 'CHECKING',
        },
        {
          attempt_id: 'attempt-second',
          stage: 'READY',
          created_at: '2026-09-08T12:00:00.000Z',
          authorization_status: 'AUTHORIZED',
        },
      ],
    };
    expect(toSettlementDetailsView(intent).authorization.attemptId).toBe('attempt-second');
  });

  it('never lets an undated attempt displace a dated one', () => {
    const intent: IntentResponse = {
      ...COMMITTED,
      attempts: [
        {
          attempt_id: 'attempt-dated',
          stage: 'READY',
          created_at: '2026-09-08T12:00:00.000Z',
          authorization_status: 'AUTHORIZED',
        },
        {
          attempt_id: 'attempt-undated',
          stage: 'AUTHORIZING',
          created_at: 'not-a-date',
          authorization_status: 'CHECKING',
        },
      ],
    };
    expect(toSettlementDetailsView(intent).authorization.attemptId).toBe('attempt-dated');
  });

  it('falls back to the first attempt when no timestamp parses', () => {
    const intent: IntentResponse = {
      ...COMMITTED,
      attempts: [
        { attempt_id: 'attempt-a', stage: 'AUTHORIZING', created_at: 'nope' },
        { attempt_id: 'attempt-b', stage: 'AUTHORIZING', created_at: 'also-nope' },
      ],
    };
    expect(toSettlementDetailsView(intent).authorization.attemptId).toBe('attempt-a');
  });

  it('reports no attempt when the list is empty', () => {
    const intent: IntentResponse = { ...COMMITTED, attempts: [] };
    const view = toSettlementDetailsView(intent);
    expect(view.authorization.attemptId).toBeNull();
    expect(view.authorization.status).toBe('NOT_REPORTED');
  });

  it('preserves lagging index freshness as an observation', () => {
    const view = toSettlementDetailsView(scenarioIntent('unknown-reconcile-only'));
    const graph = view.evidence.find((entry) => entry.source === 'THE_GRAPH');
    expect(graph?.authorityClass).toBe('OBSERVATION');
    expect(graph?.freshness).toBe('LAGGING');
  });
});
