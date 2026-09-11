import { createServer, request as httpRequest, type Server } from 'node:http';
import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  ARC_TESTNET_NETWORK,
  DEFAULT_FACILITATOR_URL,
  loadSellerRuntimeConfig,
} from '../src/config.js';
import { createSellerRequestHandler, PREMIUM_ROUTES } from '../src/app.js';

const SELLER_ADDRESS = '0x1111111111111111111111111111111111111111';
const VERIFYING_CONTRACT = '0x0077777d7EBA4688BDeF3E311b846F25870A19B9';
const USDC = '0x3600000000000000000000000000000000000000';
const TRANSACTION = `0x${'a'.repeat(64)}`;

function encoded(value: unknown): string {
  return Buffer.from(JSON.stringify(value), 'utf8').toString('base64');
}

function supportedResponse(): Response {
  return new Response(
    JSON.stringify({
      kinds: [
        {
          x402Version: 2,
          scheme: 'exact',
          network: ARC_TESTNET_NETWORK,
          extra: {
            verifyingContract: VERIFYING_CONTRACT,
            assets: [{ symbol: 'USDC', address: USDC }],
          },
        },
      ],
      extensions: [],
      signers: {},
    }),
    { status: 200, headers: { 'content-type': 'application/json' } },
  );
}

function facilitatorResponse(url: string): Response {
  if (url.endsWith('/v1/x402/supported')) return supportedResponse();
  if (url.endsWith('/v1/x402/verify')) {
    return new Response(JSON.stringify({ isValid: true, payer: SELLER_ADDRESS }), {
      status: 200,
      headers: { 'content-type': 'application/json' },
    });
  }
  if (url.endsWith('/v1/x402/settle')) {
    return new Response(
      JSON.stringify({
        success: true,
        transaction: TRANSACTION,
        network: ARC_TESTNET_NETWORK,
        payer: SELLER_ADDRESS,
      }),
      { status: 200, headers: { 'content-type': 'application/json' } },
    );
  }
  throw new Error(`Unexpected facilitator URL in test: ${url}`);
}

function sellerConfig() {
  return {
    host: '127.0.0.1',
    port: 0,
    sellerAddress: SELLER_ADDRESS,
    facilitatorUrl: DEFAULT_FACILITATOR_URL,
  } as const;
}

async function listen(handler: ReturnType<typeof createSellerRequestHandler>): Promise<{
  readonly server: Server;
  readonly port: number;
}> {
  const server = createServer((request, response) => {
    void handler(request, response);
  });
  await new Promise<void>((resolve, reject) => {
    server.once('error', reject);
    server.listen({ host: '127.0.0.1', port: 0 }, resolve);
  });
  const address = server.address();
  if (!address || typeof address === 'string') throw new Error('Test server did not bind a port');
  return { server, port: address.port };
}

async function close(server: Server): Promise<void> {
  await new Promise<void>((resolve, reject) => {
    server.close((error) => (error ? reject(error) : resolve()));
  });
}

async function request(
  port: number,
  path: string,
  options: {
    readonly method?: string;
    readonly headers?: Record<string, string>;
    readonly body?: string;
  } = {},
): Promise<Response> {
  return new Promise((resolve, reject) => {
    const req = httpRequest({
      hostname: '127.0.0.1',
      port,
      path,
      method: options.method ?? 'GET',
      headers: options.headers,
    });
    req.once('error', reject);
    req.once('response', (response) => {
      const chunks: Buffer[] = [];
      response.on('data', (chunk: Buffer) => chunks.push(chunk));
      response.once('end', () => {
        const headers = new Headers();
        for (const [name, value] of Object.entries(response.headers)) {
          if (typeof value === 'string') headers.set(name, value);
          else if (Array.isArray(value)) headers.set(name, value.join(', '));
        }
        resolve(
          new Response(Buffer.concat(chunks), {
            status: response.statusCode ?? 500,
            headers,
          }),
        );
      });
    });
    if (options.body) req.write(options.body);
    req.end();
  });
}

afterEach(() => {
  vi.restoreAllMocks();
});

