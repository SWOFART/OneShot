import type { PaidApiQuote, SubmitPaidApiUserWalletRequest } from '@oneshot/contracts';

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

export interface UserWalletSession {
  readonly address: string | null;
  connect(): Promise<string | null>;
  sendTransfer(payment: {
    readonly chain_id: 5042002;
    readonly token_contract: string;
    readonly payer_wallet: string;
    readonly recipient: string;
    readonly amount_atomic: string;
  }): Promise<string>;
  signX402Payment(quote: PaidApiQuote): Promise<SubmitPaidApiUserWalletRequest['payment_payload']>;
}

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
