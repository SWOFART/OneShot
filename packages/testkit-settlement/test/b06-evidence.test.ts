import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import { ARC_MAINNET } from '@oneshot/arc-adapter';
import { describe, expect, it } from 'vitest';

import {
  EvidenceError,
  auditSanitization,
  buildEvidenceReport,
  buildQualificationInput,
  checkAmbiguityEvidence,
  checkArcEvidence,
  checkExplorerUrl,
  checkMainnetReadiness,
  checkPrivyEvidence,
  formatEvidenceReport,
  parseSettlementProof,
  type EvidenceSection,
  type SanitizedSettlementProof,
} from '../src/b06-evidence.js';

const repoRoot = process.cwd().endsWith('testkit-settlement')
  ? join(process.cwd(), '..', '..')
  : process.cwd();

const RAW_PROOF: unknown = JSON.parse(
  readFileSync(join(repoRoot, 'evidence', 'c06', 'sanitized-proof.json'), 'utf8'),
);

const INDEX: unknown = JSON.parse(
  readFileSync(join(repoRoot, 'evidence', 'b06', 'evidence-index.json'), 'utf8'),
);

const PROOF = parseSettlementProof(RAW_PROOF);
const HASH = PROOF.settlement.transaction_hash;

const ARTIFACTS = [
  { path: 'docs/SAFE_DISABLE_RUNBOOK.md', present: true },
  { path: 'Dockerfile.api', present: true },
];

function mutate(patch: Record<string, unknown>): SanitizedSettlementProof {
  return parseSettlementProof({ ...(RAW_PROOF as Record<string, unknown>), ...patch });
}

function failed(section: EvidenceSection): readonly string[] {
  return section.checks.filter((c) => c.status === 'FAIL').map((c) => c.id);
}

describe('proof parsing', () => {
  it('accepts the published bundle', () => {
    expect(PROOF.status).toBe('LIVE_RUN');
    expect(PROOF.denials).toHaveLength(2);
  });

  it.each([
    ['schemaVersion', { schemaVersion: 'settlement-evidence-v99' }],
    ['status', { status: '' }],
    ['denials', { denials: [] }],
    ['settlement', { settlement: {} }],
    ['recovery', { recovery: {} }],
  ])('rejects a bundle with a bad %s', (_label, patch) => {
    expect(() => parseSettlementProof({ ...(RAW_PROOF as object), ...patch })).toThrow(
      EvidenceError,
    );
  });

  it('rejects a non-object bundle', () => {
    expect(() => parseSettlementProof('nope')).toThrow(EvidenceError);
  });

  it.each([
    ['null', null],
    ['a non-object', 'receipt'],
    ['a receipt missing from', { chainId: 1, to: '0x1', status: 1, logs: [] }],
    ['a receipt missing logs', { chainId: 1, from: '0x1', to: '0x2', status: 1 }],
    ['a receipt whose logs are not an array', { chainId: 1, from: '0x1', to: '0x2', status: 1, logs: {} }],
    ['a receipt missing chainId', { from: '0x1', to: '0x2', status: 1, logs: [] }],
    [
      'a receipt whose log is not an object',
      { chainId: 1, from: '0x1', to: '0x2', status: 1, logs: ['nope'] },
    ],
    [
      'a receipt whose log has no topics array',
      {
        chainId: 1,
        from: '0x1',
        to: '0x2',
        status: 1,
        logs: [{ address: '0x1', data: '0x0', logIndex: 0 }],
      },
    ],
    [
      'a receipt whose log topics are not strings',
      {
        chainId: 1,
        from: '0x1',
        to: '0x2',
        status: 1,
        logs: [{ address: '0x1', data: '0x0', logIndex: 0, topics: [42] }],
      },
    ],
    [
      'a receipt whose log is missing address',
      {
        chainId: 1,
        from: '0x1',
        to: '0x2',
        status: 1,
        logs: [{ data: '0x0', logIndex: 0, topics: [] }],
      },
    ],
  ])('rejects %s receipt as a structured failure', (_label, receipt) => {
    expect(() => parseSettlementProof({ ...(RAW_PROOF as object), receipt })).toThrow(EvidenceError);
  });
});

