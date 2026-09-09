import { PrivyProvider, usePrivy } from '@privy-io/react-auth';
import { useEffect, useState, type ReactNode } from 'react';
import type { OperatorSession, OperatorSessionStatus } from './session.js';

const REFRESH_INTERVAL_MS = 5 * 60 * 1000;

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
      }}
    >
      {props.children}
    </PrivyProvider>
  );
}

export function usePrivyOperatorSession(): OperatorSession {
  const { ready, authenticated, user, login, logout, getAccessToken } = usePrivy();
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
  };
}
