import {
  ARC_TESTNET_CHAIN,
  selectSettlementChain,
  type PinnedSettlementChain,
} from '@oneshot/contracts';
import { defineChain } from 'viem';

/**
 * Public unauthenticated endpoints for the browser wallet. Settlement does not
 * use these. The worker still requires ONESHOT_ARC_RPC_URL and checks the
 * live chain id before it submits.
 */
const WALLET_TRANSPORT: Record<string, { readonly rpcUrl: string; readonly explorerUrl: string }> =
  {
    'arc-testnet': {
      rpcUrl: 'https://rpc.testnet.arc.network',
      explorerUrl: 'https://testnet.arcscan.app',
    },
    'base-sepolia': {
      rpcUrl: 'https://sepolia.base.org',
      explorerUrl: 'https://sepolia.basescan.org',
    },
  };

/** The chain this site build pays on. Unset matches the server default, Arc Testnet. */
export function browserSettlementChain(): PinnedSettlementChain {
  const selected = import.meta.env.VITE_ONESHOT_CHAIN;
  if (typeof selected !== 'string' || selected.trim() === '') return ARC_TESTNET_CHAIN;
  return selectSettlementChain({ ONESHOT_CHAIN: selected.trim() });
}

export function browserViemChain(chain: PinnedSettlementChain = browserSettlementChain()) {
  const transport = WALLET_TRANSPORT[chain.id];
  if (!transport) {
    throw new Error(`No browser wallet endpoint is configured for ${chain.displayName}`);
  }
  return defineChain({
    id: chain.chainId,
    name: chain.displayName,
    testnet: !chain.isMainnet,
    nativeCurrency: {
      name: chain.nativeAsset.symbol,
      symbol: chain.nativeAsset.symbol,
      decimals: chain.nativeAsset.decimals,
    },
    rpcUrls: { default: { http: [transport.rpcUrl] } },
    blockExplorers: {
      default: { name: chain.displayName, url: transport.explorerUrl },
    },
  });
}
