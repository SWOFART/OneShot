/**
 * Settlement configuration schema, `settlement-config-v1` (B01.4).
 *
 * Every variable is classified so tooling can decide what may be printed,
 * committed to `.env.example`, or sent to a reviewer:
 *
 * - `public`    safe to log and to show in evidence.
 * - `secret`    never logged, committed, or placed in a fixture.
 * - `optional`  public, may be absent, has a documented default.
 * - `human-only` a human must supply and approve it; no automated default.
 *
 * Validation is fail-closed. A missing, malformed, or contradictory value
 * produces an error and no configuration object, because a half-valid
 * settlement configuration is how a payment reaches the wrong chain or token.
 */

import { ARC_PROFILE_IDS, getProfile, isPinned, type PinnedArcProfile } from './profiles.js';
import { parseAmountAtomic, type AmountAtomic } from './money.js';

export type VariableClass = 'public' | 'secret' | 'optional' | 'human-only';

export interface VariableSpec {
  readonly name: string;
  readonly classification: VariableClass;
  readonly description: string;
  /** Placeholder for `.env.example`. Never a real value. */
  readonly examplePlaceholder: string;
}

/** The declared surface of `settlement-config-v1`. */
export const CONFIG_VARIABLES: readonly VariableSpec[] = [
  {
    name: 'ONESHOT_ARC_PROFILE',
    classification: 'public',
    description: `Enabled Arc deployment profile. One of: ${ARC_PROFILE_IDS.join(', ')}.`,
    examplePlaceholder: 'arc-testnet',
  },
  {
    name: 'ONESHOT_ARC_RPC_URL',
    classification: 'public',
    description:
      'HTTPS JSON-RPC endpoint for the enabled profile. Re-verified against the ' +
      'profile chain ID by the readiness probe before use.',
    examplePlaceholder: 'https://<arc-rpc-host>',
  },
  {
    name: 'ONESHOT_ARC_EXPLORER_URL',
    classification: 'optional',
    description: 'Block explorer base URL used to build operator evidence links.',
    examplePlaceholder: 'https://<arc-explorer-host>',
  },
  {
    name: 'ONESHOT_PRIVY_APP_ID',
    classification: 'public',
    description: 'Privy application identifier. Not a credential.',
    examplePlaceholder: '<privy-app-id>',
  },
  {
    name: 'ONESHOT_PRIVY_APP_SECRET',
    classification: 'secret',
    description:
      'Privy application secret. Supplied by a runtime secret store. Never ' +
      'logged, committed, placed in a fixture, or sent to a reviewer.',
    examplePlaceholder: '<set-in-secret-store-not-here>',
  },
  {
    name: 'ONESHOT_PRIVY_WALLET_ID',
    classification: 'public',
    description: 'Privy execution wallet identifier used for settlement.',
    examplePlaceholder: '<privy-wallet-id>',
  },
  {
    name: 'ONESHOT_PRIVY_POLICY_ID',
    classification: 'public',
    description: 'Privy policy identifier that must be attached to the execution wallet.',
    examplePlaceholder: '<privy-policy-id>',
  },
  {
    name: 'ONESHOT_RECIPIENT_ALLOWLIST',
    classification: 'human-only',
    description:
      'Comma-separated EVM addresses permitted to receive settlement. A human ' +
      'curates this; there is no automated default and an empty list settles nothing.',
    examplePlaceholder: '0x<recipient-one>,0x<recipient-two>',
  },
  {
    name: 'ONESHOT_SETTLEMENT_CAP_ATOMIC',
    classification: 'human-only',
    description:
      'Maximum atomic units permitted for a single settlement. Integer string, ' +
      'six-decimal USDC atomic units. Human-approved spending bound.',
    examplePlaceholder: '1000000',
  },
  {
    name: 'ONESHOT_RPC_TIMEOUT_MS',
    classification: 'optional',
    description: 'Per-RPC-call timeout in milliseconds. Defaults to 10000.',
    examplePlaceholder: '10000',
  },
  {
    name: 'ONESHOT_ALLOW_MAINNET_ACTIVATION',
    classification: 'human-only',
    description:
      'Explicit human authorization to enable a mainnet profile. Enabling a ' +
      'mainnet profile additionally requires that profile to carry pinned, ' +
      'verified network values. Defaults to false.',
    examplePlaceholder: 'false',
  },
];

