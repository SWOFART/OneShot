import {
  createArcReceiptSource,
  verifyReceipt,
  type TransactionReceipt,
} from '@oneshot/arc-adapter';

export interface UserWalletVerificationRequest {
  readonly transactionHash: string;
  readonly walletAddress: string;
  readonly recipient: string;
  readonly amountAtomic: string;
}

export type UserWalletVerificationResult =
  | {
      readonly kind: 'CONFIRMED';
      readonly transactionHash: string;
      readonly blockNumber: string;
      readonly transferLogIndex: number;
    }
  | { readonly kind: 'PENDING' }
  | { readonly kind: 'FINAL_REVERT'; readonly reason: string }
  | { readonly kind: 'NOT_CONFIRMED'; readonly reason: string };

export interface UserWalletVerificationPort {
  verify(request: UserWalletVerificationRequest): Promise<UserWalletVerificationResult>;
}

function verifyReceiptResult(
  receipt: TransactionReceipt,
  request: UserWalletVerificationRequest,
  chainId: number,
  tokenContract: `0x${string}`,
): UserWalletVerificationResult {
  const verdict = verifyReceipt(receipt, {
    chainId,
    walletAddress: request.walletAddress,
    tokenContract,
    recipient: request.recipient,
    amountAtomic: BigInt(request.amountAtomic),
  });
  if (verdict.result === 'CONFIRMED') {
    return {
      kind: 'CONFIRMED',
      transactionHash: receipt.transactionHash,
      blockNumber: receipt.blockNumber.toString(10),
      transferLogIndex: verdict.transferLogIndex,
    };
  }
  if (verdict.result === 'FINAL_REVERT') {
    return { kind: 'FINAL_REVERT', reason: verdict.detail };
  }
  return { kind: 'NOT_CONFIRMED', reason: verdict.detail };
}

export function createUserWalletVerificationPort(options: {
  readonly rpcUrl: string;
  readonly chainId: number;
  readonly tokenContract: `0x${string}`;
  readonly rpcTimeoutMs?: number;
}): UserWalletVerificationPort {
  const source = createArcReceiptSource({
    rpcUrl: options.rpcUrl,
    chainId: options.chainId,
    ...(options.rpcTimeoutMs === undefined ? {} : { rpcTimeoutMs: options.rpcTimeoutMs }),
  });
  return {
    async verify(request) {
      const receipt = await source.getReceipt(request.transactionHash);
      return receipt
        ? verifyReceiptResult(receipt, request, options.chainId, options.tokenContract)
        : { kind: 'PENDING' };
    },
  };
}
