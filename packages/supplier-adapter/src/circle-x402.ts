import { BatchEvmScheme } from '@circle-fin/x402-batching/client';
import { supportsBatching, type BatchEvmSigner } from '@circle-fin/x402-batching';
import { x402Client, x402HTTPClient } from '@x402/core/client';
import type {
  PaymentPayload,
  PaymentRequired,
  PaymentRequirements,
  SettleResponse,
} from '@x402/core/types';

export const ARC_X402_NETWORK = 'eip155:5042002';
export const ARC_X402_USDC = '0x3600000000000000000000000000000000000000';
const DEFAULT_MAX_AMOUNT_ATOMIC = 10_000n;
const MAX_CIRCLE_X402_TIMEOUT_SECONDS = 604_900;
const TRANSACTION_HASH = /^0x[0-9a-fA-F]{64}$/u;

export interface CircleX402Quote {
  readonly url: string;
  readonly x402Version: number;
  readonly resourceUrl: string;
  readonly requirements: PaymentRequirements;
}

export interface CircleX402PaymentResult<T> {
  readonly businessIntentId: string;
  readonly quote: CircleX402Quote;
  readonly data: T;
  readonly settlement?: {
    readonly success: true;
    readonly transaction: `0x${string}`;
    readonly network: string;
    readonly payer?: string;
    readonly amountAtomic?: string;
  };
}

export interface CircleX402ClientOptions {
  readonly signer: BatchEvmSigner;
  readonly maxAmountAtomic?: bigint;
  readonly network?: string;
  readonly asset?: string;
  readonly fetchFn?: typeof fetch;
}

/**
 * Ambiguous x402 response. The paid request reached the supplier boundary,
 * so callers must reconcile Gateway/Arc evidence before attempting anything
 * for this Business Intent again.
 */
export class CircleX402AmbiguousError extends Error {
  readonly possiblySubmitted = true;
  readonly businessIntentId: string;
  readonly quote: CircleX402Quote;

  constructor(businessIntentId: string, quote: CircleX402Quote, message: string) {
    super(message);
    this.name = 'CircleX402AmbiguousError';
    this.businessIntentId = businessIntentId;
    this.quote = quote;
  }
}

function assertUrl(value: string): string {
  const url = new URL(value);
  if (url.protocol !== 'https:' || url.username || url.password || url.hash) {
    throw new Error('x402 resource URL must be credential-free HTTPS');
  }
  return url.toString();
}

function assertResourceUrl(value: string, baseUrl: string): string {
  if (value.length === 0 || value.length > 2048) {
    throw new Error('x402 resource URL is not bounded');
  }
  const base = new URL(baseUrl);
  const resolved = new URL(value, base);
  const loopback = resolved.hostname === 'localhost' || resolved.hostname === '127.0.0.1';
  if (
    (resolved.protocol !== 'https:' && !(loopback && resolved.protocol === 'http:')) ||
    resolved.username ||
    resolved.password ||
    resolved.hash ||
    resolved.origin !== base.origin
  ) {
    throw new Error('x402 resource URL must be same-origin credential-free HTTPS metadata');
  }
  return value;
}

function decodeHeader(value: string): unknown {
  const normalized = value.replace(/-/gu, '+').replace(/_/gu, '/');
  const padded = normalized.padEnd(Math.ceil(normalized.length / 4) * 4, '=');
  return JSON.parse(Buffer.from(padded, 'base64').toString('utf8')) as unknown;
}

function header(response: Response, name: string): string | null {
  return response.headers.get(name) ?? response.headers.get(`X-${name}`);
}

async function responseBody(response: Response): Promise<unknown> {
  const text = await response.text();
  if (text.length === 0) return undefined;
  try {
    return JSON.parse(text) as unknown;
  } catch {
    return text;
  }
}

function asRequirements(value: PaymentRequirements): PaymentRequirements {
  if (
    value.scheme !== 'exact' ||
    value.network !== ARC_X402_NETWORK ||
    value.asset.toLowerCase() !== ARC_X402_USDC ||
    !supportsBatching(value) ||
    !Number.isSafeInteger(value.maxTimeoutSeconds) ||
    value.maxTimeoutSeconds <= 0 ||
    value.maxTimeoutSeconds > MAX_CIRCLE_X402_TIMEOUT_SECONDS ||
    !/^0x[0-9a-fA-F]{40}$/u.test(value.payTo) ||
    !/^\d+$/u.test(value.amount)
  ) {
    throw new Error('x402 quote is not a Circle Gateway Arc Testnet USDC payment');
  }
  return value;
}

