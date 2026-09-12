import { describe, expect, it } from 'vitest';
import type { TransactionReceipt } from '@oneshot/arc-adapter';
import { ARC_X402_GATEWAY_WALLET } from '@oneshot/supplier-adapter';
import { PrivyArcEvidenceBridge } from '../src/index.js';
import type { EvidenceBinding, IndexedCandidate } from '@oneshot/reconciliation';

const transactionHash = `0x${'a'.repeat(64)}`;
const blockHash = `0x${'b'.repeat(64)}`;
const tokenContract = '0x3600000000000000000000000000000000000000';
const recipient = '0x1111111111111111111111111111111111111111';
const payer = '0x2222222222222222222222222222222222222222';
const transferTopic = '0xddf252ad1be2c89b69c2b068fc378daa952ba7f163c4a11628f55a4df523b3ef';
const requestFingerprint = 'c'.repeat(64);

const binding: EvidenceBinding = {
  businessIntentId: 'intent-x402-recovery',
  requestFingerprint,
  network: 'eip155:5042002',
  tokenContract,
  recipient,
  amountAtomic: '10000',
};

const receipt: TransactionReceipt = {
  transactionHash,
  chainId: 5042002,
  from: payer,
  to: ARC_X402_GATEWAY_WALLET,
  status: 1,
  blockNumber: 123n,
  blockHash,
  logs: [
    {
      address: tokenContract,
      topics: [
        transferTopic,
        `0x${'0'.repeat(24)}${payer.slice(2)}`,
        `0x${'0'.repeat(24)}${recipient.slice(2)}`,
      ],
      data: `0x${'0'.repeat(60)}2710`,
      logIndex: 7,
    },
  ],
};

const candidate: IndexedCandidate = {
  id: 'candidate-1',
  transactionHash,
  logIndex: '7',
  blockNumber: '123',
  blockHash,
  blockTimestamp: new Date().toISOString(),
  network: binding.network,
  tokenContract,
  sender: ARC_X402_GATEWAY_WALLET,
  recipient,
  amountAtomic: '10000',
  memoId: null,
  evidenceId: 'graph-evidence-1',
  bindingStatus: 'MATCH',
  contradictionCodes: [],
};

function localState(providerKind: 'DIRECT_ARC' | 'CIRCLE_X402') {
  return {
    providerIdentity: {
      referenceId: 'circle-x402:intent-x402-recovery',
      requestFingerprint,
      providerKind,
      transactionHash,
    },
    durable: { state: 'UNKNOWN', stateVersion: '2', attemptCount: 1 },
  } as never;
}

describe('x402 recovery bridge', () => {
  it('does not treat Graph token-transfer candidates as Circle Gateway proof', async () => {
    const bridge = new PrivyArcEvidenceBridge({
      walletAddress: payer,
      gatewayWalletAddress: ARC_X402_GATEWAY_WALLET,
      receiptSource: { getReceipt: async () => receipt },
      localStatePort: { read: async () => localState('CIRCLE_X402') },
    });

    await expect(bridge.verifyCandidate(binding, candidate)).resolves.toBeNull();
  });

  it('does not let a Gateway Graph candidate establish a direct intent settlement', async () => {
    const bridge = new PrivyArcEvidenceBridge({
      walletAddress: payer,
      gatewayWalletAddress: ARC_X402_GATEWAY_WALLET,
      receiptSource: { getReceipt: async () => receipt },
      localStatePort: { read: async () => localState('DIRECT_ARC') },
    });

    await expect(bridge.verifyCandidate(binding, candidate)).resolves.toBeNull();
  });
});