/** Names of variables that must never be printed or committed. */
export const SECRET_VARIABLE_NAMES: readonly string[] = CONFIG_VARIABLES.filter(
  (variable) => variable.classification === 'secret',
).map((variable) => variable.name);

export interface SettlementConfig {
  readonly profile: PinnedArcProfile;
  readonly rpcUrl: string;
  readonly explorerUrl?: string | undefined;
  readonly privyAppId: string;
  readonly privyWalletId: string;
  readonly privyPolicyId: string;
  readonly recipientAllowlist: readonly `0x${string}`[];
  readonly settlementCapAtomic: AmountAtomic;
  readonly rpcTimeoutMs: number;
}

export class ConfigError extends Error {
  constructor(
    message: string,
    readonly code:
      | 'MISSING_VARIABLE'
      | 'UNKNOWN_PROFILE'
      | 'PROFILE_UNPUBLISHED'
      | 'PROFILE_DISABLED'
      | 'MAINNET_NOT_AUTHORIZED'
      | 'INVALID_URL'
      | 'INVALID_ADDRESS'
      | 'EMPTY_ALLOWLIST'
      | 'INVALID_TIMEOUT'
      | 'INVALID_CAP',
  ) {
    super(message);
    this.name = 'ConfigError';
  }
}

/** Raw environment shape. Values are untrusted strings. */
export type RawEnv = Readonly<Record<string, string | undefined>>;

function required(env: RawEnv, name: string): string {
  const value = env[name]?.trim();
  if (!value) {
    throw new ConfigError(`Required configuration variable ${name} is missing.`, 'MISSING_VARIABLE');
  }
  return value;
}

const EVM_ADDRESS = /^0x[a-fA-F0-9]{40}$/;

/**
 * Normalize an EVM address to lowercase.
 *
 * Lowercase rather than EIP-55 checksum so that comparisons against an
 * allowlist are exact string equality and cannot differ by casing alone.
 */
function normalizeAddress(candidate: string, label: string): `0x${string}` {
  const trimmed = candidate.trim();
  if (!EVM_ADDRESS.test(trimmed)) {
    throw new ConfigError(`${label} is not a valid EVM address.`, 'INVALID_ADDRESS');
  }
  return trimmed.toLowerCase() as `0x${string}`;
}

function parseHttpsUrl(candidate: string, label: string): string {
  let parsed: URL;
  try {
    parsed = new URL(candidate);
  } catch {
    throw new ConfigError(`${label} is not a valid URL.`, 'INVALID_URL');
  }
  // http is permitted only for loopback, so a local simulator works while a
  // real endpoint cannot be configured in cleartext by accident.
  const isLoopback = parsed.hostname === 'localhost' || parsed.hostname === '127.0.0.1';
  if (parsed.protocol !== 'https:' && !(parsed.protocol === 'http:' && isLoopback)) {
    throw new ConfigError(`${label} must use https (http is allowed only for loopback).`, 'INVALID_URL');
  }
  return parsed.toString();
}

/**
 * Build a validated settlement configuration, or throw.
 *
 * Enabling a mainnet profile requires three independent conditions: the profile
 * carries pinned values, the profile is marked enabled, and a human set the
 * activation flag. Any one missing fails closed.
 */
