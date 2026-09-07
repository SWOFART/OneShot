/**
 * Arc readiness probe (B01.5).
 *
 * Answers one question before any settlement path runs: is the configured
 * endpoint really the chain and token we think it is?
 *
 * The central distinction is between UNAVAILABLE and MISMATCH:
 *
 * - UNAVAILABLE: we could not learn the answer (endpoint down, timeout). The
 *   configuration may be perfectly correct. Retrying later is reasonable.
 * - MISMATCH: we learned the answer and it is wrong (different chain, no token
 *   bytecode). The configuration is dangerous and must never be retried into
 *   working. This is how a payment reaches the wrong chain.
 *
 * Both block readiness. Only MISMATCH is a permanent, human-fix condition.
 */

import type { SettlementConfig } from './config.js';

export type CheckStatus = 'PASS' | 'MISMATCH' | 'UNAVAILABLE' | 'SKIPPED';

export interface CheckResult {
  readonly name: string;
  readonly status: CheckStatus;
  /** Sanitized, human-readable reason. Never contains a credential. */
  readonly detail: string;
}

export interface ReadinessReport {
  readonly ready: boolean;
  /** True when at least one check returned MISMATCH. Requires a human fix. */
  readonly hasMismatch: boolean;
  readonly checks: readonly CheckResult[];
}

/**
 * Minimal JSON-RPC surface the probe needs.
 *
 * Declared as an interface rather than taking a viem client directly so the
 * probe can be driven by the offline simulator with no network and no
 * credentials, which is what lets this packet close without live access.
 */
export interface RpcProbe {
  /** `eth_chainId`, returned as a number. */
  getChainId(): Promise<number>;
  /**
   * `eth_getCode` at an address. A real endpoint may answer `null` for an
   * address it knows nothing about, so the nullability is part of the contract.
   */
  getCode(address: `0x${string}`): Promise<string | null>;
}

/** Privy identity format expectations. No credential is ever read here. */
export interface IdentityExpectation {
  readonly walletId: string;
  readonly policyId: string;
}

/** Wallet/policy identifiers are opaque, so only shape is validated. */
const IDENTIFIER_SHAPE = /^[A-Za-z0-9_-]{8,128}$/;

function classifyError(error: unknown): CheckResult['detail'] {
  const message = error instanceof Error ? error.message : String(error);
  // Truncated because provider errors can embed large response bodies.
  return message.slice(0, 200);
}

/**
 * Check that the RPC endpoint reports the chain ID the profile expects.
 *
 * A wrong chain ID is the single most dangerous misconfiguration available, so
 * it is checked first and classified as MISMATCH, never as a retryable fault.
 */
export async function checkChainId(
  probe: RpcProbe,
  expectedChainId: number,
): Promise<CheckResult> {
  const name = 'rpc.chainId';
  let observed: number;
  try {
    observed = await probe.getChainId();
  } catch (error) {
    return {
      name,
      status: 'UNAVAILABLE',
      detail: `Could not read chain ID: ${classifyError(error)}`,
    };
  }
  if (observed !== expectedChainId) {
    return {
      name,
      status: 'MISMATCH',
      detail: `RPC reports chain ${observed}; profile expects ${expectedChainId}.`,
    };
  }
  return { name, status: 'PASS', detail: `Chain ${observed} matches the profile.` };
}

/**
 * Check that the configured token address actually holds contract bytecode.
 *
 * An address with no code is either the wrong address or the wrong chain. A
 * transfer sent to it would be irrecoverable, so absence of bytecode is a
 * MISMATCH rather than a warning.
 */
export async function checkTokenBytecode(
  probe: RpcProbe,
  tokenContract: `0x${string}`,
): Promise<CheckResult> {
  const name = 'token.bytecode';
  let code: string | null;
  try {
    code = await probe.getCode(tokenContract);
  } catch (error) {
    return {
      name,
      status: 'UNAVAILABLE',
      detail: `Could not read token bytecode: ${classifyError(error)}`,
    };
  }
  const normalized = (code ?? '').trim().toLowerCase();
  if (normalized === '' || normalized === '0x' || normalized === '0x0') {
    return {
      name,
      status: 'MISMATCH',
      detail: `No contract bytecode at the configured USDC address ${tokenContract}.`,
    };
  }
  return { name, status: 'PASS', detail: 'Token address holds contract bytecode.' };
}

/**
 * Validate wallet and policy identifier shape.
 *
 * Deliberately offline and credential-free: it proves the identifiers are
 * well-formed and present, and prints neither value.
 */
export function checkIdentityFormat(expectation: IdentityExpectation): CheckResult {
  const name = 'privy.identityFormat';
  if (!IDENTIFIER_SHAPE.test(expectation.walletId)) {
    return { name, status: 'MISMATCH', detail: 'Privy wallet identifier is malformed.' };
  }
  if (!IDENTIFIER_SHAPE.test(expectation.policyId)) {
    return { name, status: 'MISMATCH', detail: 'Privy policy identifier is malformed.' };
  }
  return { name, status: 'PASS', detail: 'Wallet and policy identifiers are well-formed.' };
}

/**
 * Offline configuration checks that need no network.
 *
 * Runs the invariants that must hold regardless of connectivity, so a
 * misconfiguration is caught even when the endpoint is down.
 */
export function checkProfileConsistency(config: SettlementConfig): CheckResult {
  const name = 'profile.consistency';
  const { profile } = config;

  if (profile.caip2 !== `eip155:${profile.chainId}`) {
    return {
      name,
      status: 'MISMATCH',
      detail: `Profile CAIP-2 ${profile.caip2} does not match chain ID ${profile.chainId}.`,
    };
  }
  if (profile.tokenDecimals !== 6) {
    return {
      name,
      status: 'MISMATCH',
      detail: `USDC must use six decimals; profile declares ${profile.tokenDecimals}.`,
    };
  }
  // No runtime check on tokenSymbol: PinnedArcProfile types it as the literal
  // 'USDC', so a non-USDC profile cannot be constructed in the first place.
  return { name, status: 'PASS', detail: 'Profile constants are internally consistent.' };
}

/**
 * Run the full readiness probe.
 *
 * Ready requires every check to PASS. There is no partial-ready state: a
 * caller that cannot prove chain and token identity must not settle.
 */
export async function probeReadiness(
  config: SettlementConfig,
  probe: RpcProbe,
): Promise<ReadinessReport> {
  const checks: CheckResult[] = [
    checkProfileConsistency(config),
    checkIdentityFormat({ walletId: config.privyWalletId, policyId: config.privyPolicyId }),
    await checkChainId(probe, config.profile.chainId),
    await checkTokenBytecode(probe, config.profile.tokenContract),
  ];

  return {
    ready: checks.every((check) => check.status === 'PASS'),
    hasMismatch: checks.some((check) => check.status === 'MISMATCH'),
    checks,
  };
}
