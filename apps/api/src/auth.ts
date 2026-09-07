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
