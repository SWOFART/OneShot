/**
 * Settlement chain catalog.
 *
 * OneShot settles one USDC transfer on exactly one configured chain. The chain
 * is data: an id, a CAIP-2 network, and pinned asset constants. Arc Testnet is
 * the default rail. Testnets are for integration testing. Adding a chain means appending a
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
  /**
   * Env var that holds this chain's GraphQL indexer URL. Absent means Graph
   * recovery is not available and must be skipped.
   */
  readonly graphQueryEnv?: 'ONESHOT_SUBGRAPH_QUERY_URL';
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
  graphQueryEnv: 'ONESHOT_SUBGRAPH_QUERY_URL',
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

/**
 * Arc Mainnet.
 *
 * Pinned from official Arc documentation on 2026-11-24:
 * https://docs.arc.io/arc/references/connect-to-arc (chain id 5042, CAIP-2
 * eip155:5042) and https://docs.arc.io/arc/references/contract-addresses
 * (USDC ERC-20 0x3600…0000, 6 decimals; native gas USDC uses 18). Circle lists
 * the same Arc mainnet USDC address. No RPC URL is stored here.
 *
 * This is the default rail. Settlement still refuses to run until an operator
 * sets ONESHOT_ALLOW_MAINNET_ACTIVATION=true. There is no Graph indexer for
 * this chain in this build.
 */
export const ARC_MAINNET_CHAIN = {
  id: 'arc-mainnet',
  displayName: 'Arc Mainnet',
  family: 'evm',
  settlementMethod: 'erc20-transfer',
  verification: 'PINNED',
  enabled: true,
  isMainnet: true,
  chainId: 5042,
  caip2: 'eip155:5042',
  settlementAsset: {
    symbol: 'USDC',
    decimals: 6,
    contract: '0x3600000000000000000000000000000000000000',
  },
  nativeAsset: { symbol: 'USDC', decimals: 18 },
} as const satisfies PinnedSettlementChain;

/** Arc Mainnet is the default. Testnets follow it. */
export const SETTLEMENT_CHAINS: readonly SettlementChain[] = [
  ARC_MAINNET_CHAIN,
  ARC_TESTNET_CHAIN,
  BASE_SEPOLIA_CHAIN,
];

/** CAIP-2 networks a direct settlement intent may name. Mainnet is first. */
export const ENABLED_SETTLEMENT_NETWORKS = [
  ARC_MAINNET_CHAIN.caip2,
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
 * set, the result is Arc Mainnet. Loading a mainnet settlement still requires
 * ONESHOT_ALLOW_MAINNET_ACTIVATION=true. Unknown, unpublished, or disabled ids
 * throw.
 */
export function selectSettlementChain(env: ChainSelectionEnv = {}): PinnedSettlementChain {
  const chainId = env.ONESHOT_CHAIN?.trim();
  const arcProfile = env.ONESHOT_ARC_PROFILE?.trim();
  if (chainId && arcProfile && chainId !== arcProfile) {
    throw new Error(
      `ONESHOT_CHAIN=${chainId} and ONESHOT_ARC_PROFILE=${arcProfile} select different chains.`,
    );
  }
  const id = chainId || arcProfile || ARC_MAINNET_CHAIN.id;
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
  if (!isEnabledSettlementNetwork(chain.caip2)) {
    throw new Error(`Settlement chain "${id}" is not an enabled settlement network.`);
  }
  return chain;
}
