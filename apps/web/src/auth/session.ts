export type OperatorSessionStatus = 'UNCONFIGURED' | 'LOADING' | 'SIGNED_OUT' | 'SIGNED_IN';

/**
 * The console's view of operator identity. The access token is held as a plain
 * value so the three API clients keep their synchronous `getAuthToken` port;
 * the adapter refreshes it well inside the token's one-hour lifetime.
 */
export interface OperatorSession {
  readonly status: OperatorSessionStatus;
  readonly subject: string | null;
  readonly accessToken: string | null;
  login(): void;
  logout(): void;
}

export type UseOperatorSession = () => OperatorSession;

export const unconfiguredOperatorSession: UseOperatorSession = () => ({
  status: 'UNCONFIGURED',
  subject: null,
  accessToken: null,
  login() {},
  logout() {},
});

/**
 * A Privy session always wins over a typed machine token, so an operator who is
 * signed in cannot accidentally act under a shared service credential.
 */
export function selectCredential(session: OperatorSession, machineToken: string): string | null {
  return session.accessToken ?? (machineToken.trim() || null);
}
