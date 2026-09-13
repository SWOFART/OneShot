import {
  PrivyProvider,
  useActiveWallet,
  useLogin,
  usePrivy,
  useWallets,
} from '@privy-io/react-auth';
import type { BaseConnectedWalletType } from '@privy-io/react-auth';
import { defineChain } from 'viem';
import { useEffect, useRef, useState, type ReactNode } from 'react';
import type { OperatorSession, OperatorSessionStatus, UserWalletSession } from './session.js';

const REFRESH_INTERVAL_MS = 5 * 60 * 1000;
const ARC_TESTNET_CHAIN_ID = 'eip155:5042002' as const;
const ARC_TESTNET = defineChain({
  id: 5042002,
  name: 'Arc Testnet',
  testnet: true,
  nativeCurrency: { name: 'USDC', symbol: 'USDC', decimals: 18 },
  rpcUrls: { default: { http: ['https://rpc.testnet.arc.network'] } },
  blockExplorers: { default: { name: 'Arcscan', url: 'https://testnet.arcscan.app' } },
});

export function PrivyOperatorProvider(props: {
  readonly appId: string;
  readonly children: ReactNode;
}) {
  return (
    <PrivyProvider
      appId={props.appId}
      config={{
        loginMethods: ['email', 'wallet'],
        embeddedWallets: { ethereum: { createOnLogin: 'users-without-wallets' } },
        defaultChain: ARC_TESTNET,
        supportedChains: [ARC_TESTNET],
        appearance: {
          theme: '#0a0a0a',
          accentColor: '#00dc5f',
          walletList: ['detected_ethereum_wallets', 'wallet_connect'],
          walletChainType: 'ethereum-only',
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
function isEthereumWallet(value: BaseConnectedWalletType | undefined): value is EthereumWallet {
  return value?.type === 'ethereum';
}

export function usePrivyUserWallet(): UserWalletSession {
  const { user } = usePrivy();
  const { ready: walletsReady, wallets } = useWallets();
  const { wallet: activeWallet, connect: connectWallet } = useActiveWallet();
  const explicitlyConnectedWallet = useRef<{
    readonly subject: string | null;
    readonly wallet: EthereumWallet;
  } | null>(null);
  const subject = user?.id ?? null;
  const selectedWallet: EthereumWallet | undefined =
    activeWallet?.type === 'ethereum'
      ? activeWallet
      : walletsReady
        ? wallets.find((candidate) => isEthereumWallet(candidate))
        : undefined;

  async function selectWallet(): Promise<EthereumWallet | undefined> {
    if (selectedWallet) return selectedWallet;
    if (explicitlyConnectedWallet.current?.subject === subject) {
      return explicitlyConnectedWallet.current.wallet;
    }
    const result = await connectWallet({ reset: true });
    if (result.wallet?.type !== 'ethereum') return undefined;
    explicitlyConnectedWallet.current = { subject, wallet: result.wallet };
    return result.wallet;
  }

  async function connect(): Promise<string | null> {
    return (await selectWallet())?.address ?? null;
  }

  async function resolveWallet(): Promise<EthereumWallet> {
    const wallet = await selectWallet();
    if (!wallet) throw new Error('Select a wallet in Privy before approving payment');
    return wallet;
  }

  async function resolveArcWallet(): Promise<EthereumWallet> {
    const current = await resolveWallet();
    if (current.chainId !== ARC_TESTNET_CHAIN_ID) await current.switchChain(5042002);
    return current;
  }

  async function sendTransfer(payment: Parameters<UserWalletSession['sendTransfer']>[0]) {
    const current = await resolveArcWallet();
    if (current.address.toLowerCase() !== payment.payer_wallet.toLowerCase()) {
      throw new Error('The active wallet changed; review the payment again');
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
    address:
      selectedWallet?.address ??
      (explicitlyConnectedWallet.current?.subject === subject
        ? explicitlyConnectedWallet.current.wallet.address
        : null),
    connect,
    sendTransfer,
  };
}
