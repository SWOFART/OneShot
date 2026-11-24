/**
 * Settlement chain catalog.
 *
 * OneShot settles one USDC transfer on exactly one configured chain. The chain
 * is data: an id, a CAIP-2 network, and pinned asset constants. Arc Testnet is
 * the first implementation and the default. Adding a chain means appending a
 * record here and teaching the OpenAPI generator the same CAIP-2 list. A test
 * locks those two lists together.
 *
 * RPC and explorer URLs are not chain constants. They are operator
 * configuration, checked against the pinned chain id before use.
 *
 * Values were checked on 2026-11-24 against Circle's published USDC address
 * list (https://developers.circle.com/stablecoins/usdc-contract-addresses):
 * Arc Testnet `0x3600…0000` and Base Sepolia `0x036CbD53842c5426634e7929541eC2318f3dCF7e`.
 */

export type ChainVerification = 'PINNED' | 'UNPUBLISHED';

export interface SettlementAsset {
  readonly symbol: 'USDC';
  readonly decimals: number;
  readonly contract: `0x${string}`;
}

export interface NativeAsset {
  readonly symbol: string;
  readonly decimals: number;
}

/** A chain whose settlement constants are published and pinned. */
export interface PinnedSettlementChain {
  readonly id: string;
  readonly displayName: string;
  readonly family: 'evm';
  /** How this chain moves the settlement asset. v1 is a direct ERC-20 transfer. */
  readonly settlementMethod: 'erc20-transfer';
  readonly verification: 'PINNED';
  readonly enabled: boolean;
  /** Real-value networks need a separate human authorization flag. */
  readonly isMainnet: boolean;
  readonly chainId: number;
  readonly caip2: `eip155:${number}`;
  readonly settlementAsset: SettlementAsset;
  readonly nativeAsset: NativeAsset;
}

/**
 * A chain that has no published constants. It carries none, so nothing can
 * accidentally settle on a guessed network.
 */
export interface UnpublishedSettlementChain {
  readonly id: string;
  readonly displayName: string;
  readonly family: 'evm';
  readonly settlementMethod: 'erc20-transfer';
  readonly verification: 'UNPUBLISHED';
  readonly enabled: false;
  readonly isMainnet: boolean;
  readonly reason: string;
}

export type SettlementChain = PinnedSettlementChain | UnpublishedSettlementChain;

export function isPinnedChain(chain: SettlementChain): chain is PinnedSettlementChain {
  return chain.verification === 'PINNED';
}

/**
 * Arc Testnet. Chain id and USDC address are the constants already frozen for
 * the Arc settlement rail.
 */
export const ARC_TESTNET_CHAIN = {
  id: 'arc-testnet',
  displayName: 'Arc Testnet',
  family: 'evm',
  settlementMethod: 'erc20-transfer',
  verification: 'PINNED',
  enabled: true,
  isMainnet: false,
  chainId: 5042002,
  caip2: 'eip155:5042002',
  settlementAsset: {
    symbol: 'USDC',
    decimals: 6,
    contract: '0x3600000000000000000000000000000000000000',
  },
  nativeAsset: { symbol: 'USDC', decimals: 18 },
} as const satisfies PinnedSettlementChain;

/**
 * Base Sepolia USDC. Public testnet constants from Circle's USDC address list.
 * Native gas is ETH at 18 decimals, distinct from the 6-decimal settlement asset.
 * No RPC URL is pinned.
 */
export const BASE_SEPOLIA_CHAIN = {
  id: 'base-sepolia',
  displayName: 'Base Sepolia',
  family: 'evm',
  settlementMethod: 'erc20-transfer',
  verification: 'PINNED',
  enabled: true,
  isMainnet: false,
  chainId: 84532,
  caip2: 'eip155:84532',
  settlementAsset: {
    symbol: 'USDC',
    decimals: 6,
    contract: '0x036CbD53842c5426634e7929541eC2318f3dCF7e',
  },
  nativeAsset: { symbol: 'ETH', decimals: 18 },
} as const satisfies PinnedSettlementChain;

/** Arc Mainnet stays empty until official parameters are published and a human authorizes it. */
export const ARC_MAINNET_CHAIN: UnpublishedSettlementChain = {
  id: 'arc-mainnet',
  displayName: 'Arc Mainnet',
  family: 'evm',
  settlementMethod: 'erc20-transfer',
  verification: 'UNPUBLISHED',
  enabled: false,
  isMainnet: true,
  reason:
    'Arc has not published mainnet network parameters. This chain carries no ' +
    'chain ID, RPC, explorer, or token value. Pinning requires official Arc ' +
    'documentation plus explicit human authorization.',
};

