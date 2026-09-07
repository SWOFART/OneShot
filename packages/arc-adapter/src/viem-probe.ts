/**
 * Live RPC probe backed by viem.
 *
 * The offline `RpcProbe` stubs prove the probe's logic. This implementation is
 * what actually contacts a configured endpoint, and it is the only thing that
 * can tell an operator whether THEIR setup is correct.
 *
 * Read-only by construction: it exposes `eth_chainId` and `eth_getCode` and
 * nothing that can sign, send, or mutate.
 */

import { createPublicClient, http } from 'viem';
import type { SettlementConfig } from './config.js';
import type { RpcProbe } from './readiness.js';

/**
 * Build a probe against the configured endpoint.
 *
 * The chain is declared from the profile, but `checkChainId` still asks the
 * endpoint what chain it is actually on. Trusting the declared value would
 * defeat the check entirely.
 */
export function createViemProbe(config: SettlementConfig): RpcProbe {
  const client = createPublicClient({
    transport: http(config.rpcUrl, { timeout: config.rpcTimeoutMs }),
  });

  return {
    async getChainId(): Promise<number> {
      return await client.getChainId();
    },

    async getCode(address: `0x${string}`): Promise<string | null> {
      const code = await client.getCode({ address });
      return code ?? null;
    },
  };
}
