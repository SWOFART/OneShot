import { describe, expect, it, vi } from 'vitest';
import {
  CircleX402AmbiguousError,
  CircleX402Client,
  CircleX402PreSubmitError,
  CircleX402UserWalletForwarder,
  parseCircleX402Quote,
  parseCircleX402UserWalletPayload,
} from '../src/circle-x402.js';
import { CIRCLE_X402_USER_WALLET_VALIDITY_WINDOW_SECONDS } from '@oneshot/contracts';

const URL = 'https://x402.example.test/api/dataset';
const PAY_TO = '0x1111111111111111111111111111111111111111';
const VERIFYING_CONTRACT = '0x0077777d7EBA4688BDeF3E311b846F25870A19B9';
const TX = `0x${'a'.repeat(64)}`;
const TRANSFER_ID = '66e4c182-6b84-42ad-95b9-94ffb73f5693';

function encoded(value: unknown): string {
  return Buffer.from(JSON.stringify(value), 'utf8').toString('base64');
}

function requirements(amount = '10000') {
  return {
    scheme: 'exact',
    network: 'eip155:5042002',
    asset: '0x3600000000000000000000000000000000000000',
    amount,
    payTo: PAY_TO,
    maxTimeoutSeconds: 60,
    extra: { name: 'GatewayWalletBatched', version: '1', verifyingContract: VERIFYING_CONTRACT },
  };
}

function quoteResponse(amount = '10000'): Response {
  return new Response(JSON.stringify({ error: 'payment required' }), {
    status: 402,
    headers: {
      'PAYMENT-REQUIRED': encoded({
        x402Version: 2,
        resource: { url: URL, description: 'Dataset', mimeType: 'application/json' },
        accepts: [requirements(amount)],
      }),
    },
  });
}

function signer() {
  return {
    address: '0x2222222222222222222222222222222222222222' as const,
    signTypedData: vi.fn(async () => `0x${'b'.repeat(130)}` as `0x${string}`),
  };
}

