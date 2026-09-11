import { describe, expect, it } from 'vitest';
import {
  CIRCLE_BATCH_PROCESSED_TOPIC,
  TRANSFER_EVENT_TOPIC,
  verifyCircleGatewayBatchReceipt,
  verifyReceipt,
  type ExpectedSettlement,
  type ReceiptLog,
  type TransactionReceipt,
} from '../src/receipt.js';
import { encodeAbiParameters, encodeFunctionData, parseAbi, parseAbiParameters } from 'viem';

const WALLET = '0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa';
const RECIPIENT = '0x1111111111111111111111111111111111111111';
const OTHER = '0x2222222222222222222222222222222222222222';
const USDC = '0x3600000000000000000000000000000000000000';
const GATEWAY = '0x0077777d7EBA4688BDeF3E311b846F25870A19B9';
const BATCH_SIGNER = '0x3333333333333333333333333333333333333333';

const EXPECTED: ExpectedSettlement = {
  chainId: 5042002,
  walletAddress: WALLET,
  tokenContract: USDC,
  recipient: RECIPIENT,
  amountAtomic: 1_250_000n,
};

function topic(address: string): string {
  return `0x${'0'.repeat(24)}${address.slice(2)}`;
}

function word(value: bigint): string {
  return `0x${value.toString(16).padStart(64, '0')}`;
}

function transferLog(overrides: Partial<ReceiptLog> = {}): ReceiptLog {
  return {
    address: USDC,
    topics: [TRANSFER_EVENT_TOPIC, topic(WALLET), topic(RECIPIENT)],
    data: word(1_250_000n),
    logIndex: 3,
    ...overrides,
  };
}

function receipt(overrides: Partial<TransactionReceipt> = {}): TransactionReceipt {
  return {
    transactionHash: `0x${'c'.repeat(64)}`,
    chainId: 5042002,
    from: WALLET,
    to: USDC,
    status: 1,
    blockNumber: 100n,
    blockHash: `0x${'d'.repeat(64)}`,
    logs: [transferLog()],
    ...overrides,
  };
}

describe('confirmation', () => {
  it('confirms an exact receipt and Transfer', () => {
    expect(verifyReceipt(receipt(), EXPECTED)).toEqual({
      result: 'CONFIRMED',
      transferLogIndex: 3,
    });
  });

  it('confirms regardless of address casing', () => {
    const upper = receipt({ from: WALLET.toUpperCase().replace('0X', '0x') });
    expect(verifyReceipt(upper, EXPECTED).result).toBe('CONFIRMED');
  });

  it('ignores unrelated logs alongside the expected Transfer', () => {
    const noisy = receipt({
      logs: [
        { address: OTHER, topics: ['0xdeadbeef'], data: '0x', logIndex: 0 },
        transferLog(),
      ],
    });
    expect(verifyReceipt(noisy, EXPECTED).result).toBe('CONFIRMED');
  });
});

describe('final revert', () => {
  it('treats status 0 as terminal failure', () => {
    expect(verifyReceipt(receipt({ status: 0, logs: [] }), EXPECTED).result).toBe('FINAL_REVERT');
  });

  it('treats status 0 as revert even if a Transfer log is present', () => {
    // A reverted transaction's logs are discarded on chain; trusting them
    // would confirm a settlement that never happened.
    expect(verifyReceipt(receipt({ status: 0 }), EXPECTED).result).toBe('FINAL_REVERT');
  });
});

