import { describe, expect, it } from 'vitest';
import { selectCredential, unconfiguredOperatorSession } from '../src/auth/session.js';
import { fakeSession, signedInSession } from './support/fake-session.js';

describe('selectCredential', () => {
  it('prefers the Privy access token over a typed machine token', () => {
    expect(selectCredential(signedInSession('did:privy:x', 'aaa.bbb.ccc'), 'machine')).toBe(
      'aaa.bbb.ccc',
    );
  });

  it('falls back to the machine token when there is no session token', () => {
    expect(selectCredential(fakeSession(), 'machine-token')).toBe('machine-token');
  });

  it('trims a machine token and treats whitespace as absent', () => {
    expect(selectCredential(fakeSession(), '  machine-token  ')).toBe('machine-token');
    expect(selectCredential(fakeSession(), '   ')).toBeNull();
  });

  it('returns null when neither credential exists', () => {
    expect(selectCredential(unconfiguredOperatorSession(), '')).toBeNull();
  });
});
