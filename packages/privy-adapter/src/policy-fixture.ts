/**
 * Expected Privy policy definition and its fingerprint (B02.3).
 *
 * Expresses the policy OneShot requires on the execution wallet, in the shape
 * Privy's engine uses: rules over conditions, evaluated in order, with a final
 * default-deny.
 *
 * Two properties matter:
 *
 * 1. **Default deny.** The last rule denies everything. A dimension nobody
 *    thought to constrain is refused rather than allowed.
 * 2. **Fingerprint.** The policy lives in Privy's configuration, outside this
 *    repository, where it can be edited without a commit. The digest lets the
 *    readiness probe detect drift between the deployed policy and the one this
 *    build expects.
 */

import { keccak256, toHex } from 'viem';

export type PolicyEffect = 'ALLOW' | 'DENY';

/** Field sources Privy exposes, verified 2026-09-07 against its documentation. */
export type FieldSource = 'ethereum_transaction' | 'ethereum_calldata';

export interface PolicyCondition {
  readonly fieldSource: FieldSource;
  /** `to`, `value`, `chain_id`, or `function.param` for calldata. */
  readonly field: string;
  readonly operator: 'eq' | 'in' | 'lte';
  readonly value: string | readonly string[];
}

export interface PolicyRule {
  readonly name: string;
  readonly effect: PolicyEffect;
  readonly conditions: readonly PolicyCondition[];
}

export interface PolicyDefinition {
  readonly version: 'settlement-policy-v1';
  readonly rules: readonly PolicyRule[];
}

export interface PolicyInputs {
  readonly chainId: number;
  readonly tokenContract: `0x${string}`;
  readonly recipientAllowlist: readonly `0x${string}`[];
  /** Maximum atomic units for a single settlement. */
  readonly amountCapAtomic: bigint;
}

/**
 * Build the expected policy.
 *
 * The single ALLOW rule requires every condition to hold at once: right chain,
 * right token contract, zero native value, the transfer method, an allowlisted
 * recipient, and an amount at or under the cap. Anything failing one condition
 * falls through to the default DENY.
 */
export function buildExpectedPolicy(inputs: PolicyInputs): PolicyDefinition {
  return {
    version: 'settlement-policy-v1',
    rules: [
      {
        name: 'allow-constrained-usdc-settlement',
        effect: 'ALLOW',
        conditions: [
          {
            fieldSource: 'ethereum_transaction',
            field: 'chain_id',
            operator: 'eq',
            value: String(inputs.chainId),
          },
          {
            fieldSource: 'ethereum_transaction',
            field: 'to',
            operator: 'eq',
            value: inputs.tokenContract.toLowerCase(),
          },
          {
            // Settlement moves ERC-20 USDC. Native value riding along would be
            // a second, unbounded transfer of the gas asset.
            fieldSource: 'ethereum_transaction',
            field: 'value',
            operator: 'eq',
            value: '0',
          },
          {
            fieldSource: 'ethereum_calldata',
            field: 'transfer',
            operator: 'eq',
            value: 'transfer',
          },
          {
            fieldSource: 'ethereum_calldata',
            field: 'transfer.to',
            operator: 'in',
            value: inputs.recipientAllowlist.map((address) => address.toLowerCase()),
          },
          {
            fieldSource: 'ethereum_calldata',
            field: 'transfer.amount',
            operator: 'lte',
            value: inputs.amountCapAtomic.toString(10),
          },
        ],
      },
      {
        // Must remain last. Anything not explicitly allowed above is refused.
        name: 'default-deny',
        effect: 'DENY',
        conditions: [],
      },
    ],
  };
}

/** The dimensions the ALLOW rule must constrain for the policy to be sound. */
export const REQUIRED_POLICY_FIELDS: readonly string[] = [
  'chain_id',
  'to',
  'value',
  'transfer',
  'transfer.to',
  'transfer.amount',
];

/**
 * Deterministic digest of a policy definition.
 *
 * Readiness compares this against the digest of the deployed policy. A
 * mismatch means the remote policy drifted from what this build assumes, which
 * must block settlement rather than be discovered during a payment.
 */
export function policyDigest(policy: PolicyDefinition): `0x${string}` {
  const canonical = JSON.stringify([
    policy.version,
    policy.rules.map((rule) => [
      rule.name,
      rule.effect,
      rule.conditions.map((condition) => [
        condition.fieldSource,
        condition.field,
        condition.operator,
        // Array.isArray widens to any[], so narrow on the declared union
        // instead: a list value is order-insensitive, a scalar is not.
        typeof condition.value === 'string' ? condition.value : [...condition.value].sort(),
      ]),
    ]),
  ]);
  return keccak256(toHex(canonical));
}

export type PolicySoundness =
  | { readonly sound: true }
  | { readonly sound: false; readonly reason: string };

/**
 * Check that a policy is structurally safe before it is trusted.
 *
 * Catches the two ways a policy silently stops protecting anything: losing its
 * terminal default-deny, or dropping a constrained dimension.
 */
export function assessPolicySoundness(policy: PolicyDefinition): PolicySoundness {
  const last = policy.rules.at(-1);
  if (!last || last.effect !== 'DENY' || last.conditions.length > 0) {
    return {
      sound: false,
      reason: 'The final rule must be an unconditional default deny.',
    };
  }

  const allowRules = policy.rules.filter((rule) => rule.effect === 'ALLOW');
  if (allowRules.length === 0) {
    return { sound: false, reason: 'The policy allows nothing and cannot settle.' };
  }

  for (const rule of allowRules) {
    const fields = new Set(rule.conditions.map((condition) => condition.field));
    const missing = REQUIRED_POLICY_FIELDS.filter((field) => !fields.has(field));
    if (missing.length > 0) {
      return {
        sound: false,
        reason: `ALLOW rule "${rule.name}" leaves ${missing.join(', ')} unconstrained.`,
      };
    }
  }

  return { sound: true };
}
