import { describe, expect, it } from 'vitest';
import {
  REQUIRED_POLICY_FIELDS,
  assessPolicySoundness,
  buildExpectedPolicy,
  policyDigest,
  type PolicyDefinition,
  type PolicyInputs,
} from '../src/policy-fixture.js';

const INPUTS: PolicyInputs = {
  chainId: 5042002,
  tokenContract: '0x3600000000000000000000000000000000000000',
  recipientAllowlist: ['0x1111111111111111111111111111111111111111'],
  amountCapAtomic: 1_000_000n,
};

const POLICY = buildExpectedPolicy(INPUTS);

describe('policy shape', () => {
  it('constrains every required dimension in the allow rule', () => {
    const allow = POLICY.rules.find((rule) => rule.effect === 'ALLOW');
    const fields = allow?.conditions.map((condition) => condition.field) ?? [];
    for (const required of REQUIRED_POLICY_FIELDS) {
      expect(fields).toContain(required);
    }
  });

  it('ends with an unconditional default deny', () => {
    const last = POLICY.rules.at(-1);
    expect(last?.effect).toBe('DENY');
    expect(last?.conditions).toEqual([]);
  });

  it('pins native value to zero', () => {
    const allow = POLICY.rules.find((rule) => rule.effect === 'ALLOW');
    const value = allow?.conditions.find((condition) => condition.field === 'value');
    expect(value).toMatchObject({ operator: 'eq', value: '0' });
  });

  it('caps the amount rather than pinning it', () => {
    // A settlement may be any amount at or under the human-approved cap.
    const allow = POLICY.rules.find((rule) => rule.effect === 'ALLOW');
    const amount = allow?.conditions.find((c) => c.field === 'transfer.amount');
    expect(amount?.operator).toBe('lte');
  });
});

describe('soundness', () => {
  it('accepts the built policy', () => {
    expect(assessPolicySoundness(POLICY)).toEqual({ sound: true });
  });

  it('rejects a policy whose default deny was removed', () => {
    // The classic silent failure: everything still looks allowed, and
    // everything unlisted becomes permitted.
    const broken: PolicyDefinition = {
      ...POLICY,
      rules: POLICY.rules.filter((rule) => rule.effect !== 'DENY'),
    };
    expect(assessPolicySoundness(broken)).toMatchObject({ sound: false });
  });

  it('rejects a policy whose deny rule is no longer last', () => {
    const reordered: PolicyDefinition = { ...POLICY, rules: [...POLICY.rules].reverse() };
    expect(assessPolicySoundness(reordered)).toMatchObject({ sound: false });
  });

  it('rejects a default deny that carries conditions', () => {
    // A conditional deny is not a default deny.
    const conditional: PolicyDefinition = {
      ...POLICY,
      rules: [
        ...POLICY.rules.slice(0, -1),
        {
          name: 'default-deny',
          effect: 'DENY',
          conditions: [
            { fieldSource: 'ethereum_transaction', field: 'to', operator: 'eq', value: '0x0' },
          ],
        },
      ],
    };
    expect(assessPolicySoundness(conditional)).toMatchObject({ sound: false });
  });

  it.each(REQUIRED_POLICY_FIELDS)('rejects a policy missing the %s constraint', (field) => {
    const weakened: PolicyDefinition = {
      ...POLICY,
      rules: POLICY.rules.map((rule) =>
        rule.effect === 'ALLOW'
          ? { ...rule, conditions: rule.conditions.filter((c) => c.field !== field) }
          : rule,
      ),
    };
    const result = assessPolicySoundness(weakened);
    expect(result.sound).toBe(false);
    if (!result.sound) expect(result.reason).toContain(field);
  });

  it('rejects a policy that allows nothing', () => {
    const denyOnly: PolicyDefinition = {
      ...POLICY,
      rules: POLICY.rules.filter((rule) => rule.effect === 'DENY'),
    };
    expect(assessPolicySoundness(denyOnly)).toMatchObject({ sound: false });
  });
});

describe('digest', () => {
  it('is stable for identical inputs', () => {
    expect(policyDigest(buildExpectedPolicy(INPUTS))).toBe(policyDigest(POLICY));
  });

  it('is independent of recipient allowlist ordering', () => {
    // Two operators listing the same recipients in different order describe
    // the same policy and must not read as drift.
    const a = buildExpectedPolicy({
      ...INPUTS,
      recipientAllowlist: ['0x1111111111111111111111111111111111111111', '0x2222222222222222222222222222222222222222'],
    });
    const b = buildExpectedPolicy({
      ...INPUTS,
      recipientAllowlist: ['0x2222222222222222222222222222222222222222', '0x1111111111111111111111111111111111111111'],
    });
    expect(policyDigest(a)).toBe(policyDigest(b));
  });

  it.each<[string, Partial<PolicyInputs>]>([
    ['a different chain', { chainId: 1 }],
    ['a different token', { tokenContract: '0x4600000000000000000000000000000000000000' }],
    ['a raised cap', { amountCapAtomic: 2_000_000n }],
    ['an extra recipient', { recipientAllowlist: ['0x1111111111111111111111111111111111111111', '0x3333333333333333333333333333333333333333'] }],
  ])('changes when the policy changes: %s', (_label, override) => {
    // Each of these is a real widening of what the wallet may do, so readiness
    // must see drift rather than silently accept the deployed policy.
    expect(policyDigest(buildExpectedPolicy({ ...INPUTS, ...override }))).not.toBe(
      policyDigest(POLICY),
    );
  });
});
