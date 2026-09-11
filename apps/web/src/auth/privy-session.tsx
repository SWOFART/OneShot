import { PrivyProvider, useLoginWithSiwe, usePrivy } from '@privy-io/react-auth';
import { useCallback, useEffect, useState, type ReactNode } from 'react';

import type { DetectedWallet } from './eip6963.js';
import type { OperatorSession, OperatorSessionStatus } from './session.js';

const REFRESH_INTERVAL_MS = 5 * 60 * 1000;
const ARC_TESTNET: `eip155:${number}` = 'eip155:5042002';

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
      const accounts = await wallet.provider.request({ method: 'eth_requestAccounts' });
      const address = Array.isArray(accounts) ? accounts[0] : undefined;
      if (typeof address !== 'string' || address.length === 0) {
        throw new Error('The wallet returned no account.');
      }
      const message = await generateSiweMessage({ address, chainId: ARC_TESTNET });
      const signature = await wallet.provider.request({
        method: 'personal_sign',
        params: [message, address],
      });
      if (typeof signature !== 'string') {
        throw new Error('The wallet returned no signature.');
      }
      await loginWithSiwe({
        signature,
        message,
        walletClientType: wallet.rdns,
        connectorType: 'injected',
      });
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
