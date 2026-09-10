import { importSPKI, jwtVerify } from 'jose';
import type { ServiceAuthenticator } from './auth.js';

export const PRIVY_ISSUER = 'privy.io';
export const PRIVY_DID_PREFIX = 'did:privy:';
export const PRIVY_ALLOW_ALL = '*';

const BEARER_PREFIX = 'Bearer ';
const BASE64URL_SEGMENT = /^[A-Za-z0-9_-]+$/;

export interface PrivyAccessTokenAuthenticatorConfig {
  readonly appId: string;
  readonly verificationKey: string;
  readonly allowedSubjects: readonly string[];
  readonly clockToleranceSeconds?: number;
  readonly onForbiddenSubject?: (subject: string) => void;
}

export function looksLikeJwt(token: string): boolean {
  const parts = token.split('.');
  return parts.length === 3 && parts.every((part) => BASE64URL_SEGMENT.test(part));
}

function bearerToken(authorization: string | undefined): string | null {
  if (!authorization?.startsWith(BEARER_PREFIX)) return null;
  const token = authorization.slice(BEARER_PREFIX.length);
  return token.length > 0 ? token : null;
}

export function isJwtCredential(authorization: string | undefined): boolean {
  const token = bearerToken(authorization);
  return token !== null && looksLikeJwt(token);
}

export function createPrivyAccessTokenAuthenticator(
  config: PrivyAccessTokenAuthenticatorConfig,
): ServiceAuthenticator {
  if (config.appId.trim().length === 0) throw new Error('Privy app id must not be empty');
  if (config.allowedSubjects.length === 0) {
    throw new Error('Privy operator allowlist must not be empty');
  }
  const allowAll = config.allowedSubjects.includes(PRIVY_ALLOW_ALL);
  const allowed = allowAll ? null : new Set(config.allowedSubjects);
  const clockTolerance = config.clockToleranceSeconds ?? 60;
  const keyPromise = importSPKI(config.verificationKey, 'ES256');
  // An unusable key must not become an unhandled rejection before the first request.
  void keyPromise.catch(() => undefined);

  return {
    async authenticate(authorization) {
      const token = bearerToken(authorization);
      if (token === null || !looksLikeJwt(token)) return 'UNAUTHORIZED';

      let subject: string | undefined;
      try {
        const { payload } = await jwtVerify(token, await keyPromise, {
          algorithms: ['ES256'],
          issuer: PRIVY_ISSUER,
          audience: config.appId,
          clockTolerance,
        });
        subject = payload.sub;
      } catch {
        return 'UNAUTHORIZED';
      }

      if (subject === undefined || subject.length === 0 || !subject.startsWith(PRIVY_DID_PREFIX)) {
        return 'UNAUTHORIZED';
      }
      if (allowed !== null && !allowed.has(subject)) {
        config.onForbiddenSubject?.(subject);
        return 'FORBIDDEN';
      }
      return 'AUTHORIZED';
    },
  };
}
