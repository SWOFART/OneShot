import { PrivyProvider, useLoginWithSiwe, usePrivy } from '@privy-io/react-auth';
import { useCallback, useEffect, useState, type ReactNode } from 'react';
import { getAddress } from 'viem';

import type { DetectedWallet } from './eip6963.js';
import type { OperatorSession, OperatorSessionStatus } from './session.js';

const REFRESH_INTERVAL_MS = 5 * 60 * 1000;
const ARC_TESTNET: `eip155:${number}` = 'eip155:5042002';

/**
 * Generous on purpose: both calls this guards (`eth_requestAccounts` and
 * `personal_sign`) pop the wallet's own UI, and the operator is the one
 * reading it — a connection prompt or a SIWE message to review, then a click
 * to approve. Two minutes is long enough for a slow but honest human and
 * still short enough that a provider that will never answer does not strand
 * `WalletPicker` in its busy state indefinitely. Exported so the timeout test
 * can advance fake timers by an exact, documented amount rather than a magic
 * number.
 */
export const WALLET_REQUEST_TIMEOUT_MS = 120_000;

/**
 * Races a wallet RPC call against a timeout so an extension that never
 * resolves (crashed, backgrounded, or simply broken) rejects instead of
 * hanging forever. The timeout error carries a fixed, generic message only —
 * no address, message, or signature — matching the same no-wallet-data
 * contract `WalletPicker` already enforces for every thrown error.
 */
function withWalletTimeout<T>(promise: Promise<T>, ms = WALLET_REQUEST_TIMEOUT_MS): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const timer = setTimeout(() => {
      reject(new Error('The wallet did not respond in time.'));
    }, ms);
    promise.then(
      (value) => {
        clearTimeout(timer);
        resolve(value);
      },
      (error: unknown) => {
        clearTimeout(timer);
        reject(error);
      },
    );
  });
}

export function PrivyOperatorProvider(props: {
  readonly appId: string;
  readonly children: ReactNode;
}) {
  return (
    <PrivyProvider
      appId={props.appId}
      config={{
        loginMethods: ['email', 'wallet'],
        embeddedWallets: { ethereum: { createOnLogin: 'off' } },
        appearance: {
          theme: '#0a0a0a',
          accentColor: '#00dc5f',
          walletList: ['detected_ethereum_wallets', 'wallet_connect'],
        },
      }}
    >
      {props.children}
    </PrivyProvider>
  );
}

export function usePrivyOperatorSession(): OperatorSession {
  const { ready, authenticated, user, login, logout, getAccessToken } = usePrivy();
  const { generateSiweMessage, loginWithSiwe } = useLoginWithSiwe();
  const [accessToken, setAccessToken] = useState<string | null>(null);

  useEffect(() => {
    if (!ready || !authenticated) {
      setAccessToken(null);
      return;
    }
    let cancelled = false;
    const refresh = async (): Promise<void> => {
      try {
        const token = await getAccessToken();
        if (!cancelled) setAccessToken(token ?? null);
      } catch {
        if (!cancelled) setAccessToken(null);
      }
    };
    void refresh();
    const timer = window.setInterval(() => void refresh(), REFRESH_INTERVAL_MS);
    return () => {
      cancelled = true;
      window.clearInterval(timer);
    };
  }, [ready, authenticated, getAccessToken]);

  const signInWithWallet = useCallback(
    async (wallet: DetectedWallet): Promise<void> => {
      const accounts = await withWalletTimeout(
        wallet.provider.request({ method: 'eth_requestAccounts' }),
      );
      const address = Array.isArray(accounts) ? accounts[0] : undefined;
      if (typeof address !== 'string' || address.length === 0) {
        throw new Error('The wallet returned no account.');
      }
      let checksumAddress: string;
      try {
        // SIWE requires an EIP-55 address. Some EIP-1193 providers, including
        // MetaMask in some configurations, return the same address in lowercase.
        checksumAddress = getAddress(address.toLowerCase());
      } catch {
        throw new Error('The wallet returned an invalid account.');
      }
      const message = await generateSiweMessage({
        address: checksumAddress,
        chainId: ARC_TESTNET,
      });
      const signature = await withWalletTimeout(
        wallet.provider.request({
          method: 'personal_sign',
          params: [message, checksumAddress],
        }),
      );
      if (typeof signature !== 'string') {
        throw new Error('The wallet returned no signature.');
      }
      // EIP-6963 `rdns` values (for example, `io.metamask`) are provider
      // identifiers, not Privy's walletClientType values (for example,
      // `metamask`). Both fields are optional for SIWE login, so omit them
      // rather than sending metadata Privy cannot interpret.
      await loginWithSiwe({ signature, message });
    },
    [generateSiweMessage, loginWithSiwe],
  );

  const status: OperatorSessionStatus = !ready
    ? 'LOADING'
    : authenticated
      ? 'SIGNED_IN'
      : 'SIGNED_OUT';

  return {
    status,
    subject: user?.id ?? null,
    accessToken: status === 'SIGNED_IN' ? accessToken : null,
    login,
    logout,
    signInWithWallet,
  };
}
