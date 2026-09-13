import { timingSafeEqual } from 'node:crypto';

export type AuthenticationDecision = 'AUTHORIZED' | 'UNAUTHORIZED' | 'FORBIDDEN';

export type AuthenticationResult = {
  readonly decision: AuthenticationDecision;
  readonly workspaceId?: string;
};

export interface ServiceAuthenticator {
  authenticate(authorization: string | undefined): Promise<AuthenticationResult>;
}

export interface TokenWorkspaceLookup {
  workspaceForToken(token: string): Promise<string | undefined>;
}

export function workspaceBearerAuthenticator(lookup: TokenWorkspaceLookup): ServiceAuthenticator {
  return {
    async authenticate(authorization) {
      if (!authorization?.startsWith('Bearer ')) return { decision: 'UNAUTHORIZED' };
      const token = authorization.slice('Bearer '.length);
      const workspaceId = await lookup.workspaceForToken(token);
      return workspaceId ? { decision: 'AUTHORIZED', workspaceId } : { decision: 'UNAUTHORIZED' };
    },
  };
}

export function staticBearerAuthenticator(expectedToken: string): ServiceAuthenticator {
  if (expectedToken.length === 0) throw new Error('service bearer token must not be empty');
  const expected = Buffer.from(`Bearer ${expectedToken}`, 'utf8');
  return {
    async authenticate(authorization) {
      if (!authorization) return { decision: 'UNAUTHORIZED' };
      const actual = Buffer.from(authorization, 'utf8');
      if (actual.length !== expected.length) return { decision: 'UNAUTHORIZED' };
      return {
        decision: timingSafeEqual(actual, expected) ? 'AUTHORIZED' : 'FORBIDDEN',
      };
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
      if (!authorization) return { decision: 'UNAUTHORIZED' };
      let sawForbidden = false;
      for (const route of routes) {
        if (!route.matches(authorization)) continue;
        const decision = await route.authenticator.authenticate(authorization);
        if (decision.decision === 'AUTHORIZED') return decision;
        if (decision.decision === 'FORBIDDEN') sawForbidden = true;
      }
      return { decision: sawForbidden ? 'FORBIDDEN' : 'UNAUTHORIZED' };
    },
  };
}