/** Arc Testnet is first. Later entries are additional implementations. */
export const SETTLEMENT_CHAINS: readonly SettlementChain[] = [
  ARC_TESTNET_CHAIN,
  BASE_SEPOLIA_CHAIN,
  ARC_MAINNET_CHAIN,
];

/** CAIP-2 networks a direct settlement intent may name. Arc Testnet stays first. */
export const ENABLED_SETTLEMENT_NETWORKS = [
  ARC_TESTNET_CHAIN.caip2,
  BASE_SEPOLIA_CHAIN.caip2,
] as const;

export type SettlementNetwork = (typeof ENABLED_SETTLEMENT_NETWORKS)[number];

export interface ChainRegistry {
  get(id: string): SettlementChain | undefined;
  list(): readonly SettlementChain[];
  /** Pinned chains the host may select. Mainnet still needs human authorization. */
  enabled(): readonly PinnedSettlementChain[];
}

export function createChainRegistry(chains: readonly SettlementChain[]): ChainRegistry {
  const byId = new Map(chains.map((chain) => [chain.id, chain]));
  return {
    get(id: string): SettlementChain | undefined {
      return byId.get(id);
    },
    list(): readonly SettlementChain[] {
      return chains;
    },
    enabled(): readonly PinnedSettlementChain[] {
      return chains.filter(isPinnedChain).filter((chain) => chain.enabled);
    },
  };
}

/** The chain catalog shipped with this build. */
export const settlementChainRegistry: ChainRegistry = createChainRegistry(SETTLEMENT_CHAINS);

export function getSettlementChain(id: string): SettlementChain | undefined {
  return settlementChainRegistry.get(id);
}

export function settlementChainByNetwork(network: string): PinnedSettlementChain | undefined {
  return settlementChainRegistry.enabled().find((chain) => chain.caip2 === network);
}

export function isEnabledSettlementNetwork(value: unknown): value is SettlementNetwork {
  return (
    typeof value === 'string' && (ENABLED_SETTLEMENT_NETWORKS as readonly string[]).includes(value)
  );
}

export interface ChainSelectionEnv {
  readonly ONESHOT_CHAIN?: string | undefined;
  readonly ONESHOT_ARC_PROFILE?: string | undefined;
}

/**
 * Resolve the chain a process should advertise.
 *
 * An explicit `ONESHOT_CHAIN` wins. `ONESHOT_ARC_PROFILE` is the original
 * selector and must name the same chain when both are set. When neither is
 * set, the result is Arc Testnet, which is the chain this product hardcoded
 * before selection existed. Unknown, unpublished, or disabled ids throw.
 * Mainnet is refused here; settlement configuration applies the human
 * authorization flag before any real-value chain can load.
 */
export function selectSettlementChain(env: ChainSelectionEnv = {}): PinnedSettlementChain {
  const chainId = env.ONESHOT_CHAIN?.trim();
  const arcProfile = env.ONESHOT_ARC_PROFILE?.trim();
  if (chainId && arcProfile && chainId !== arcProfile) {
    throw new Error(
      `ONESHOT_CHAIN=${chainId} and ONESHOT_ARC_PROFILE=${arcProfile} select different chains.`,
    );
  }
  const id = chainId || arcProfile || ARC_TESTNET_CHAIN.id;
  const chain = getSettlementChain(id);
  if (!chain) {
    throw new Error(
      `Unknown settlement chain "${id}". Known chains: ${SETTLEMENT_CHAINS.map((item) => item.id).join(', ')}.`,
    );
  }
  if (!isPinnedChain(chain)) {
    throw new Error(`Settlement chain "${id}" has no pinned network values. ${chain.reason}`);
  }
  if (!chain.enabled) {
    throw new Error(`Settlement chain "${id}" is disabled.`);
  }
  if (chain.isMainnet) {
    throw new Error(`Settlement chain "${id}" moves real value and is not selectable here.`);
  }
  if (!isEnabledSettlementNetwork(chain.caip2)) {
    throw new Error(`Settlement chain "${id}" is not an enabled settlement network.`);
  }
  return chain;
}