describe('B06.1 Privy authorization boundary', () => {
  it('passes on the recorded evidence', () => {
    expect(checkPrivyEvidence(PROOF).status).toBe('PASS');
  });

  it('fails when a denial recorded a broadcast', () => {
    const denials = PROOF.denials.map((d, i) => (i === 0 ? { ...d, broadcast_count: 1 } : d));
    const section = checkPrivyEvidence(mutate({ denials }));
    expect(section.status).toBe('FAIL');
    expect(failed(section)).toContain('privy.zero-settlement.unauthorized_recipient');
  });

  it('fails when a denial recorded a settlement', () => {
    const denials = PROOF.denials.map((d, i) => (i === 1 ? { ...d, settlement_count: 1 } : d));
    expect(checkPrivyEvidence(mutate({ denials })).status).toBe('FAIL');
  });

  it('fails when a denial dimension is missing', () => {
    const section = checkPrivyEvidence(mutate({ denials: [PROOF.denials[0]] }));
    expect(failed(section)).toContain('privy.denial-coverage');
  });

  it('fails when the above-cap drill did not exceed the cap', () => {
    const denials = PROOF.denials.map((d) =>
      d.dimension === 'ABOVE_CAP_AMOUNT'
        ? { ...d, attempted_amount_atomic: '500000', configured_cap_atomic: '1000000' }
        : d,
    );
    expect(failed(checkPrivyEvidence(mutate({ denials })))).toContain('privy.cap-exceeded');
  });

  it('fails when the above-cap drill did not record both amounts', () => {
    const denials = PROOF.denials.map((d) =>
      d.dimension === 'ABOVE_CAP_AMOUNT'
        ? {
            dimension: d.dimension,
            expected_outcome: d.expected_outcome,
            observed_status: d.observed_status,
            observed_code: d.observed_code,
            broadcast_count: d.broadcast_count,
            settlement_count: d.settlement_count,
          }
        : d,
    );
    expect(failed(checkPrivyEvidence(mutate({ denials })))).toContain('privy.cap-exceeded');
  });

  it('fails when the recipient drill did not record the denied recipient', () => {
    const denials = PROOF.denials.map((d) =>
      d.dimension === 'UNAUTHORIZED_RECIPIENT'
        ? {
            dimension: d.dimension,
            expected_outcome: d.expected_outcome,
            observed_status: d.observed_status,
            observed_code: d.observed_code,
            broadcast_count: d.broadcast_count,
            settlement_count: d.settlement_count,
          }
        : d,
    );
    expect(failed(checkPrivyEvidence(mutate({ denials })))).toContain(
      'privy.denied-recipient-differs',
    );
  });

  it('fails when the denied recipient is the authorized recipient', () => {
    const denials = PROOF.denials.map((d) =>
      d.dimension === 'UNAUTHORIZED_RECIPIENT'
        ? { ...d, target_recipient: PROOF.recipient }
        : d,
    );
    expect(failed(checkPrivyEvidence(mutate({ denials })))).toContain(
      'privy.denied-recipient-differs',
    );
  });

  it('fails when the provider did not refuse with an error status', () => {
    const denials = PROOF.denials.map((d) => ({ ...d, observed_status: 200 }));
    expect(checkPrivyEvidence(mutate({ denials })).status).toBe('FAIL');
  });
});

