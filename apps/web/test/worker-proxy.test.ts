import { describe, expect, it, vi } from 'vitest';
import worker, { type Env } from '../worker.js';

function assets(): Env['ASSETS'] {
  return {
    fetch: vi.fn(async () => new Response('frontend asset', { status: 200 })),
  };
}

describe('Cloudflare API proxy', () => {
  it('keeps the existing API health proxy working', async () => {
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

  it('proxies the MCP endpoint with its bearer and protocol headers', async () => {
    const upstream = vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response('{"jsonrpc":"2.0","id":1,"result":{"tools":[]}}', {
        status: 200,
        headers: { 'content-type': 'application/json' },
      }),
    );
    const response = await worker.fetch(
      new Request('https://oneshot.kapustazh.dev/mcp', {
        method: 'POST',
        headers: {
          authorization: 'Bearer mcp-test-token',
          'content-type': 'application/json',
          'mcp-protocol-version': '2025-06-18',
        },
        body: '{"jsonrpc":"2.0","id":1,"method":"tools/list"}',
      }),
      { ASSETS: assets(), API_BACKEND_URL: 'https://api.example.test' },
    );

    expect(response.status).toBe(200);
    const [request] = upstream.mock.calls[0] ?? [];
    const proxied = request as Request;
    expect(proxied.url).toBe('https://api.example.test/mcp');
    expect(proxied.headers.get('authorization')).toBe('Bearer mcp-test-token');
    expect(proxied.headers.get('mcp-protocol-version')).toBe('2025-06-18');
    upstream.mockRestore();
  });
});
