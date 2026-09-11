export const ARC_TESTNET_NETWORK = 'eip155:5042002';
export const DEFAULT_FACILITATOR_URL = 'https://gateway-api-testnet.circle.com';

const EVM_ADDRESS = /^0x[0-9a-fA-F]{40}$/u;

export interface SellerRuntimeConfig {
  readonly host: string;
  readonly port: number;
  readonly sellerAddress: string;
  readonly facilitatorUrl: string;
}

function required(environment: NodeJS.ProcessEnv, name: string): string {
  const value = environment[name]?.trim();
  if (!value) throw new Error(`Missing required environment variable: ${name}`);
  return value;
}

function integer(
  environment: NodeJS.ProcessEnv,
  name: string,
  fallback: number,
  minimum: number,
  maximum: number,
): number {
  const raw = environment[name]?.trim();
  if (!raw) return fallback;
  const value = Number(raw);
  if (!Number.isSafeInteger(value) || value < minimum || value > maximum) {
    throw new Error(`Invalid environment variable: ${name}`);
  }
  return value;
}

function facilitatorUrl(environment: NodeJS.ProcessEnv): string {
  const raw = environment.ONESHOT_X402_FACILITATOR_URL?.trim() || DEFAULT_FACILITATOR_URL;
  const url = new URL(raw);
  const normalized = url.toString().replace(/\/$/u, '');
  if (
    url.protocol !== 'https:' ||
    url.username ||
    url.password ||
    url.search ||
    url.hash ||
    normalized !== DEFAULT_FACILITATOR_URL
  ) {
    throw new Error(
      `ONESHOT_X402_FACILITATOR_URL must be the Circle Arc Testnet facilitator: ${DEFAULT_FACILITATOR_URL}`,
    );
  }
  return normalized;
}

export function loadSellerRuntimeConfig(
  environment: NodeJS.ProcessEnv = process.env,
): SellerRuntimeConfig {
  const sellerAddress = required(environment, 'ONESHOT_X402_SELLER_ADDRESS');
  if (!EVM_ADDRESS.test(sellerAddress)) {
    throw new Error('ONESHOT_X402_SELLER_ADDRESS must be a 20-byte EVM address');
  }

  return {
    host: environment.HOST?.trim() || '0.0.0.0',
    port: integer(
      environment,
      'ONESHOT_X402_SELLER_PORT',
      integer(environment, 'PORT', 8080, 1, 65_535),
      1,
      65_535,
    ),
    sellerAddress,
    facilitatorUrl: facilitatorUrl(environment),
  };
}