describe('B06.2 Arc settlement rail', () => {
  it('passes on the recorded evidence', () => {
    expect(checkArcEvidence(PROOF).status).toBe('PASS');
  });

  it('fails on a different network', () => {
    expect(failed(checkArcEvidence(mutate({ network: 'eip155:1' })))).toContain('arc.network-pinned');
  });

  it('fails on a token contract that is not the pinned USDC interface', () => {
    const patched = mutate({ token_contract: '0x0000000000000000000000000000000000000001' });
    expect(failed(checkArcEvidence(patched))).toContain('arc.token-pinned');
  });

  it('fails on a malformed transaction identity', () => {
    const settlement = { ...PROOF.settlement, transaction_hash: '0xdeadbeef' };
    expect(failed(checkArcEvidence(mutate({ settlement })))).toContain('arc.transaction-identity');
  });

  it('fails on a non-integer amount', () => {
    expect(failed(checkArcEvidence(mutate({ amount_atomic: '1.00' })))).toContain(
      'arc.amount-integer',
    );
  });

  it('fails when the explorer link points at another host', () => {
    const settlement = { ...PROOF.settlement, explorer_url: `https://evil.example/tx/${HASH}` };
    expect(failed(checkArcEvidence(mutate({ settlement })))).toContain('arc.explorer-binding');
  });

  it('re-verifies a recorded receipt through the adapter', () => {
    const receipt = {
      chainId: 5042002,
      transactionHash: HASH,
      from: PROOF.execution_wallet,
      to: PROOF.token_contract,
      status: 1,
      blockNumber: PROOF.settlement.block_number,
      logs: [
        {
          address: PROOF.token_contract,
          logIndex: PROOF.settlement.transfer_log_index,
          topics: [
            '0xddf252ad1be2c89b69c2b068fc378daa952ba7f163c4a11628f55a4df523b3ef',
            `0x000000000000000000000000${PROOF.execution_wallet.slice(2)}`,
            `0x000000000000000000000000${PROOF.recipient.slice(2)}`,
          ],
          data: `0x${BigInt(PROOF.amount_atomic).toString(16).padStart(64, '0')}`,
        },
      ],
    };
    const section = checkArcEvidence(mutate({ receipt }));
    const receiptCheck = section.checks.find((c) => c.id === 'arc.receipt-verified');
    expect(receiptCheck?.status).toBe('PASS');
    expect(section.status).toBe('PASS');
  });

  it('fails when a recorded receipt does not prove the expected transfer', () => {
    const receipt = {
      chainId: 5042002,
      transactionHash: HASH,
      from: PROOF.execution_wallet,
      to: PROOF.token_contract,
      status: 1,
      blockNumber: PROOF.settlement.block_number,
      logs: [],
    };
    expect(failed(checkArcEvidence(mutate({ receipt })))).toContain('arc.receipt-verified');
  });
});

describe('recorded-only evidence labelling', () => {
  it('does not claim receipt re-verification when the bundle has no receipt', () => {
    const ids = checkArcEvidence(PROOF).checks.map((c) => c.id);
    expect(ids).toContain('arc.transfer-identity-recorded');
    expect(ids).not.toContain('arc.receipt-verified');
  });
});

describe('explorer link validation', () => {
  it('accepts the published link', () => {
    expect(checkExplorerUrl(PROOF.settlement.explorer_url, HASH)).toBeNull();
  });

  it.each([
    [`http://testnet.arcscan.app/tx/${HASH}`, 'https'],
    [`https://user:pass@testnet.arcscan.app/tx/${HASH}`, 'credentials'],
    [`https://testnet.arcscan.app/tx/0x${'a'.repeat(64)}`, 'hash'],
    ['not-a-url', 'absolute'],
  ])('rejects %s', (url) => {
    expect(checkExplorerUrl(url, HASH)).not.toBeNull();
  });
});

describe('B06.3 ambiguity and recovery', () => {
  it('passes on the recorded drill', () => {
    expect(checkAmbiguityEvidence(PROOF).status).toBe('PASS');
  });

  it('fails when recovery submitted a replacement transaction', () => {
    const recovery = { ...PROOF.recovery, external_recovery_submissions: 1 };
    expect(failed(checkAmbiguityEvidence(mutate({ recovery })))).toContain(
      'ambiguity.no-replacement',
    );
  });

  it('fails when the intent ended with more than one settlement', () => {
    const recovery = { ...PROOF.recovery, total_settlements_for_intent: 2 };
    expect(failed(checkAmbiguityEvidence(mutate({ recovery })))).toContain(
      'ambiguity.single-settlement',
    );
  });

  it.each(['NOT_REPLAYED', 'REPLAY_STOPPED', 'REPLAY_REFUSED', 'ANYTHING_ELSE'])(
    'fails a replay outcome of %s',
    (replay_outcome) => {
      const recovery = { ...PROOF.recovery, replay_outcome };
      expect(failed(checkAmbiguityEvidence(mutate({ recovery })))).toContain(
        'ambiguity.replay-idempotent',
      );
    },
  );

  it('accepts only the exact recorded replay outcomes', () => {
    for (const replay_outcome of ['REPLAYED', 'returned_existing_result']) {
      const recovery = { ...PROOF.recovery, replay_outcome };
      expect(checkAmbiguityEvidence(mutate({ recovery })).status).toBe('PASS');
    }
  });

  it('fails when the lost response did not produce UNKNOWN', () => {
    const recovery = { ...PROOF.recovery, lost_response_initial_state: 'COMMITTED' };
    expect(failed(checkAmbiguityEvidence(mutate({ recovery })))).toContain(
      'ambiguity.unknown-first',
    );
  });
});

