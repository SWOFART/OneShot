import { describe, expect, it, vi } from 'vitest';
import worker, { type Env } from '../worker.js';

function assets(): Env['ASSETS'] {
  return {
    fetch: vi.fn(async () => new Response('frontend asset', { status: 200 })),
  };
}

describe('Cloudflare public seller proxy', () => {
  it('returns a clear configuration response instead of serving the SPA', async () => {
    const response = await worker.fetch(
      new Request('https://oneshot.kapustazh.dev/api/premium/dataset'),
      { ASSETS: assets() },
    );

    expect(response.status).toBe(503);
    await expect(response.json()).resolves.toEqual({
      code: 'SELLER_NOT_READY',
      message: 'Circle seller is not configured. Set SELLER_BACKEND_URL on the Cloudflare Worker.',
    });
  });

  it('proxies the x402 route and does not forward OneShot credentials', async () => {
    const upstream = vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response('{}', {
        status: 402,
        headers: { 'PAYMENT-REQUIRED': 'test-payment-requirement' },
      }),
    );
    const env: Env = {
      ASSETS: assets(),
      SELLER_BACKEND_URL: 'https://seller.example.test',
    };
    const response = await worker.fetch(
      new Request('https://oneshot.kapustazh.dev/api/premium/dataset?demo=1', {
        headers: {
          authorization: 'Bearer do-not-forward',
          cookie: 'session=do-not-forward',
          'payment-signature': 'signed-payment',
        },
      }),
      env,
    );

    expect(response.status).toBe(402);
    expect(response.headers.get('payment-required')).toBe('test-payment-requirement');
    expect(response.headers.get('access-control-expose-headers')).toContain('PAYMENT-REQUIRED');
    expect(upstream).toHaveBeenCalledOnce();
    const [request] = upstream.mock.calls[0] ?? [];
    expect(request).toBeInstanceOf(Request);
    const proxied = request as Request;
    expect(proxied.url).toBe('https://seller.example.test/api/premium/dataset?demo=1');
    expect(proxied.redirect).toBe('error');
    expect(proxied.headers.get('payment-signature')).toBe('signed-payment');
    expect(proxied.headers.get('authorization')).toBeNull();
    expect(proxied.headers.get('cookie')).toBeNull();
    upstream.mockRestore();
  });

  it('keeps the existing API proxy path separate from seller routing', async () => {
    const upstream = vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response('{"status":"ok"}', {
        status: 200,
        headers: { 'content-type': 'application/json' },
      }),
    );
    const response = await worker.fetch(new Request('https://oneshot.kapustazh.dev/health/live'), {
      ASSETS: assets(),
      API_BACKEND_URL: 'https://api.example.test',
    });

    expect(response.status).toBe(200);
    expect(upstream).toHaveBeenCalledOnce();
    const [request] = upstream.mock.calls[0] ?? [];
    expect((request as Request).url).toBe('https://api.example.test/health/live');
    upstream.mockRestore();
  });
});
