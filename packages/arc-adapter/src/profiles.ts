/**
 * Arc deployment profiles (B01.2).
 *
 * Arc Mainnet is the default rail. Its chain id, CAIP-2, and USDC address are
 * pinned from official Arc and Circle documentation. Settlement still refuses
 * to run until ONESHOT_ALLOW_MAINNET_ACTIVATION=true. Testnet profiles stay
 * selectable. No profile stores an RPC or explorer URL.
 */

/** Verification state of a deployment profile's network constants. */
export type ProfileVerification =
  /** Values are published by Arc and pinned in this file. */
  | 'PINNED'
  /** Arc has not published values. The profile carries none. */
  | 'UNPUBLISHED';

/** A profile whose network constants are published and pinned. */
export interface PinnedArcProfile {
  readonly id: string;
  readonly verification: 'PINNED';
  readonly enabled: boolean;
  /** Whether this profile moves real value. Gates extra authorization. */
  readonly isMainnet: boolean;
  readonly chainId: number;
  /** CAIP-2 identifier. Must equal `eip155:${chainId}`. */
  readonly caip2: `eip155:${number}`;
  /** USDC interface address on this deployment. */
  readonly tokenContract: `0x${string}`;
  readonly tokenSymbol: 'USDC';
  /**
   * ERC-20 interface decimals. Settlement amounts are integer atomic units of
   * THIS value, never of `nativeDecimals`.
   */
  readonly tokenDecimals: number;
  /**
   * Decimals of the native gas asset.
   *
   * On Arc this is also called USDC but is a different unit: the native gas
   * token uses 18 decimals while the ERC-20 interface uses 6. Same name, same
   * chain, 10^12 apart. Mixing them would misprice a settlement by twelve
   * orders of magnitude, so the two live in separate fields and the readiness
   * probe asserts they are not equal.
   */
  readonly nativeDecimals: number;
  readonly nativeSymbol: 'USDC';
}

/**
 * A profile Arc has not published. It holds no network values at all, so there
 * is nothing to accidentally use. It can never be enabled.
 */
export interface UnpublishedArcProfile {
  readonly id: string;
  readonly verification: 'UNPUBLISHED';
  readonly enabled: false;
  readonly isMainnet: boolean;
  /** Why the profile has no values, surfaced in readiness output. */
  readonly reason: string;
}

export type ArcProfile = PinnedArcProfile | UnpublishedArcProfile;

/** Narrowing helper: does this profile carry usable network constants? */
export function isPinned(profile: ArcProfile): profile is PinnedArcProfile {
  return profile.verification === 'PINNED';
}

/**
 * Arc Testnet.
 *
 * Chain ID, CAIP-2, and the USDC interface address were verified on 2026-09-07 against
 * the official Arc documentation at docs.arc.io (`connect-to-arc` and
 * `contract-addresses`).
 *
 * RPC and explorer URLs are deliberately absent. They are endpoints, not
 * protocol constants, they differ per operator, and inventing a plausible
 * hostname here would be exactly the guessed default this profile system
 * exists to prevent. They are supplied through configuration and re-verified
 * against the live chain ID by the readiness probe before any use.
 */
export const ARC_TESTNET: PinnedArcProfile = {
  id: 'arc-testnet',
  verification: 'PINNED',
  enabled: true,
  isMainnet: false,
  chainId: 5042002,
  caip2: 'eip155:5042002',
  tokenContract: '0x3600000000000000000000000000000000000000',
  tokenSymbol: 'USDC',
  tokenDecimals: 6,
  nativeDecimals: 18,
  nativeSymbol: 'USDC',
};

/**
 * Arc Mainnet. Constants match `ARC_MAINNET_CHAIN`, which is pinned from
 * official Arc documentation (chain id 5042, CAIP-2 eip155:5042, USDC
 * 0x3600…0000 at 6 decimals, native gas at 18). Activation still requires
 * ONESHOT_ALLOW_MAINNET_ACTIVATION=true.
 */
export const ARC_MAINNET: PinnedArcProfile = {
  id: 'arc-mainnet',
  verification: 'PINNED',
  enabled: true,
  isMainnet: true,
  chainId: 5042,
  caip2: 'eip155:5042',
  tokenContract: '0x3600000000000000000000000000000000000000',
  tokenSymbol: 'USDC',
  tokenDecimals: 6,
  nativeDecimals: 18,
  nativeSymbol: 'USDC',
};

export const ARC_PROFILES: readonly ArcProfile[] = [ARC_TESTNET, ARC_MAINNET];

/** Every profile id known to this build. */
export const ARC_PROFILE_IDS = ARC_PROFILES.map((p) => p.id);

/**
 * Look up a profile by id.
 *
 * Fails closed: an unknown id is never coerced to a default profile, because
 * defaulting a network is how a payment reaches the wrong chain.
 */
export function getProfile(id: string): ArcProfile | undefined {
  return ARC_PROFILES.find((profile) => profile.id === id);
}
