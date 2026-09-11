import { createHash } from 'node:crypto';
import type { IncomingMessage, ServerResponse } from 'node:http';
import {
  createGatewayMiddleware,
  type PaymentRequest,
  type PaymentResponse,
} from '@circle-fin/x402-batching/server';
import { ARC_TESTNET_NETWORK, type SellerRuntimeConfig } from './config.js';

const MAX_REQUEST_BODY_BYTES = 16 * 1024;

export const PREMIUM_ROUTES = [
  { method: 'GET', path: '/api/premium/quote', price: '$0.001' },
  { method: 'GET', path: '/api/premium/dataset', price: '$0.01' },
  { method: 'POST', path: '/api/premium/compute', price: '$0.0003' },
  { method: 'GET', path: '/api/premium/agent-task', price: '$0.03' },
] as const;

type PremiumRoute = (typeof PREMIUM_ROUTES)[number];
type SellerHandler = (request: PaymentRequest, response: PaymentResponse) => Promise<void>;

const CORS_HEADERS: Record<string, string> = {
  'access-control-allow-origin': '*',
  'access-control-allow-methods': 'GET, POST, OPTIONS',
  'access-control-allow-headers': 'content-type, payment-signature',
  'access-control-expose-headers': 'PAYMENT-REQUIRED, PAYMENT-RESPONSE',
};

function sendJson(response: ServerResponse, status: number, payload: unknown): void {
  if (response.writableEnded) return;
  response.statusCode = status;
  response.setHeader('content-type', 'application/json');
  response.end(JSON.stringify(payload));
}

function routeKey(method: string, path: string): string {
  return `${method.toUpperCase()} ${path}`;
}

function pathFor(request: IncomingMessage): string {
  try {
    return new URL(request.url ?? '/', 'http://oneshot-seller.invalid').pathname;
  } catch {
    return '';
  }
}

async function readJson(request: IncomingMessage): Promise<unknown> {
  const chunks: Buffer[] = [];
  let size = 0;
  for await (const chunk of request) {
    const buffer = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
    size += buffer.byteLength;
    if (size > MAX_REQUEST_BODY_BYTES) throw new Error('Request body exceeds the seller limit');
    chunks.push(buffer);
  }
  const text = Buffer.concat(chunks).toString('utf8').trim();
  if (!text) return {};
  try {
    return JSON.parse(text) as unknown;
  } catch {
    throw new Error('Seller request body must be valid JSON');
  }
}

function bodyBytes(value: unknown): number {
  return Buffer.byteLength(JSON.stringify(value), 'utf8');
}

function objectKeyCount(value: unknown): number {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
    ? Object.keys(value).length
    : 0;
}

const routeHandlers: Record<PremiumRoute['path'], SellerHandler> = {
  '/api/premium/quote': async (_request, response) => {
    sendJson(response, 200, {
      quote: 'A paid API result is more useful when its payment can be resumed safely.',
      network: ARC_TESTNET_NETWORK,
    });
  },
  '/api/premium/dataset': async (_request, response) => {
    sendJson(response, 200, {
      dataset: [
        { metric: 'resumable_intents', value: 1 },
        { metric: 'committed_settlements', value: 1 },
        { metric: 'duplicate_settlements', value: 0 },
      ],
      source: 'OneShot Circle x402 seller demo',
      network: ARC_TESTNET_NETWORK,
    });
  },
  '/api/premium/compute': async (request, response) => {
    const input = await readJson(request);
    const serialized = JSON.stringify(input);
    sendJson(response, 200, {
      result: 'text-analysis-complete',
      input_bytes: bodyBytes(input),
      object_keys: objectKeyCount(input),
      input_sha256: createHash('sha256').update(serialized, 'utf8').digest('hex'),
      network: ARC_TESTNET_NETWORK,
    });
  },
  '/api/premium/agent-task': async (_request, response) => {
    sendJson(response, 200, {
      task: 'Inspect the OneShot activity timeline and find the single committed settlement.',
      network: ARC_TESTNET_NETWORK,
    });
  },
};

function routeFor(method: string, path: string): PremiumRoute | undefined {
  return PREMIUM_ROUTES.find(
    (route) => routeKey(route.method, route.path) === routeKey(method, path),
  );
}

function routeWithPath(path: string): PremiumRoute | undefined {
  return PREMIUM_ROUTES.find((route) => route.path === path);
}

function allowForPath(path: string): string {
  return PREMIUM_ROUTES.filter((route) => route.path === path)
    .map((route) => route.method)
    .join(', ');
}

function setCors(response: ServerResponse): void {
  for (const [name, value] of Object.entries(CORS_HEADERS)) response.setHeader(name, value);
}

export function createSellerRequestHandler(
  config: SellerRuntimeConfig,
): (request: IncomingMessage, response: ServerResponse) => Promise<void> {
  const gateway = createGatewayMiddleware({
    sellerAddress: config.sellerAddress,
    networks: [ARC_TESTNET_NETWORK],
    facilitatorUrl: config.facilitatorUrl,
    description: 'OneShot Circle x402 Arc Testnet paid API demo',
  });
  const middlewareByPath = new Map(
    PREMIUM_ROUTES.map((route) => [
      routeKey(route.method, route.path),
      gateway.require(route.price),
    ]),
  );

  return async (request, response) => {
    setCors(response);
    const path = pathFor(request);
    if (request.method === 'GET' && path === '/health/live') {
      sendJson(response, 200, { status: 'ok' });
      return;
    }
    if (request.method === 'GET' && path === '/health/ready') {
      sendJson(response, 200, { status: 'ok', network: ARC_TESTNET_NETWORK });
      return;
    }
    if (request.method === 'OPTIONS' && routeWithPath(path)) {
      response.statusCode = 204;
      response.setHeader('access-control-allow-methods', allowForPath(path));
      response.end();
      return;
    }

    const route = routeFor(request.method ?? '', path);
    if (!route) {
      const samePath = routeWithPath(path);
      if (samePath) {
        response.setHeader('allow', allowForPath(path));
        sendJson(response, 405, { error: 'Method not allowed' });
      } else {
        sendJson(response, 404, { error: 'Premium resource was not found' });
      }
      return;
    }

    const middleware = middlewareByPath.get(routeKey(route.method, route.path));
    const handler = routeHandlers[route.path];
    if (!middleware || !handler) {
      sendJson(response, 500, { error: 'Premium resource is misconfigured' });
      return;
    }

    const next = async (): Promise<void> => {
      await handler(request as PaymentRequest, response as PaymentResponse);
    };
    try {
      await middleware(request as PaymentRequest, response as PaymentResponse, next);
    } catch {
      if (!response.writableEnded)
        sendJson(response, 500, { error: 'Premium resource unavailable' });
      else response.destroy();
    }
  };
}