describe('Circle Arc Testnet seller', () => {
  it('matches the official sample route methods and prices', () => {
    expect(PREMIUM_ROUTES).toEqual([
      { method: 'GET', path: '/api/premium/quote', price: '$0.001' },
      { method: 'GET', path: '/api/premium/dataset', price: '$0.01' },
      { method: 'POST', path: '/api/premium/compute', price: '$0.0003' },
      { method: 'GET', path: '/api/premium/agent-task', price: '$0.03' },
    ]);
  });

  it('returns one Arc Gateway payment requirement for an unpaid dataset request', async () => {
    vi.spyOn(globalThis, 'fetch').mockImplementation(async (input) => {
      return facilitatorResponse(typeof input === 'string' ? input : input.toString());
    });
    const { server, port } = await listen(createSellerRequestHandler(sellerConfig()));
    try {
      const response = await request(port, '/api/premium/dataset');
      expect(response.status).toBe(402);
      const header = response.headers.get('payment-required');
      expect(header).toBeTruthy();
      const paymentRequired = JSON.parse(Buffer.from(header!, 'base64').toString('utf8')) as {
        readonly x402Version: number;
        readonly accepts: readonly Record<string, string>[];
      };
      expect(paymentRequired.x402Version).toBe(2);
      expect(paymentRequired.accepts).toHaveLength(1);
      expect(paymentRequired.accepts[0]).toMatchObject({
        scheme: 'exact',
        network: ARC_TESTNET_NETWORK,
        asset: USDC,
        amount: '10000',
        payTo: SELLER_ADDRESS,
      });
    } finally {
      await close(server);
    }
  });

  it('settles a paid dataset request through the Circle facilitator and returns the resource', async () => {
    vi.spyOn(globalThis, 'fetch').mockImplementation(async (input) => {
      return facilitatorResponse(typeof input === 'string' ? input : input.toString());
    });
    const { server, port } = await listen(createSellerRequestHandler(sellerConfig()));
    try {
      const paymentSignature = encoded({
        x402Version: 2,
        resource: {
          url: '/api/premium/dataset',
          description: 'Dataset',
          mimeType: 'application/json',
        },
        accepted: { network: ARC_TESTNET_NETWORK },
        payload: { authorization: 'test-fixture' },
      });
      const response = await request(port, '/api/premium/dataset', {
        headers: { 'payment-signature': paymentSignature },
      });
      expect(response.status).toBe(200);
      await expect(response.json()).resolves.toMatchObject({
        source: 'OneShot Circle x402 seller demo',
      });
      const settlement = response.headers.get('payment-response');
      expect(settlement).toBeTruthy();
      expect(JSON.parse(Buffer.from(settlement!, 'base64').toString('utf8'))).toMatchObject({
        success: true,
        transaction: TRANSACTION,
        network: ARC_TESTNET_NETWORK,
      });
    } finally {
      await close(server);
    }
  });

  it('rejects wrong methods and handles compute payloads only after payment', async () => {
    vi.spyOn(globalThis, 'fetch').mockImplementation(async (input) => {
      return facilitatorResponse(typeof input === 'string' ? input : input.toString());
    });
    const { server, port } = await listen(createSellerRequestHandler(sellerConfig()));
    try {
      const wrongMethod = await request(port, '/api/premium/dataset', { method: 'POST' });
      expect(wrongMethod.status).toBe(405);
      expect(wrongMethod.headers.get('allow')).toBe('GET');

      const unpaidCompute = await request(port, '/api/premium/compute', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ text: 'demo' }),
      });
      expect(unpaidCompute.status).toBe(402);
      const paymentRequired = JSON.parse(
        Buffer.from(unpaidCompute.headers.get('payment-required')!, 'base64').toString('utf8'),
      ) as { readonly accepts: readonly Record<string, string>[] };
      expect(paymentRequired.accepts[0]?.amount).toBe('300');
    } finally {
      await close(server);
    }
  });
});

describe('seller runtime configuration', () => {
  it('requires a valid seller address and stays on Circle Arc Testnet', () => {
    expect(
      loadSellerRuntimeConfig({
        ONESHOT_X402_SELLER_ADDRESS: SELLER_ADDRESS,
        ONESHOT_X402_SELLER_PORT: '8081',
      }),
    ).toEqual({
      host: '0.0.0.0',
      port: 8081,
      sellerAddress: SELLER_ADDRESS,
      facilitatorUrl: DEFAULT_FACILITATOR_URL,
    });
    expect(() =>
      loadSellerRuntimeConfig({ ONESHOT_X402_SELLER_ADDRESS: 'not-an-address' }),
    ).toThrow('20-byte EVM address');
    expect(() =>
      loadSellerRuntimeConfig({
        ONESHOT_X402_SELLER_ADDRESS: SELLER_ADDRESS,
        ONESHOT_X402_FACILITATOR_URL: 'https://gateway-api.circle.com',
      }),
    ).toThrow('Arc Testnet facilitator');
  });
});
