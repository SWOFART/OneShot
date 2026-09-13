import type { OperatorSession } from '../../src/auth/session.js';

export function fakeSession(overrides: Partial<OperatorSession> = {}): OperatorSession {
  return {
    status: 'SIGNED_OUT',
    subject: null,
    accessToken: null,
    login() {},
    logout() {},
    ...overrides,
  };
}

export function signedInSession(
  subject = 'did:privy:test-operator',
  accessToken = 'header.payload.signature',
): OperatorSession {
  return fakeSession({ status: 'SIGNED_IN', subject, accessToken });
}
