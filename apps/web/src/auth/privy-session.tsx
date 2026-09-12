import {
  PrivyProvider,
  useActiveWallet,
  useLogin,
  usePrivy,
  type BaseConnectedWalletType,
} from '@privy-io/react-auth';
import { useEffect, useState, type ReactNode } from 'react';

import type { OperatorSession, OperatorSessionStatus, UserWalletSession } from './session.js';

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
        appearance: {
          theme: '#0a0a0a',
          accentColor: '#00dc5f',
          walletList: ['detected_ethereum_wallets'],
        },
      }}
    >
      {props.children}
    </PrivyProvider>
  );
}

export function usePrivyOperatorSession(): OperatorSession {
  const { ready, authenticated, user, logout, getAccessToken } = usePrivy();
  const { login } = useLogin();
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

function transferData(recipient: string, amountAtomic: string): `0x${string}` {
  if (!/^0x[0-9a-fA-F]{40}$/u.test(recipient)) throw new Error('Recipient wallet is invalid');
  if (!/^[1-9][0-9]*$/u.test(amountAtomic)) throw new Error('Payment amount is invalid');
  const amount = BigInt(amountAtomic);
  if (amount >= 2n ** 256n) throw new Error('Payment amount is too large');
  return `0xa9059cbb${recipient.slice(2).padStart(64, '0')}${amount.toString(16).padStart(64, '0')}`;
}

type EthereumWallet = Extract<BaseConnectedWalletType, { readonly type: 'ethereum' }>;

export function usePrivyUserWallet(): UserWalletSession {
  const active = useActiveWallet();
  const wallet: EthereumWallet | undefined =
    active.wallet?.type === 'ethereum' ? active.wallet : undefined;

  async function connect(): Promise<string | null> {
    const result = await active.connect();
    return result.wallet?.type === 'ethereum' ? result.wallet.address : null;
  }

  async function sendTransfer(payment: Parameters<UserWalletSession['sendTransfer']>[0]) {
    let current = wallet;
    if (!current) {
      const result = await active.connect();
      current = result.wallet?.type === 'ethereum' ? (result.wallet as EthereumWallet) : undefined;
    }
    if (!current) throw new Error('Connect an Ethereum wallet before approving payment');
    if (current.address.toLowerCase() !== payment.payer_wallet.toLowerCase()) {
      throw new Error('The active wallet changed; review the payment again');
    }
    if (current.chainId !== 'eip155:5042002') {
      await current.switchChain(5042002);
    }
    const provider = await current.getEthereumProvider();
    const result = await provider.request({
      method: 'eth_sendTransaction',
      params: [
        {
          from: current.address,
          to: payment.token_contract,
          data: transferData(payment.recipient, payment.amount_atomic),
          value: '0x0',
        },
      ],
    });
    if (typeof result !== 'string' || !/^0x[0-9a-fA-F]{64}$/u.test(result)) {
      throw new Error('Wallet did not return a valid transaction hash');
    }
    return result.toLowerCase();
  }

  return {
    address: wallet?.address ?? null,
    connect,
    sendTransfer,
  };
}