describe('B06.4 mainnet readiness', () => {
  it('passes with the disabled, valueless profile and present artifacts', () => {
    expect(checkMainnetReadiness(ARTIFACTS).status).toBe('PASS');
  });

  it('fails when a required deployment artifact is missing', () => {
    const section = checkMainnetReadiness([{ path: 'docs/SAFE_DISABLE_RUNBOOK.md', present: false }]);
    expect(section.status).toBe('FAIL');
  });

  it('fails an enabled mainnet profile', () => {
    const enabled = { ...ARC_MAINNET, enabled: true } as typeof ARC_MAINNET;
    expect(failed(checkMainnetReadiness(ARTIFACTS, enabled))).toContain('mainnet.disabled');
  });

  it('fails a mainnet profile that carries network values', () => {
    const pinned = {
      ...ARC_MAINNET,
      verification: 'PINNED',
      chainId: 1,
      tokenContract: '0x0000000000000000000000000000000000000001',
    } as unknown as typeof ARC_MAINNET;
    const ids = failed(checkMainnetReadiness(ARTIFACTS, pinned));
    expect(ids).toContain('mainnet.no-values');
    expect(ids).toContain('mainnet.unpublished');
  });

  it('fails a mainnet profile with no recorded reason', () => {
    const silent = { ...ARC_MAINNET, reason: '' } as typeof ARC_MAINNET;
    expect(failed(checkMainnetReadiness(ARTIFACTS, silent))).toContain('mainnet.reason-recorded');
  });
});

describe('B06.5 sanitization audit', () => {
  it('passes on the published bundle', () => {
    expect(auditSanitization({ index: INDEX, proof: RAW_PROOF }).status).toBe('PASS');
  });

  it.each([
    ['app_secret', { app_secret: 'value' }],
    ['authorization header', { authorization: 'Bearer abcdefghijklmnop' }],
    ['private key', { note: '-----BEGIN RSA PRIVATE KEY-----' }],
  ])('fails when the bundle carries %s', (_label, extra) => {
    expect(auditSanitization({ index: INDEX, extra }).status).toBe('FAIL');
  });

  it.each([
    ['a PEM private key', ['-----BEGIN RSA PRIVATE KEY-----']],
    ['a JWT', ['eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiIxMjM0NTY3ODkwIn0.abcdefghij']],
    ['a bearer token', ['Bearer abcdefghijklmnopqrst']],
    ['a nested credential', [{ notes: ['-----BEGIN EC PRIVATE KEY-----'] }]],
  ])('fails when %s is nested inside an array', (_label, extras) => {
    expect(auditSanitization({ index: INDEX, extras }).status).toBe('FAIL');
  });

  it('scans an allowlisted explorer URL beyond its host and hash', () => {
    const bundle = {
      settlement: {
        explorer_url:
          'https://testnet.arcscan.app/tx/0x1111111111111111111111111111111111111111111111111111111111111111?t=eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiIxIn0.sig',
      },
    };
    expect(auditSanitization(bundle).status).toBe('FAIL');
  });

  it('still accepts the published explorer URL', () => {
    expect(
      auditSanitization({ settlement: { explorer_url: PROOF.settlement.explorer_url } }).status,
    ).toBe('PASS');
  });

  it('fails an allowlisted field that does not hold a public value', () => {
    expect(auditSanitization({ token_contract: { nested: 'object' } }).status).toBe('FAIL');
  });

  it('requires an EVM address under token_contract, not any short string', () => {
    expect(auditSanitization({ token_contract: 'abcdefghijklmnopqrst' }).status).toBe('FAIL');
    expect(
      auditSanitization({ token_contract: '0x3600000000000000000000000000000000000000' }).status,
    ).toBe('PASS');
  });

  it.each([
    ['token_symbol', 'eyJhbGciOiJIUzI1NiJ9', 'USDC'],
    ['explorer_host', 'eyJhbGciOiJIUzI1NiJ9', 'testnet.arcscan.app'],
  ])('accepts only a real %s value', (field, hostile, valid) => {
    expect(auditSanitization({ [field]: hostile }).status).toBe('FAIL');
    expect(auditSanitization({ [field]: valid }).status).toBe('PASS');
  });

  it('requires token_decimals to be a small integer', () => {
    expect(auditSanitization({ token_decimals: '6; DROP TABLE' }).status).toBe('FAIL');
    expect(auditSanitization({ token_decimals: 6 }).status).toBe('PASS');
  });
});

