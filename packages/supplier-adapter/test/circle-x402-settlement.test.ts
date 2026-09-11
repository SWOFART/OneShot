import { describe, expect, it, vi } from 'vitest';
import {
  ARC_X402_GATEWAY_WALLET,
  CircleX402Client,
  CircleX402SettlementPort,
} from '../src/index.js';
import type { TransactionReceipt } from '@oneshot/arc-adapter';

const URL = 'https://x402.example.test/api/dataset';
const RECIPIENT = '0x1111111111111111111111111111111111111111';
const TX = `0x${'a'.repeat(64)}`;
const TRANSFER_ID = '66e4c182-6b84-42ad-95b9-94ffb73f5693';
const BLOCK_HASH = `0x${'b'.repeat(64)}`;
const TRANSFER_TOPIC = '0xddf252ad1be2c89b69c2b068fc378daa952ba7f163c4a11628f55a4df523b3ef';

function encoded(value: unknown): string {
  return Buffer.from(JSON.stringify(value), 'utf8').toString('base64');
}

function requirements() {
  return {
    scheme: 'exact',
    network: 'eip155:5042002',
    asset: '0x3600000000000000000000000000000000000000',
    amount: '10000',
    payTo: RECIPIENT,
    maxTimeoutSeconds: 60,
    extra: {
      name: 'GatewayWalletBatched',
      version: '1',
      verifyingContract: ARC_X402_GATEWAY_WALLET,
    },
  };
}

function quoteResponse(): Response {
  return new Response('{}', {
    status: 402,
    headers: {
      'PAYMENT-REQUIRED': encoded({
        x402Version: 2,
        resource: { url: '/api/dataset', description: 'Dataset', mimeType: 'application/json' },
        accepts: [requirements()],
      }),
    },
  });
}

function signer() {
  return {
    address: '0x2222222222222222222222222222222222222222' as const,
    signTypedData: vi.fn(async () => `0x${'c'.repeat(130)}` as `0x${string}`),
  };
}

function receipt(): TransactionReceipt {
  return {
    transactionHash: TX,
    chainId: 5042002,
    from: '0x2222222222222222222222222222222222222222',
    to: ARC_X402_GATEWAY_WALLET,
    status: 1,
    blockNumber: 123n,
    blockHash: BLOCK_HASH,
    logs: [
      {
        address: '0x3600000000000000000000000000000000000000',
        topics: [
          TRANSFER_TOPIC,
          `0x${'0'.repeat(24)}2222222222222222222222222222222222222222`,
          `0x${'0'.repeat(24)}1111111111111111111111111111111111111111`,
        ],
        data: `0x${'0'.repeat(60)}2710`,
        logIndex: 7,
      },
    ],
  };
}