export function parseCircleX402Quote(value: unknown): CircleX402Quote {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    throw new Error('x402 quote must be an object');
  }
  const candidate = value as Record<string, unknown>;
  if (
    typeof candidate.url !== 'string' ||
    typeof candidate.resourceUrl !== 'string' ||
    typeof candidate.x402Version !== 'number' ||
    !Number.isSafeInteger(candidate.x402Version) ||
    typeof candidate.requirements !== 'object' ||
    candidate.requirements === null ||
    Array.isArray(candidate.requirements)
  ) {
    throw new Error('x402 quote is malformed');
  }
  const url = assertUrl(candidate.url);
  const resourceUrl = assertResourceUrl(candidate.resourceUrl, url);
  if (candidate.x402Version !== 2) {
    throw new Error('Circle Gateway x402 requires version 2');
  }
  const requirements = asRequirements(candidate.requirements as PaymentRequirements);
  if (BigInt(requirements.amount) <= 0n) throw new Error('x402 quote amount must be positive');
  return {
    url,
    x402Version: candidate.x402Version,
    resourceUrl,
    requirements,
  };
}

function parsePaymentRequired(response: Response, body: unknown): PaymentRequired {
  const encoded = header(response, 'PAYMENT-REQUIRED');
  if (encoded) {
    return new x402HTTPClient(new x402Client()).getPaymentRequiredResponse(() => encoded, body);
  }
  if (body && typeof body === 'object') {
    return new x402HTTPClient(new x402Client()).getPaymentRequiredResponse(() => null, body);
  }
  throw new Error('x402 supplier returned 402 without payment requirements');
}

function parseSettlement(response: Response): SettleResponse | undefined {
  const encoded = header(response, 'PAYMENT-RESPONSE');
  if (!encoded) return undefined;
  const decoded = decodeHeader(encoded);
  if (typeof decoded !== 'object' || decoded === null) {
    throw new Error('x402 supplier returned malformed settlement evidence');
  }
  return decoded as SettleResponse;
}

async function fetchQuote(
  fetchFn: typeof fetch,
  url: string,
  maxAmountAtomic: bigint,
): Promise<CircleX402Quote> {
  const normalizedUrl = assertUrl(url);
  const response = await fetchFn(normalizedUrl, { method: 'GET', redirect: 'error' });
  const body = response.status === 402 ? await responseBody(response) : undefined;
  if (response.status !== 402) {
    throw new Error(`x402 supplier quote request returned HTTP ${response.status}`);
  }
  const paymentRequired = parsePaymentRequired(response, body);
  const matching = paymentRequired.accepts.filter((candidate) => {
    try {
      asRequirements(candidate);
      return BigInt(candidate.amount) <= maxAmountAtomic;
    } catch {
      return false;
    }
  });
  if (matching.length !== 1) {
    throw new Error('x402 supplier must expose exactly one affordable Arc Testnet Gateway option');
  }
  const requirements = asRequirements(matching[0]!);
  return parseCircleX402Quote({
    url: normalizedUrl,
    x402Version: paymentRequired.x402Version,
    resourceUrl: paymentRequired.resource.url,
    requirements,
  });
}

export interface CircleX402QuoteFetchOptions {
  readonly maxAmountAtomic?: bigint;
  readonly fetchFn?: typeof fetch;
}

/** Credential-free quote discovery used by the API before approval. */
export function fetchCircleX402Quote(
  url: string,
  options: CircleX402QuoteFetchOptions = {},
): Promise<CircleX402Quote> {
  return fetchQuote(
    options.fetchFn ?? fetch.bind(globalThis),
    url,
    options.maxAmountAtomic ?? DEFAULT_MAX_AMOUNT_ATOMIC,
  );
}

/**
 * Circle Gateway x402 buyer rail. It uses a caller-provided signer so a
 * Privy-controlled wallet can sign EIP-3009 typed data without exporting a
 * private key. One paid HTTP request is attempted per Business Intent in this
 * process; durable OneShot storage must own the cross-process claim/reconcile.
 */
export class CircleX402Client {
  readonly #scheme: BatchEvmScheme;
  readonly #http: x402HTTPClient;
  readonly #fetch: typeof fetch;
  readonly #maxAmountAtomic: bigint;
  readonly #network: string;
  readonly #asset: string;
  readonly #attempts = new Map<
    string,
    { readonly fingerprint: string; readonly result: Promise<CircleX402PaymentResult<unknown>> }
  >();

