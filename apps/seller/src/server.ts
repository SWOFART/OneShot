import { createServer, type Server } from 'node:http';
import { createSellerRequestHandler } from './app.js';
import { loadSellerRuntimeConfig, type SellerRuntimeConfig } from './config.js';

export interface SellerRuntime {
  readonly address: string;
  close(): Promise<void>;
}

export function createSellerServer(config: SellerRuntimeConfig): Server {
  const handler = createSellerRequestHandler(config);
  return createServer((request, response) => {
    void handler(request, response);
  });
}

export async function startSellerRuntime(config: SellerRuntimeConfig): Promise<SellerRuntime> {
  const server = createSellerServer(config);
  await new Promise<void>((resolve, reject) => {
    server.once('error', reject);
    server.listen({ host: config.host, port: config.port }, resolve);
  });
  const address = server.address();
  const port = typeof address === 'object' && address ? address.port : config.port;
  return {
    address: `http://${config.host}:${port}`,
    close: () =>
      new Promise<void>((resolve, reject) => {
        server.close((error) => (error ? reject(error) : resolve()));
      }),
  };
}

export function startSellerFromEnvironment(
  environment: NodeJS.ProcessEnv = process.env,
): Promise<SellerRuntime> {
  return startSellerRuntime(loadSellerRuntimeConfig(environment));
}
