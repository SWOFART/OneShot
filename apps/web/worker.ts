export interface Env {
  ASSETS: { fetch(request: Request): Promise<Response> };
  API_BACKEND_URL?: string;
  SELLER_BACKEND_URL?: string;
}

const DEFAULT_BACKEND_URL = 'https://oneshot-api-775560462825.europe-west1.run.app';

const CORS_HEADERS: Record<string, string> = {
  'access-control-allow-origin': '*',
  'access-control-allow-methods': 'GET, POST, OPTIONS',
  'access-control-allow-headers':
    'authorization, content-type, payment-signature, x-correlation-id',
  'access-control-expose-headers': 'PAYMENT-REQUIRED, PAYMENT-RESPONSE, x-correlation-id',
};

const SELLER_PATH_PREFIX = '/api/premium/';

async function proxy(
  request: Request,
  targetUrl: URL,
  options: { readonly stripCredentials: boolean; readonly redirect?: RequestRedirect },
): Promise<Response> {
  const headers = new Headers(request.headers);
  headers.set('host', targetUrl.host);
  if (options.stripCredentials) {
    headers.delete('authorization');
    headers.delete('cookie');
  }

  const body =
    request.method !== 'GET' && request.method !== 'HEAD' ? await request.arrayBuffer() : undefined;
  const proxyRequest = new Request(targetUrl.toString(), {
    method: request.method,
    headers,
    body,
    redirect: options.redirect ?? 'follow',
  });
  const response = await fetch(proxyRequest);
  const responseHeaders = new Headers(response.headers);
  for (const [key, value] of Object.entries(CORS_HEADERS)) responseHeaders.set(key, value);
  return new Response(response.body, {
    status: response.status,
    statusText: response.statusText,
    headers: responseHeaders,
  });
}

function unavailable(message: string, status = 503): Response {
  return new Response(JSON.stringify({ code: 'SELLER_NOT_READY', message }), {
    status,
    headers: { 'content-type': 'application/json', ...CORS_HEADERS },
  });
}

function sellerBackendUrl(value: string): URL {
  const url = new URL(value);
  if (url.protocol !== 'https:' || url.username || url.password || url.search || url.hash) {
    throw new Error('SELLER_BACKEND_URL must be a credential-free HTTPS URL');
  }
  return url;
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url);

    // Forward the public x402 resource to the separately deployed seller.
    if (url.pathname.startsWith(SELLER_PATH_PREFIX)) {
      if (request.method === 'OPTIONS') {
        return new Response(null, {
          status: 204,
          headers: CORS_HEADERS,
        });
      }
      if (!env.SELLER_BACKEND_URL) {
        return unavailable(
          'Circle seller is not configured. Set SELLER_BACKEND_URL on the Cloudflare Worker.',
        );
      }
      try {
        const targetUrl = new URL(
          url.pathname + url.search,
          sellerBackendUrl(env.SELLER_BACKEND_URL),
        );
        return await proxy(request, targetUrl, { stripCredentials: true, redirect: 'manual' });
      } catch {
        return unavailable('Circle seller backend is unavailable', 502);
      }
    }

    // Forward API and health check requests to Google Cloud Run.
    if (url.pathname.startsWith('/v1/') || url.pathname.startsWith('/health/')) {
      if (request.method === 'OPTIONS') {
        return new Response(null, {
          status: 204,
          headers: CORS_HEADERS,
        });
      }

      const backendBase = env.API_BACKEND_URL || DEFAULT_BACKEND_URL;
      const targetUrl = new URL(url.pathname + url.search, backendBase);

      try {
        return await proxy(request, targetUrl, { stripCredentials: false });
      } catch (error) {
        const message = error instanceof Error ? error.message : 'Backend proxy error';
        return new Response(JSON.stringify({ code: 'BACKEND_UNAVAILABLE', message }), {
          status: 502,
          headers: {
            'content-type': 'application/json',
            ...CORS_HEADERS,
          },
        });
      }
    }

    // Serve static frontend assets for all other paths
    return env.ASSETS.fetch(request);
  },
};
