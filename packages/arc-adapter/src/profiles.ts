/**
 * Arc deployment profiles (B01.2).
 *
 * Exactly one profile may be enabled at a time. Arc Testnet is the only profile
 * with published network parameters, so it is the only one that carries values.
 *
 * The Mainnet profile deliberately carries no chain ID, RPC URL, explorer, or
 * token address. Arc has not published them, and `plan.md` forbids guessing:
 * an unpinned profile must be structurally present and inert, never a
 * plausible-looking default that could silently be used.
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
  /** ERC-20 decimals. Settlement amounts are integer atomic units of this. */
  readonly tokenDecimals: number;
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
 * Chain ID, CAIP-2, and the USDC interface address are fixed by
 * `milestones/CONTRACTS.md` section 2.
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
};

/**
 * Arc Mainnet.
 *
 * Intentionally valueless. Commit `d6758dd` on `develop` removed a previously
 * asserted mainnet chain ID and launch date because neither was verified
 * against official Arc documentation. Populating this profile requires B01 to
 * pin published values and a human to authorize activation.
 */
export const ARC_MAINNET: UnpublishedArcProfile = {
  id: 'arc-mainnet',
  verification: 'UNPUBLISHED',
  enabled: false,
  isMainnet: true,
  reason:
    'Arc has not published mainnet network parameters. This profile carries no ' +
    'chain ID, RPC, explorer, or token value by design. Pinning requires ' +
    'official Arc documentation plus explicit human authorization.',
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
