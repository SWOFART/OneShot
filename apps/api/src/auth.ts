import { timingSafeEqual } from 'node:crypto';

export type AuthenticationDecision = 'AUTHORIZED' | 'UNAUTHORIZED' | 'FORBIDDEN';

export interface ServiceAuthenticator {
  authenticate(authorization: string | undefined): Promise<AuthenticationDecision>;
}

export function staticBearerAuthenticator(expectedToken: string): ServiceAuthenticator {
  if (expectedToken.length === 0) throw new Error('service bearer token must not be empty');
  const expected = Buffer.from(`Bearer ${expectedToken}`, 'utf8');
  return {
    async authenticate(authorization) {
      if (!authorization) return 'UNAUTHORIZED';
      const actual = Buffer.from(authorization, 'utf8');
      if (actual.length !== expected.length) return 'UNAUTHORIZED';
      return timingSafeEqual(actual, expected) ? 'AUTHORIZED' : 'FORBIDDEN';
    },
  };
}

export interface CredentialRoute {
  readonly matches: (authorization: string | undefined) => boolean;
  readonly authenticator: ServiceAuthenticator;
}

export function compositeAuthenticator(routes: readonly CredentialRoute[]): ServiceAuthenticator {
  return {
    async authenticate(authorization) {
      if (!authorization) return 'UNAUTHORIZED';
      let sawForbidden = false;
      for (const route of routes) {
        if (!route.matches(authorization)) continue;
        const decision = await route.authenticator.authenticate(authorization);
        if (decision === 'AUTHORIZED') return 'AUTHORIZED';
        if (decision === 'FORBIDDEN') sawForbidden = true;
      }
      return sawForbidden ? 'FORBIDDEN' : 'UNAUTHORIZED';
    },
  };
}
