import { beforeAll, describe, expect, it } from 'vitest';
import { exportSPKI, generateKeyPair, SignJWT } from 'jose';

type GeneratedPrivateKey = Awaited<ReturnType<typeof generateKeyPair>>['privateKey'];
import type { ApiRuntimeConfig } from '../src/config.js';
import { buildApiAuthenticator } from '../src/runtime.js';

const APP_ID = 'cmtqbf5zo013w0cky3r0jqjca';
const OPERATOR = 'did:privy:allowed-operator';

let privateKey: GeneratedPrivateKey;
let verificationKey: string;

beforeAll(async () => {
  const pair = await generateKeyPair('ES256', { extractable: true });
  privateKey = pair.privateKey;
  verificationKey = await exportSPKI(pair.publicKey);
});

function config(privyEnabled: boolean): ApiRuntimeConfig {
  return {
    host: '0.0.0.0',
    port: 3000,
    serviceBearerToken: 'service-token-1234',
    database: { connectionString: 'postgresql://localhost/oneshot' },
    submissionsDisabled: false,
    rateLimit: { maxRequests: 60, windowMs: 60_000 },
    ...(privyEnabled
      ? { privyAuth: { appId: APP_ID, verificationKey, allowedSubjects: [OPERATOR] } }
      : {}),
  };
}

async function token(subject: string): Promise<string> {
  return new SignJWT({})
    .setProtectedHeader({ alg: 'ES256' })
    .setSubject(subject)
    .setIssuer('privy.io')
    .setAudience(APP_ID)
    .setIssuedAt()
    .setExpirationTime('1h')
    .sign(privateKey);
}

describe('API authenticator composition', () => {
  it('accepts only the service bearer when Privy is disabled', async () => {
    const auth = buildApiAuthenticator(config(false));
    expect(await auth.authenticate('Bearer service-token-1234')).toBe('AUTHORIZED');
    expect(await auth.authenticate(`Bearer ${await token(OPERATOR)}`)).toBe('UNAUTHORIZED');
  });

  it('accepts both credential classes when Privy is enabled', async () => {
    const auth = buildApiAuthenticator(config(true));
    expect(await auth.authenticate('Bearer service-token-1234')).toBe('AUTHORIZED');
    expect(await auth.authenticate(`Bearer ${await token(OPERATOR)}`)).toBe('AUTHORIZED');
  });

  it('logs the rejected subject without any token material', async () => {
    const lines: string[] = [];
    const auth = buildApiAuthenticator(config(true), (line) => lines.push(line));
    const outsiderToken = await token('did:privy:outsider');
    expect(await auth.authenticate(`Bearer ${outsiderToken}`)).toBe('FORBIDDEN');
    expect(lines).toHaveLength(1);
    expect(lines[0]).toContain('did:privy:outsider');
    expect(lines[0]).not.toContain(outsiderToken);
  });
});