describe('B06.6 qualification input', () => {
  const passing: readonly EvidenceSection[] = [
    { section: 'B06.1 Privy authorization boundary', status: 'PASS', checks: [] },
    { section: 'B06.2 Arc Testnet settlement rail', status: 'PASS', checks: [] },
    { section: 'B06.3 Ambiguity and recovery', status: 'PASS', checks: [] },
    { section: 'B06.4 Mainnet readiness', status: 'PASS', checks: [] },
  ];

  it('reports Privy and Arc as qualified when every section passes on a live run', () => {
    const input = buildQualificationInput(passing, 'LIVE_RUN');
    expect(input.find((e) => e.sponsor === 'Privy')?.status).toBe('QUALIFIED');
    expect(input.find((e) => e.sponsor === 'Arc')?.status).toBe('QUALIFIED');
  });

  it('never claims The Graph', () => {
    const input = buildQualificationInput(passing, 'LIVE_RUN');
    expect(input.find((e) => e.sponsor === 'The Graph')?.status).toBe('NOT VERIFIED');
  });

  it('downgrades to NOT VERIFIED without a live run', () => {
    const input = buildQualificationInput(passing, 'LIVE_NOT_RUN');
    expect(input.every((e) => e.status === 'NOT VERIFIED')).toBe(true);
  });

  it('downgrades the sponsor whose section failed', () => {
    const sections = passing.map((s) =>
      s.section === 'B06.2 Arc Testnet settlement rail' ? { ...s, status: 'FAIL' as const } : s,
    );
    const input = buildQualificationInput(sections, 'LIVE_RUN');
    expect(input.find((e) => e.sponsor === 'Arc')?.status).toBe('NOT VERIFIED');
    expect(input.find((e) => e.sponsor === 'Privy')?.status).toBe('QUALIFIED');
  });

  it('cites code, tests, and limitations for every sponsor', () => {
    for (const entry of buildQualificationInput(passing, 'LIVE_RUN')) {
      expect(entry.citations.length).toBeGreaterThan(0);
      expect(entry.limitations.length).toBeGreaterThan(0);
    }
  });
});

describe('report aggregation', () => {
  it('passes end to end on the published bundle', () => {
    const report = buildEvidenceReport(
      [
        checkPrivyEvidence(PROOF),
        checkArcEvidence(PROOF),
        checkAmbiguityEvidence(PROOF),
        checkMainnetReadiness(ARTIFACTS),
        auditSanitization({ index: INDEX, proof: RAW_PROOF }),
      ],
      PROOF.status,
    );
    expect(report.status).toBe('PASS');
    expect(formatEvidenceReport(report)).toContain('Overall: PASS');
  });

  it('fails the whole report when one section fails', () => {
    const report = buildEvidenceReport(
      [
        checkPrivyEvidence(PROOF),
        checkArcEvidence(mutate({ network: 'eip155:1' })),
        checkAmbiguityEvidence(PROOF),
      ],
      PROOF.status,
    );
    expect(report.status).toBe('FAIL');
    expect(report.qualification.find((e) => e.sponsor === 'Arc')?.status).toBe('NOT VERIFIED');
  });
});
