import { PrivyClient } from '@privy-io/node';
import { createViemAccount, type PrivyViemAccount } from '@privy-io/node/viem';

export interface PrivyX402SignerOptions {
  readonly appId: string;
  readonly appSecret: string;
  readonly walletId: string;
  readonly walletAddress: `0x${string}`;
  readonly timeoutMs?: number;
}

/**
 * Exposes only Privy's EIP-712 signer surface required by Circle Gateway
 * x402. The private key never leaves Privy and is never accepted here.
 */
export function createPrivyX402Signer(options: PrivyX402SignerOptions): PrivyViemAccount {
  const client = new PrivyClient({
    appId: options.appId,
    appSecret: options.appSecret,
    timeout: options.timeoutMs ?? 10_000,
    maxRetries: 0,
  });
  return createViemAccount(client, {
    walletId: options.walletId,
    address: options.walletAddress,
  });
}