describe('success status is not confirmation', () => {
  it('does not confirm a successful receipt with no logs', () => {
    // The single most important case in this file.
    const verdict = verifyReceipt(receipt({ logs: [] }), EXPECTED);
    expect(verdict.result).toBe('NOT_CONFIRMED');
  });

  it('does not confirm when the Transfer went to someone else', () => {
    const redirected = receipt({
      logs: [transferLog({ topics: [TRANSFER_EVENT_TOPIC, topic(WALLET), topic(OTHER)] })],
    });
    expect(verifyReceipt(redirected, EXPECTED).result).toBe('NOT_CONFIRMED');
  });

  it('does not confirm when the amount differs by one atomic unit', () => {
    const short = receipt({ logs: [transferLog({ data: word(1_249_999n) })] });
    expect(verifyReceipt(short, EXPECTED).result).toBe('NOT_CONFIRMED');
  });

  it('does not confirm a Transfer emitted by a different token contract', () => {
    // An attacker-deployed token can emit an identical-looking Transfer event.
    const impostor = receipt({ logs: [transferLog({ address: OTHER })] });
    expect(verifyReceipt(impostor, EXPECTED).result).toBe('NOT_CONFIRMED');
  });

  it('does not confirm when the sender is not the execution wallet', () => {
    expect(verifyReceipt(receipt({ from: OTHER }), EXPECTED).result).toBe('NOT_CONFIRMED');
  });

  it('does not confirm a receipt from a different chain', () => {
    expect(verifyReceipt(receipt({ chainId: 1 }), EXPECTED).result).toBe('NOT_CONFIRMED');
  });

  it('does not confirm when the transaction called a different contract', () => {
    expect(verifyReceipt(receipt({ to: OTHER }), EXPECTED).result).toBe('NOT_CONFIRMED');
  });

  it('does not confirm two matching Transfers', () => {
    // Two identical transfers means more value moved than was authorized.
    const doubled = receipt({ logs: [transferLog(), transferLog({ logIndex: 4 })] });
    const verdict = verifyReceipt(doubled, EXPECTED);
    expect(verdict.result).toBe('NOT_CONFIRMED');
    if (verdict.result === 'NOT_CONFIRMED') {
      expect(verdict.detail).toMatch(/2 matching Transfer/);
    }
  });

  it('does not confirm a malformed amount word', () => {
    expect(verifyReceipt(receipt({ logs: [transferLog({ data: '0x1' })] }), EXPECTED).result).toBe(
      'NOT_CONFIRMED',
    );
  });

  it('does not confirm a log missing its indexed topics', () => {
    const truncated = receipt({ logs: [transferLog({ topics: [TRANSFER_EVENT_TOPIC] })] });
    expect(verifyReceipt(truncated, EXPECTED).result).toBe('NOT_CONFIRMED');
  });
});

describe('Circle Gateway batching', () => {
  const batchId = `0x${'e'.repeat(64)}`;
  const batchInput = encodeFunctionData({
    abi: parseAbi(['function submitBatch(bytes calldataBytes, bytes signature)']),
    functionName: 'submitBatch',
    args: [
      encodeAbiParameters(
        parseAbiParameters(
          '(address depositor,int256 value)[] deltas, bytes32 batchId, uint32 domain, address tokenAddress, address gatewayWalletAddress',
        ),
        [
          [
            { depositor: WALLET, value: -1_250_000n },
            { depositor: RECIPIENT, value: 1_250_000n },
          ],
          batchId,
          26,
          USDC,
          GATEWAY,
        ],
      ),
      '0x',
    ],
  });

  it('confirms Circle balance deltas from submitBatch calldata', () => {
    const gatewayReceipt = receipt({
      from: BATCH_SIGNER,
      to: GATEWAY,
      logs: [
        {
          address: GATEWAY,
          topics: [CIRCLE_BATCH_PROCESSED_TOPIC, batchId, topic(BATCH_SIGNER), topic(USDC)],
          data: '0x',
          logIndex: 12,
        },
      ],
    });
    expect(
      verifyCircleGatewayBatchReceipt(gatewayReceipt, batchInput, {
        chainId: 5042002,
        gatewayWalletAddress: GATEWAY,
        tokenContract: USDC,
        payer: WALLET,
        recipient: RECIPIENT,
        amountAtomic: 1_250_000n,
        gatewayDomain: 26,
      }),
    ).toEqual({ result: 'CONFIRMED', transferLogIndex: 12 });
  });

  it('rejects a batch with a different payer debit', () => {
    const gatewayReceipt = receipt({
      from: BATCH_SIGNER,
      to: GATEWAY,
      logs: [
        {
          address: GATEWAY,
          topics: [CIRCLE_BATCH_PROCESSED_TOPIC, batchId, topic(BATCH_SIGNER), topic(USDC)],
          data: '0x',
          logIndex: 12,
        },
      ],
    });
    const verdict = verifyCircleGatewayBatchReceipt(gatewayReceipt, batchInput, {
      chainId: 5042002,
      gatewayWalletAddress: GATEWAY,
      tokenContract: USDC,
      payer: OTHER,
      recipient: RECIPIENT,
      amountAtomic: 1_250_000n,
      gatewayDomain: 26,
    });
    expect(verdict.result).toBe('NOT_CONFIRMED');
  });
});
