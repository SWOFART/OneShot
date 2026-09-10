export interface Env {
  ASSETS: { fetch(request: Request): Promise<Response> };
  API_BACKEND_URL?: string;
}

const DEFAULT_BACKEND_URL = 'https://oneshot-api-775560462825.europe-west1.run.app';

const CORS_HEADERS: Record<string, string> = {
  'access-control-allow-origin': '*',
  'access-control-allow-methods': 'GET, POST, OPTIONS',
  'access-control-allow-headers': 'authorization, content-type, x-correlation-id',
};

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url);

    // Forward API and health check requests to Google Cloud Run
    if (url.pathname.startsWith('/v1/') || url.pathname.startsWith('/health/')) {
      if (request.method === 'OPTIONS') {
        return new Response(null, {
          status: 204,
          headers: CORS_HEADERS,
        });
      }

      const backendBase = env.API_BACKEND_URL || DEFAULT_BACKEND_URL;
      const targetUrl = new URL(url.pathname + url.search, backendBase);

      const headers = new Headers(request.headers);
      headers.set('host', targetUrl.host);

      try {
        const body =
          request.method !== 'GET' && request.method !== 'HEAD'
            ? await request.arrayBuffer()
            : undefined;

        const proxyRequest = new Request(targetUrl.toString(), {
          method: request.method,
          headers,
          body,
          redirect: 'follow',
        });

        const response = await fetch(proxyRequest);
        const responseHeaders = new Headers(response.headers);
        for (const [key, value] of Object.entries(CORS_HEADERS)) {
          responseHeaders.set(key, value);
        }

        return new Response(response.body, {
          status: response.status,
          statusText: response.statusText,
          headers: responseHeaders,
        });
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
