export interface Env {
  ASSETS: { fetch(request: Request): Promise<Response> };
  API_BACKEND_URL?: string;
}

const DEFAULT_BACKEND_URL = 'https://oneshot-api-775560462825.europe-west1.run.app';

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url);

    // Forward API and health check requests to Google Cloud Run
    if (url.pathname.startsWith('/v1/') || url.pathname.startsWith('/health/')) {
      const backendBase = env.API_BACKEND_URL || DEFAULT_BACKEND_URL;
      const targetUrl = new URL(url.pathname + url.search, backendBase);

      const headers = new Headers(request.headers);
      headers.set('host', targetUrl.host);

      const proxyRequest = new Request(targetUrl.toString(), {
        method: request.method,
        headers,
        body: request.method !== 'GET' && request.method !== 'HEAD' ? request.body : undefined,
        redirect: 'follow',
      });

      return fetch(proxyRequest);
    }

    // Serve static frontend assets for all other paths
    return env.ASSETS.fetch(request);
  },
};