export function loadSettlementConfig(env: RawEnv): SettlementConfig {
  const profileId = required(env, 'ONESHOT_ARC_PROFILE');
  const profile = getProfile(profileId);

  if (!profile) {
    throw new ConfigError(
      `Unknown Arc profile "${profileId}". Known profiles: ${ARC_PROFILE_IDS.join(', ')}.`,
      'UNKNOWN_PROFILE',
    );
  }

  if (!isPinned(profile)) {
    throw new ConfigError(
      `Arc profile "${profileId}" carries no pinned network values. ${profile.reason}`,
      'PROFILE_UNPUBLISHED',
    );
  }

  if (!profile.enabled) {
    throw new ConfigError(`Arc profile "${profileId}" is disabled.`, 'PROFILE_DISABLED');
  }

  if (profile.isMainnet) {
    const authorized = env.ONESHOT_ALLOW_MAINNET_ACTIVATION?.trim() === 'true';
    if (!authorized) {
      throw new ConfigError(
        `Arc profile "${profileId}" moves real value and requires explicit human ` +
          'authorization via ONESHOT_ALLOW_MAINNET_ACTIVATION=true.',
        'MAINNET_NOT_AUTHORIZED',
      );
    }
  }

  const rpcUrl = parseHttpsUrl(required(env, 'ONESHOT_ARC_RPC_URL'), 'ONESHOT_ARC_RPC_URL');

  const rawExplorer = env.ONESHOT_ARC_EXPLORER_URL?.trim();
  const explorerUrl = rawExplorer
    ? parseHttpsUrl(rawExplorer, 'ONESHOT_ARC_EXPLORER_URL')
    : undefined;

  const allowlistRaw = required(env, 'ONESHOT_RECIPIENT_ALLOWLIST').trim();
  const recipientAllowlist =
    allowlistRaw === '*' || allowlistRaw === ''
      ? []
      : allowlistRaw
          .split(',')
          .map((entry) => entry.trim())
          .filter((entry) => entry.length > 0)
          .map((entry) => normalizeAddress(entry, 'ONESHOT_RECIPIENT_ALLOWLIST entry'));

  if (allowlistRaw !== '*' && allowlistRaw !== '' && recipientAllowlist.length === 0) {
    throw new ConfigError(
      'ONESHOT_RECIPIENT_ALLOWLIST must contain at least one address or "*".',
      'EMPTY_ALLOWLIST',
    );
  }

  let settlementCapAtomic: AmountAtomic;
  try {
    settlementCapAtomic = parseAmountAtomic(required(env, 'ONESHOT_SETTLEMENT_CAP_ATOMIC'));
  } catch (cause) {
    throw new ConfigError(
      `ONESHOT_SETTLEMENT_CAP_ATOMIC is not a canonical atomic amount: ${(cause as Error).message}`,
      'INVALID_CAP',
    );
  }

  const timeoutRaw = env.ONESHOT_RPC_TIMEOUT_MS?.trim();
  let rpcTimeoutMs = 10_000;
  if (timeoutRaw !== undefined && timeoutRaw !== '') {
    if (!/^[1-9][0-9]*$/.test(timeoutRaw)) {
      throw new ConfigError(
        'ONESHOT_RPC_TIMEOUT_MS must be a positive integer.',
        'INVALID_TIMEOUT',
      );
    }
    rpcTimeoutMs = Number(timeoutRaw);
    if (rpcTimeoutMs > 120_000) {
      throw new ConfigError('ONESHOT_RPC_TIMEOUT_MS must not exceed 120000.', 'INVALID_TIMEOUT');
    }
  }

  return {
    profile,
    rpcUrl,
    explorerUrl,
    privyAppId: required(env, 'ONESHOT_PRIVY_APP_ID'),
    privyWalletId: required(env, 'ONESHOT_PRIVY_WALLET_ID'),
    privyPolicyId: required(env, 'ONESHOT_PRIVY_POLICY_ID'),
    recipientAllowlist,
    settlementCapAtomic,
    rpcTimeoutMs,
  };
}

/** Is this recipient permitted? Exact match against the normalized allowlist. */
export function isAllowedRecipient(config: SettlementConfig, recipient: string): boolean {
  if (!EVM_ADDRESS.test(recipient.trim())) return false;
  if (config.recipientAllowlist.length === 0) return true;
  return config.recipientAllowlist.includes(recipient.trim().toLowerCase() as `0x${string}`);
}

/** Render `.env.example` content containing placeholders only. */
export function renderEnvExample(): string {
  const lines = [
    '# settlement-config-v1',
    '# Placeholders only. Never commit a real value.',
    '',
  ];
  for (const variable of CONFIG_VARIABLES) {
    lines.push(`# [${variable.classification}] ${variable.description}`);
    lines.push(`${variable.name}=${variable.examplePlaceholder}`);
    lines.push('');
  }
  return lines.join('\n');
}