  constructor(options: CircleX402ClientOptions) {
    this.#scheme = new BatchEvmScheme(options.signer);
    this.#http = new x402HTTPClient(new x402Client());
    this.#fetch = options.fetchFn ?? fetch.bind(globalThis);
    this.#maxAmountAtomic = options.maxAmountAtomic ?? DEFAULT_MAX_AMOUNT_ATOMIC;
    this.#network = options.network ?? ARC_X402_NETWORK;
    this.#asset = (options.asset ?? ARC_X402_USDC).toLowerCase();
    if (this.#maxAmountAtomic <= 0n) throw new Error('x402 maximum amount must be positive');
    if (this.#network !== ARC_X402_NETWORK || this.#asset !== ARC_X402_USDC) {
      throw new Error('Circle x402 client is restricted to Arc Testnet native USDC');
    }
  }

  async quote(url: string): Promise<CircleX402Quote> {
    return fetchQuote(this.#fetch, url, this.#maxAmountAtomic);
  }

  async payOnce<T = unknown>(input: {
    readonly businessIntentId: string;
    readonly url: string;
    readonly quote?: CircleX402Quote;
    readonly method?: 'GET' | 'POST' | 'PUT' | 'DELETE';
    readonly body?: unknown;
    readonly headers?: Record<string, string>;
  }): Promise<CircleX402PaymentResult<T>> {
    if (!input.businessIntentId.trim()) throw new Error('businessIntentId is required');
    const normalizedUrl = assertUrl(input.url);
    const fingerprint = `${normalizedUrl}:${input.method ?? 'GET'}`;
    const existing = this.#attempts.get(input.businessIntentId);
    if (existing) {
      if (existing.fingerprint !== fingerprint) {
        throw new Error('x402 Business Intent was reused for a different resource');
      }
      return (await existing.result) as CircleX402PaymentResult<T>;
    }

    // Quote discovery has no payment effect. Keep it outside the guarded
    // attempt so a preflight outage can be retried safely.
    const quote = input.quote ?? (await this.quote(normalizedUrl));
    if (quote.url !== normalizedUrl) throw new Error('x402 quote URL does not match the request');
    asRequirements(quote.requirements);
    if (BigInt(quote.requirements.amount) > this.#maxAmountAtomic) {
      throw new Error('x402 quote exceeds the configured maximum amount');
    }
    const raced = this.#attempts.get(input.businessIntentId);
    if (raced) {
      if (raced.fingerprint !== fingerprint) {
        throw new Error('x402 Business Intent was reused for a different resource');
      }
      return (await raced.result) as CircleX402PaymentResult<T>;
    }

    const result = this.#payOnce<T>(input, normalizedUrl, quote);
    this.#attempts.set(input.businessIntentId, {
      fingerprint,
      result: result as Promise<CircleX402PaymentResult<unknown>>,
    });
    return result;
  }

  async #payOnce<T>(
    input: {
      readonly businessIntentId: string;
      readonly url: string;
      readonly quote?: CircleX402Quote;
      readonly method?: 'GET' | 'POST' | 'PUT' | 'DELETE';
      readonly body?: unknown;
      readonly headers?: Record<string, string>;
    },
    normalizedUrl: string,
    quote: CircleX402Quote,
  ): Promise<CircleX402PaymentResult<T>> {
    const requirements = asRequirements(quote.requirements);
    if (BigInt(requirements.amount) > this.#maxAmountAtomic) {
      throw new Error('x402 quote exceeds the configured maximum amount');
    }
    const partial = await this.#scheme.createPaymentPayload(quote.x402Version, requirements);
    const payload: PaymentPayload = {
      ...partial,
      payload: partial.payload as unknown as Record<string, unknown>,
      resource: { url: quote.resourceUrl, description: '', mimeType: 'application/json' },
      accepted: requirements,
    };
    const paymentHeaders = this.#http.encodePaymentSignatureHeader(payload);

    let response: Response;
    try {
      response = await this.#fetch(normalizedUrl, {
        method: input.method ?? 'GET',
        redirect: 'error',
        headers: { ...input.headers, ...paymentHeaders },
        ...(input.body === undefined ? {} : { body: JSON.stringify(input.body) }),
      });
    } catch (cause) {
      throw new CircleX402AmbiguousError(
        input.businessIntentId,
        quote,
        `x402 paid request failed after signing: ${cause instanceof Error ? cause.message : 'unknown error'}`,
      );
    }

    let body: unknown;
    let settlement: SettleResponse | undefined;
    try {
      body = await responseBody(response);
      settlement = parseSettlement(response);
    } catch (cause) {
      throw new CircleX402AmbiguousError(
        input.businessIntentId,
        quote,
        `x402 paid response was malformed: ${cause instanceof Error ? cause.message : 'unknown error'}`,
      );
    }
    if (!response.ok || settlement?.success !== true) {
      throw new CircleX402AmbiguousError(
        input.businessIntentId,
        quote,
        `x402 paid request returned HTTP ${response.status} without confirmed settlement`,
      );
    }
    if (!TRANSACTION_HASH.test(settlement.transaction)) {
      throw new CircleX402AmbiguousError(
        input.businessIntentId,
        quote,
        'x402 settlement evidence did not include a valid transaction hash',
      );
    }
    if (settlement.network !== ARC_X402_NETWORK) {
      throw new CircleX402AmbiguousError(
        input.businessIntentId,
        quote,
        'x402 settlement evidence reported a different network',
      );
    }
    return {
      businessIntentId: input.businessIntentId,
      quote,
      data: body as T,
      settlement: {
        success: true,
        transaction: settlement.transaction as `0x${string}`,
        network: settlement.network,
        ...(settlement.payer ? { payer: settlement.payer } : {}),
        ...(settlement.amount ? { amountAtomic: settlement.amount } : {}),
      },
    };
  }
}