describe('Circle Gateway x402 settlement port', () => {
  it('derives a stable Privy-safe identity from the intent fingerprint', () => {
    const port = new CircleX402SettlementPort({
      client: new CircleX402Client({ signer: signer() }),
      allowedUrl: URL,
      getTarget: async () => undefined,
      getReceipt: async () => null,
    });
    const request = {
      business_intent_id: `intent-${'a'.repeat(120)}`,
      recipient: RECIPIENT,
      amount_atomic: '10000',
      asset: 'USDC' as const,
      network: 'eip155:5042002' as const,
      purpose: 'paid api identity test',
      state: 'READY' as const,
      version: 2,
      attempts: [],
      evidence: [],
    };

    const first = port.getSubmissionIdentity(request);
    const second = port.getSubmissionIdentity(request);

    expect(first).toEqual(second);
    expect(first.idempotencyKey).toBe(first.referenceId);
    expect(first.idempotencyKey).toHaveLength(64);
    expect(first.requestFingerprint).toMatch(/^[0-9a-f]{64}$/u);
  });

  it('confirms only an exact Arc Gateway receipt and preserves its block/log proof', async () => {
    const fetchFn = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(quoteResponse())
      .mockResolvedValueOnce(
        new Response('{"dataset":"demo"}', {
          status: 200,
          headers: {
            'PAYMENT-RESPONSE': encoded({
              success: true,
              transaction: TX,
              network: 'eip155:5042002',
            }),
          },
        }),
      );
    const client = new CircleX402Client({ signer: signer(), fetchFn });
    const quote = await client.quote(URL);
    const port = new CircleX402SettlementPort({
      client,
      allowedUrl: URL,
      getTarget: async () => ({
        businessIntentId: 'intent-x402-settlement',
        resourceUrl: '/api/dataset',
        method: 'GET' as const,
        quotePayload: quote,
      }),
      getReceipt: async () => receipt(),
    });

    await expect(
      port.submit(
        {
          business_intent_id: 'intent-x402-settlement',
          recipient: RECIPIENT,
          amount_atomic: '10000',
          asset: 'USDC',
          network: 'eip155:5042002',
          purpose: 'paid api test',
        },
        { attemptId: 'attempt-1', correlationId: 'corr-1' },
      ),
    ).resolves.toMatchObject({
      kind: 'CONFIRMED',
      transaction_hash: TX,
      block_number: '123',
      transfer_log_index: 7,
    });
  });

  it('holds a mined-missing or unavailable receipt as possibly submitted', async () => {
    const fetchFn = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(quoteResponse())
      .mockResolvedValueOnce(
        new Response('{}', {
          status: 200,
          headers: {
            'PAYMENT-RESPONSE': encoded({
              success: true,
              transaction: TX,
              network: 'eip155:5042002',
            }),
          },
        }),
      );
    const client = new CircleX402Client({ signer: signer(), fetchFn });
    const quote = await client.quote(URL);
    const record = vi.fn(async () => undefined);
    const port = new CircleX402SettlementPort({
      client,
      allowedUrl: URL,
      getTarget: async () => ({
        businessIntentId: 'intent-x402-unknown',
        resourceUrl: '/api/dataset',
        method: 'GET' as const,
        quotePayload: quote,
      }),
      getReceipt: async () => null,
      recordProviderTransaction: record,
    });

    await expect(
      port.submit(
        {
          business_intent_id: 'intent-x402-unknown',
          recipient: RECIPIENT,
          amount_atomic: '10000',
          asset: 'USDC',
          network: 'eip155:5042002',
          purpose: 'paid api test',
        },
        { attemptId: 'attempt-2', correlationId: 'corr-2' },
      ),
    ).resolves.toMatchObject({ kind: 'POSSIBLY_SUBMITTED' });
    expect(record).toHaveBeenCalledWith('attempt-2', TX);
  });

  it('persists Circle transfer identity and response before batch completion', async () => {
    const fetchFn = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(quoteResponse())
      .mockResolvedValueOnce(
        new Response('{"dataset":"demo"}', {
          status: 200,
          headers: {
            'PAYMENT-RESPONSE': encoded({
              success: true,
              transaction: TRANSFER_ID,
              network: 'eip155:5042002',
            }),
          },
        }),
      )
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            id: TRANSFER_ID,
            status: 'received',
            token: 'USDC',
            sendingNetwork: 'eip155:5042002',
            recipientNetwork: 'eip155:5042002',
            fromAddress: '0x2222222222222222222222222222222222222222',
            toAddress: RECIPIENT,
            amount: '10000',
          }),
          { status: 200 },
        ),
      );
    const client = new CircleX402Client({ signer: signer(), fetchFn });
    const quote = await client.quote(URL);
    const recordTransfer = vi.fn(async () => undefined);
    const port = new CircleX402SettlementPort({
      client,
      allowedUrl: URL,
      getTarget: async () => ({
        businessIntentId: 'intent-x402-transfer-pending',
        resourceUrl: '/api/dataset',
        method: 'GET' as const,
        quotePayload: quote,
      }),
      getReceipt: async () => null,
      recordTransfer,
    });

    await expect(
      port.submit(
        {
          business_intent_id: 'intent-x402-transfer-pending',
          recipient: RECIPIENT,
          amount_atomic: '10000',
          asset: 'USDC',
          network: 'eip155:5042002',
          purpose: 'paid api test',
        },
        { attemptId: 'attempt-transfer', correlationId: 'corr-transfer' },
      ),
    ).resolves.toMatchObject({ kind: 'POSSIBLY_SUBMITTED' });
    expect(recordTransfer).toHaveBeenCalledWith(
      'intent-x402-transfer-pending',
      { dataset: 'demo' },
      TRANSFER_ID,
    );
  });

  it('fails safely when Privy refuses the signature before the paid request', async () => {
    const refusedSigner = signer();
    refusedSigner.signTypedData.mockRejectedValueOnce(new Error('policy_violation'));
    const fetchFn = vi.fn<typeof fetch>().mockResolvedValueOnce(quoteResponse());
    const client = new CircleX402Client({ signer: refusedSigner, fetchFn });
    const quote = await client.quote(URL);
    const port = new CircleX402SettlementPort({
      client,
      allowedUrl: URL,
      getTarget: async () => ({
        businessIntentId: 'intent-x402-policy-denied',
        resourceUrl: '/api/dataset',
        method: 'GET' as const,
        quotePayload: quote,
      }),
      getReceipt: async () => null,
    });

    await expect(
      port.submit(
        {
          business_intent_id: 'intent-x402-policy-denied',
          recipient: RECIPIENT,
          amount_atomic: '10000',
          asset: 'USDC',
          network: 'eip155:5042002',
          purpose: 'paid api test',
        },
        { attemptId: 'attempt-policy', correlationId: 'corr-policy' },
      ),
    ).resolves.toMatchObject({ kind: 'DEFINITELY_NOT_SUBMITTED' });
    expect(fetchFn).toHaveBeenCalledOnce();
  });
});