describe('Circle Gateway x402 client', () => {
  it('rejects a different verifying contract before asking Privy to sign', async () => {
    const signTypedData = signer();
    const fetchFn = vi.fn<typeof fetch>().mockResolvedValue(
      new Response('{}', {
        status: 402,
        headers: {
          'PAYMENT-REQUIRED': encoded({
            x402Version: 2,
            resource: { url: URL },
            accepts: [
              { ...requirements(), extra: { ...requirements().extra, verifyingContract: PAY_TO } },
            ],
          }),
        },
      }),
    );
    const client = new CircleX402Client({ signer: signTypedData, fetchFn });
    await expect(client.quote(URL)).rejects.toThrow('exactly one affordable');
    expect(signTypedData.signTypedData).not.toHaveBeenCalled();
  });
  it('validates the Arc quote and performs one paid request', async () => {
    const signTypedData = signer();
    const fetchFn = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(quoteResponse())
      .mockResolvedValueOnce(
        new Response(JSON.stringify({ dataset: 'demo' }), {
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
    const client = new CircleX402Client({ signer: signTypedData, fetchFn });
    const quote = await client.quote(URL);
    const result = await client.payOnce({ businessIntentId: 'intent-x402-1', url: URL, quote });

    expect(result.data).toEqual({ dataset: 'demo' });
    expect(result.settlement?.transaction).toBe(TX);
    expect(signTypedData.signTypedData).toHaveBeenCalledOnce();
    expect(fetchFn).toHaveBeenCalledTimes(2);
    expect(fetchFn.mock.calls[1]?.[1]).toMatchObject({ method: 'GET' });
  });

  it('collapses duplicate Business Intent calls and rejects a different resource', async () => {
    const signTypedData = signer();
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
    const client = new CircleX402Client({ signer: signTypedData, fetchFn });
    const quote = await client.quote(URL);
    const first = client.payOnce({ businessIntentId: 'intent-x402-2', url: URL, quote });
    const second = client.payOnce({ businessIntentId: 'intent-x402-2', url: URL, quote });
    await expect(Promise.all([first, second])).resolves.toHaveLength(2);
    await expect(
      client.payOnce({
        businessIntentId: 'intent-x402-2',
        url: 'https://other.example.test',
        quote,
      }),
    ).rejects.toThrow('different resource');
    expect(signTypedData.signTypedData).toHaveBeenCalledOnce();
    expect(fetchFn).toHaveBeenCalledTimes(2);
  });

  it('keeps Circle transfer identity when Gateway returns a UUID before batching', async () => {
    const signTypedData = signer();
    const fetchFn = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(quoteResponse())
      .mockResolvedValueOnce(
        new Response(JSON.stringify({ dataset: 'demo' }), {
          status: 200,
          headers: {
            'PAYMENT-RESPONSE': encoded({
              success: true,
              transaction: TRANSFER_ID,
              network: 'eip155:5042002',
            }),
          },
        }),
      );
    const client = new CircleX402Client({ signer: signTypedData, fetchFn });
    const quote = await client.quote(URL);
    const result = await client.payOnce({
      businessIntentId: 'intent-x402-transfer',
      url: URL,
      quote,
    });

    expect(result.settlement?.providerTransferId).toBe(TRANSFER_ID);
    expect(result.settlement?.transactionHash).toBeUndefined();
  });

  it('keeps an ambiguous paid request non-retryable in the client process', async () => {
    const signTypedData = signer();
    const fetchFn = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(quoteResponse())
      .mockRejectedValueOnce(new Error('connection reset'));
    const client = new CircleX402Client({ signer: signTypedData, fetchFn });
    const quote = await client.quote(URL);
    const input = { businessIntentId: 'intent-x402-3', url: URL, quote };
    await expect(client.payOnce(input)).rejects.toBeInstanceOf(CircleX402AmbiguousError);
    await expect(client.payOnce(input)).rejects.toBeInstanceOf(CircleX402AmbiguousError);
    expect(fetchFn).toHaveBeenCalledTimes(2);
    expect(signTypedData.signTypedData).toHaveBeenCalledOnce();
  });

  it('rejects an unaffordable quote before signing or paying', async () => {
    const signTypedData = signer();
    const fetchFn = vi.fn<typeof fetch>().mockResolvedValueOnce(quoteResponse('10001'));
    const client = new CircleX402Client({
      signer: signTypedData,
      fetchFn,
      maxAmountAtomic: 10000n,
    });
    await expect(client.quote(URL)).rejects.toThrow('exactly one affordable');
    expect(signTypedData.signTypedData).not.toHaveBeenCalled();
    expect(fetchFn).toHaveBeenCalledOnce();
  });

  it('allows a safe retry when quote discovery fails before payment', async () => {
    const signTypedData = signer();
    const fetchFn = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(new Response('{}', { status: 503 }))
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
    const client = new CircleX402Client({ signer: signTypedData, fetchFn });
    const input = { businessIntentId: 'intent-x402-4', url: URL };
    await expect(client.payOnce(input)).rejects.toThrow('quote request returned HTTP 503');
    await expect(client.payOnce(input)).resolves.toMatchObject({
      businessIntentId: input.businessIntentId,
    });
    expect(signTypedData.signTypedData).toHaveBeenCalledOnce();
    expect(fetchFn).toHaveBeenCalledTimes(3);
  });

  it('marks a signing refusal as definitely not submitted', async () => {
    const refusedSigner = signer();
    refusedSigner.signTypedData.mockRejectedValueOnce(new Error('policy_violation'));
    const fetchFn = vi.fn<typeof fetch>().mockResolvedValueOnce(quoteResponse());
    const client = new CircleX402Client({ signer: refusedSigner, fetchFn });
    const quote = await client.quote(URL);

    await expect(
      client.payOnce({ businessIntentId: 'intent-x402-policy-denied', url: URL, quote }),
    ).rejects.toBeInstanceOf(CircleX402PreSubmitError);
    expect(fetchFn).toHaveBeenCalledOnce();
  });

  it('treats malformed settlement evidence as UNKNOWN', async () => {
    const signTypedData = signer();
    const fetchFn = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(quoteResponse())
      .mockResolvedValueOnce(
        new Response('{}', { status: 200, headers: { 'PAYMENT-RESPONSE': 'not-base64' } }),
      );
    const client = new CircleX402Client({ signer: signTypedData, fetchFn });
    const quote = await client.quote(URL);
    await expect(
      client.payOnce({ businessIntentId: 'intent-x402-5', url: URL, quote }),
    ).rejects.toBeInstanceOf(CircleX402AmbiguousError);
    expect(fetchFn).toHaveBeenCalledTimes(2);
    expect(signTypedData.signTypedData).toHaveBeenCalledOnce();
  });

  it('forwards one already-signed user-wallet authorization without a server signer', async () => {
    const payer = '0x2222222222222222222222222222222222222222';
    const quote = parseCircleX402Quote({
      url: URL,
      resourceUrl: URL,
      x402Version: 2,
      requirements: requirements(),
    });
    const paymentPayload = {
      x402Version: 2,
      payload: {
        authorization: {
          from: payer,
          to: PAY_TO,
          value: '10000',
          validAfter: String(Math.floor(Date.now() / 1000) - 600),
          validBefore: String(Math.floor(Date.now() / 1000) + 600),
          nonce: `0x${'c'.repeat(64)}`,
        },
        signature: `0x${'d'.repeat(130)}`,
      },
    };
    const fetchFn = vi.fn<typeof fetch>().mockResolvedValue(
      new Response(JSON.stringify({ dataset: 'user-paid' }), {
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
    const forwarder = new CircleX402UserWalletForwarder({
      allowedUrl: URL,
      fetchFn,
    });

    await expect(
      forwarder.forward({
        businessIntentId: 'intent-x402-user-wallet',
        quote,
        payerAddress: payer,
        paymentPayload,
      }),
    ).resolves.toMatchObject({
      businessIntentId: 'intent-x402-user-wallet',
      data: { dataset: 'user-paid' },
      settlement: { transactionHash: TX },
    });
    expect(fetchFn).toHaveBeenCalledOnce();
    expect(fetchFn.mock.calls[0]?.[1]).toMatchObject({ method: 'GET' });
    const headers = new Headers(fetchFn.mock.calls[0]?.[1]?.headers);
    expect(headers.get('PAYMENT-SIGNATURE')).toBeTruthy();
  });

  it('rejects a user-wallet payload that does not match the approved payer before forwarding', async () => {
    const quote = parseCircleX402Quote({
      url: URL,
      resourceUrl: URL,
      x402Version: 2,
      requirements: requirements(),
    });
    const fetchFn = vi.fn<typeof fetch>();
    const forwarder = new CircleX402UserWalletForwarder({ allowedUrl: URL, fetchFn });
    await expect(
      forwarder.forward({
        businessIntentId: 'intent-x402-user-conflict',
        quote,
        payerAddress: '0x2222222222222222222222222222222222222222',
        paymentPayload: {
          x402Version: 2,
          payload: {
            authorization: {
              from: '0x3333333333333333333333333333333333333333',
              to: PAY_TO,
              value: '10000',
              validAfter: String(Math.floor(Date.now() / 1000) - 600),
              validBefore: String(Math.floor(Date.now() / 1000) + 600),
              nonce: `0x${'c'.repeat(64)}`,
            },
            signature: `0x${'d'.repeat(130)}`,
          },
        },
      }),
    ).rejects.toBeInstanceOf(CircleX402PreSubmitError);
    expect(fetchFn).not.toHaveBeenCalled();
  });

  it('accepts a bounded human-approval validity buffer and rejects longer windows', () => {
    const payer = '0x2222222222222222222222222222222222222222';
    const quote = parseCircleX402Quote({
      url: URL,
      resourceUrl: URL,
      x402Version: 2,
      requirements: requirements(),
    });
    const now = Math.floor(Date.now() / 1000);
    const payload = (validBefore: number) => ({
      x402Version: 2,
      payload: {
        authorization: {
          from: payer,
          to: PAY_TO,
          value: '10000',
          validAfter: String(now - 600),
          validBefore: String(validBefore),
          nonce: `0x${'c'.repeat(64)}`,
        },
        signature: `0x${'d'.repeat(130)}`,
      },
    });

    expect(() =>
      parseCircleX402UserWalletPayload(
        payload(now + CIRCLE_X402_USER_WALLET_VALIDITY_WINDOW_SECONDS),
        quote,
        payer,
      ),
    ).not.toThrow();
    expect(() =>
      parseCircleX402UserWalletPayload(
        payload(now + CIRCLE_X402_USER_WALLET_VALIDITY_WINDOW_SECONDS + 1),
        quote,
        payer,
      ),
    ).toThrow(CircleX402PreSubmitError);
  });

  it('marks an explicit supplier verification refusal as pre-submit safe', async () => {
    const payer = '0x2222222222222222222222222222222222222222';
    const quote = parseCircleX402Quote({
      url: URL,
      resourceUrl: URL,
      x402Version: 2,
      requirements: requirements(),
    });
    const fetchFn = vi.fn<typeof fetch>().mockResolvedValue(
      new Response(
        JSON.stringify({
          error: 'Payment verification failed',
          reason: 'authorization_validity_too_short',
        }),
        { status: 402, headers: { 'content-type': 'application/json' } },
      ),
    );
    const forwarder = new CircleX402UserWalletForwarder({
      allowedUrl: URL,
      fetchFn,
    });

    await expect(
      forwarder.forward({
        businessIntentId: 'intent-x402-verification-refused',
        quote,
        payerAddress: payer,
        paymentPayload: {
          x402Version: 2,
          payload: {
            authorization: {
              from: payer,
              to: PAY_TO,
              value: '10000',
              validAfter: String(Math.floor(Date.now() / 1000) - 600),
              validBefore: String(Math.floor(Date.now() / 1000) + 600),
              nonce: `0x${'c'.repeat(64)}`,
            },
            signature: `0x${'d'.repeat(130)}`,
          },
        },
      }),
    ).rejects.toBeInstanceOf(CircleX402PreSubmitError);
  });
});
