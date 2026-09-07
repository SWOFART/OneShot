import { describe, expect, it } from 'vitest';
import { loadApiRuntimeConfig } from '../src/config.js';

describe('API runtime configuration', () => {
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
});
