import { generateKeyPairSync } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import { loadApiRuntimeConfig } from '../src/config.js';

describe('API runtime configuration', () => {
  const testKey = generateKeyPairSync('ec', {
    namedCurve: 'prime256v1',
    publicKeyEncoding: { type: 'spki', format: 'pem' },
    privateKeyEncoding: { type: 'pkcs8', format: 'pem' },
  }).publicKey;

  const base = {
    DATABASE_URL: 'postgresql://oneshot:secret@localhost:5432/oneshot',
    SERVICE_BEARER_TOKEN: 'service-token',
  };

  it('uses DATABASE_URL for local and managed TCP PostgreSQL', () => {
    const config = loadApiRuntimeConfig({
      DATABASE_URL: 'postgresql://oneshot:secret@localhost:5432/oneshot',
      SERVICE_BEARER_TOKEN: 'service-token',
      PORT: '8080',
    });

    expect(config.port).toBe(8080);
    expect(config.database).toEqual({
      connectionString: 'postgresql://oneshot:secret@localhost:5432/oneshot',
      max: 10,
    });
  });

  it('builds the Cloud SQL Unix socket path from the instance connection name', () => {
    const config = loadApiRuntimeConfig({
      INSTANCE_CONNECTION_NAME: 'project:region:oneshot-postgres',
      DB_USER: 'oneshot',
      DB_PASS: 'secret',
      DB_NAME: 'oneshot',
      SERVICE_BEARER_TOKEN: 'service-token',
    });

    expect(config.database).toEqual({
      host: '/cloudsql/project:region:oneshot-postgres',
      user: 'oneshot',
      password: 'secret',
      database: 'oneshot',
      max: 10,
    });
  });

  it('fails closed when runtime secrets or database coordinates are absent', () => {
    expect(() => loadApiRuntimeConfig({ DATABASE_URL: 'postgresql://localhost/oneshot' })).toThrow(
      'SERVICE_BEARER_TOKEN',
    );
    expect(() => loadApiRuntimeConfig({ SERVICE_BEARER_TOKEN: 'service-token' })).toThrow(
      'Database configuration requires',
    );
  });

  it('leaves Privy login disabled when no Privy variable is set', () => {
    const config = loadApiRuntimeConfig({ ...base });
    expect(config.privyAuth).toBeUndefined();
    expect(config.serviceBearerToken).toBe('service-token');
  });

  it('loads a complete Privy configuration', () => {
    const config = loadApiRuntimeConfig({
      ...base,
      PRIVY_AUTH_APP_ID: 'cmtqbf5zo013w0cky3r0jqjca',
      PRIVY_AUTH_VERIFICATION_KEY: testKey,
      PRIVY_AUTH_ALLOWED_SUBJECTS: 'did:privy:one, did:privy:two ,did:privy:one',
    });
    expect(config.privyAuth?.appId).toBe('cmtqbf5zo013w0cky3r0jqjca');
    expect(config.privyAuth?.allowedSubjects).toEqual(['did:privy:one', 'did:privy:two']);
    expect(config.privyAuth?.verificationKey).toContain('BEGIN PUBLIC KEY');
  });

  it('accepts a verification key carrying escaped newlines', () => {
    const config = loadApiRuntimeConfig({
      ...base,
      PRIVY_AUTH_APP_ID: 'app',
      PRIVY_AUTH_VERIFICATION_KEY: testKey.trimEnd().replace(/\n/g, '\\n'),
      PRIVY_AUTH_ALLOWED_SUBJECTS: 'did:privy:one',
    });
    expect(config.privyAuth?.verificationKey.split('\n').length).toBeGreaterThan(2);
  });

  it('refuses to start on partial Privy configuration', () => {
    expect(() => loadApiRuntimeConfig({ ...base, PRIVY_AUTH_APP_ID: 'app' })).toThrow(
      'PRIVY_AUTH_VERIFICATION_KEY',
    );
    expect(() =>
      loadApiRuntimeConfig({
        ...base,
        PRIVY_AUTH_APP_ID: 'app',
        PRIVY_AUTH_VERIFICATION_KEY: testKey,
      }),
    ).toThrow('PRIVY_AUTH_ALLOWED_SUBJECTS');
    expect(() =>
      loadApiRuntimeConfig({
        ...base,
        PRIVY_AUTH_APP_ID: 'app',
        PRIVY_AUTH_VERIFICATION_KEY: testKey,
        PRIVY_AUTH_ALLOWED_SUBJECTS: '   ',
      }),
    ).toThrow('PRIVY_AUTH_ALLOWED_SUBJECTS');
  });

  it('rejects an allowlist entry that is not a Privy DID', () => {
    expect(() =>
      loadApiRuntimeConfig({
        ...base,
        PRIVY_AUTH_APP_ID: 'app',
        PRIVY_AUTH_VERIFICATION_KEY: testKey,
        PRIVY_AUTH_ALLOWED_SUBJECTS: 'operator@example.com',
      }),
    ).toThrow('did:privy:');
  });

  it('rejects a verification key that is not an EC P-256 public key', () => {
    const rsa = generateKeyPairSync('rsa', {
      modulusLength: 2048,
      publicKeyEncoding: { type: 'spki', format: 'pem' },
      privateKeyEncoding: { type: 'pkcs8', format: 'pem' },
    }).publicKey;
    expect(() =>
      loadApiRuntimeConfig({
        ...base,
        PRIVY_AUTH_APP_ID: 'app',
        PRIVY_AUTH_VERIFICATION_KEY: rsa,
        PRIVY_AUTH_ALLOWED_SUBJECTS: 'did:privy:one',
      }),
    ).toThrow('P-256');
    expect(() =>
      loadApiRuntimeConfig({
        ...base,
        PRIVY_AUTH_APP_ID: 'app',
        PRIVY_AUTH_VERIFICATION_KEY: 'not a key at all',
        PRIVY_AUTH_ALLOWED_SUBJECTS: 'did:privy:one',
      }),
    ).toThrow();
  });
});
