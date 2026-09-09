import { describe, expect, it } from 'vitest';
import type { AuthenticationDecision, ServiceAuthenticator } from '../src/auth.js';
import { compositeAuthenticator, staticBearerAuthenticator } from '../src/auth.js';
import { isJwtCredential } from '../src/privy-auth.js';

function fixed(decision: AuthenticationDecision, calls: string[] = []): ServiceAuthenticator {
  return {
    async authenticate() {
      calls.push(decision);
      return decision;
    },
  };
}

describe('composite authenticator', () => {
  it('returns AUTHORIZED when any eligible authenticator authorizes', async () => {
    const auth = compositeAuthenticator([
      { matches: () => true, authenticator: fixed('UNAUTHORIZED') },
      { matches: () => true, authenticator: fixed('AUTHORIZED') },
    ]);
    expect(await auth.authenticate('Bearer anything')).toBe('AUTHORIZED');
  });

  it('prefers FORBIDDEN over UNAUTHORIZED when nothing authorizes', async () => {
    const auth = compositeAuthenticator([
      { matches: () => true, authenticator: fixed('UNAUTHORIZED') },
      { matches: () => true, authenticator: fixed('FORBIDDEN') },
    ]);
    expect(await auth.authenticate('Bearer anything')).toBe('FORBIDDEN');
  });

  it('returns UNAUTHORIZED when no route matches', async () => {
    const auth = compositeAuthenticator([
      { matches: () => false, authenticator: fixed('AUTHORIZED') },
    ]);
    expect(await auth.authenticate('Bearer anything')).toBe('UNAUTHORIZED');
  });

  it('returns UNAUTHORIZED when the header is absent', async () => {
    const auth = compositeAuthenticator([
      { matches: () => true, authenticator: fixed('AUTHORIZED') },
    ]);
    expect(await auth.authenticate(undefined)).toBe('UNAUTHORIZED');
  });

  it('never shows an opaque service token to the JWT route', async () => {
    const jwtCalls: string[] = [];
    const bearerCalls: string[] = [];
    const auth = compositeAuthenticator([
      { matches: isJwtCredential, authenticator: fixed('FORBIDDEN', jwtCalls) },
      {
        matches: (authorization) => !isJwtCredential(authorization),
        authenticator: fixed('AUTHORIZED', bearerCalls),
      },
    ]);
    expect(await auth.authenticate('Bearer opaque-service-token')).toBe('AUTHORIZED');
    expect(jwtCalls).toEqual([]);
    expect(bearerCalls).toEqual(['AUTHORIZED']);
  });

  it('never shows a JWT to the constant-time bearer route', async () => {
    const bearerCalls: string[] = [];
    const auth = compositeAuthenticator([
      { matches: isJwtCredential, authenticator: fixed('FORBIDDEN') },
      {
        matches: (authorization) => !isJwtCredential(authorization),
        authenticator: fixed('AUTHORIZED', bearerCalls),
      },
    ]);
    expect(await auth.authenticate('Bearer aaa.bbb.ccc')).toBe('FORBIDDEN');
    expect(bearerCalls).toEqual([]);
  });

  it('leaves the existing static bearer behavior unchanged', async () => {
    const bearer = staticBearerAuthenticator('service-token');
    expect(await bearer.authenticate('Bearer service-token')).toBe('AUTHORIZED');
    expect(await bearer.authenticate('Bearer wrong-token-x')).toBe('FORBIDDEN');
    expect(await bearer.authenticate('Bearer short')).toBe('UNAUTHORIZED');
    expect(await bearer.authenticate(undefined)).toBe('UNAUTHORIZED');
  });
});
