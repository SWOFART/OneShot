import {
  PrivyProvider,
  useActiveWallet,
  useLogin,
  usePrivy,
  type BaseConnectedWalletType,
} from '@privy-io/react-auth';
import { BatchEvmScheme } from '@circle-fin/x402-batching/client';
import { useEffect, useState, type ReactNode } from 'react';
import type { PaidApiQuote, SubmitPaidApiUserWalletRequest } from '@oneshot/contracts';

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

function jsonSafe(value: unknown): unknown {
  if (typeof value === 'bigint') return value.toString(10);
  if (Array.isArray(value)) return value.map(jsonSafe);
  if (value && typeof value === 'object') {
    return Object.fromEntries(
      Object.entries(value as Record<string, unknown>).map(([key, child]) => [
        key,
        jsonSafe(child),
      ]),
    );
  }
  return value;
}

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

  async function signX402Payment(
    quote: PaidApiQuote,
  ): Promise<SubmitPaidApiUserWalletRequest['payment_payload']> {
    let current = wallet;
    if (!current) {
      const result = await active.connect();
      current = result.wallet?.type === 'ethereum' ? (result.wallet as EthereumWallet) : undefined;
    }
    if (!current) throw new Error('Connect an Ethereum wallet before approving payment');
    if (current.chainId !== 'eip155:5042002') {
      await current.switchChain(5042002);
    }
    const provider = await current.getEthereumProvider();
    const signer = {
      address: current.address as `0x${string}`,
      signTypedData: async (parameters: {
        readonly domain: {
          readonly name: string;
          readonly version: string;
          readonly chainId: number;
          readonly verifyingContract: `0x${string}`;
        };
        readonly types: Record<string, Array<{ readonly name: string; readonly type: string }>>;
        readonly primaryType: string;
        readonly message: Record<string, unknown>;
      }): Promise<`0x${string}`> => {
        const signature = await provider.request({
          method: 'eth_signTypedData_v4',
          params: [
            current!.address,
            JSON.stringify({
              domain: parameters.domain,
              types: parameters.types,
              primaryType: parameters.primaryType,
              message: jsonSafe(parameters.message),
            }),
          ],
        });
        if (typeof signature !== 'string' || !/^0x[0-9a-fA-F]{128,130}$/u.test(signature)) {
          throw new Error('Wallet did not return a valid x402 signature');
        }
        return signature as `0x${string}`;
      },
    };
    const requirements = {
      scheme: 'exact' as const,
      network: quote.network,
      asset: '0x3600000000000000000000000000000000000000',
      amount: quote.amount_atomic,
      payTo: quote.recipient,
      maxTimeoutSeconds: quote.max_timeout_seconds,
      extra: {
        name: 'GatewayWalletBatched',
        version: '1',
        verifyingContract: '0x0077777d7EBA4688BDeF3E311b846F25870A19B9',
      },
    };
    const partial = await new BatchEvmScheme(signer).createPaymentPayload(
      quote.x402_version,
      requirements,
    );
    return { x402Version: partial.x402Version, payload: partial.payload };
  }

  return {
    address: wallet?.address ?? null,
    connect,
    sendTransfer,
    signX402Payment,
  };
}
