import {
  PrivyProvider,
  useActiveWallet,
  useLogin,
  usePrivy,
  useWallets,
  type BaseConnectedWalletType,
  type ConnectedWallet,
} from '@privy-io/react-auth';
import { BatchEvmScheme } from '@circle-fin/x402-batching/client';
import { encodeFunctionData, erc20Abi, defineChain } from 'viem';
import { useEffect, useRef, useState, type ReactNode } from 'react';
import {
  CIRCLE_X402_USER_WALLET_VALIDITY_WINDOW_SECONDS,
  type PaidApiQuote,
  type SubmitPaidApiUserWalletRequest,
} from '@oneshot/contracts';

import {
  GatewayFundingError,
  type GatewayFundingResult,
  type GatewayPendingDeposit,
  type OperatorSession,
  type OperatorSessionStatus,
  type UserWalletSession,
} from './session.js';
import { usdcToAtomicUnits } from '../utils/money.js';

const REFRESH_INTERVAL_MS = 5 * 60 * 1000;
const ARC_TESTNET_GATEWAY_DOMAIN = 26;
const CIRCLE_GATEWAY_BALANCES_URL = 'https://gateway-api-testnet.circle.com/v1/balances';
const CIRCLE_GATEWAY_DEPOSITS_URL = 'https://gateway-api-testnet.circle.com/v1/deposits';
const ARC_TESTNET_USDC = '0x3600000000000000000000000000000000000000' as const;
const ARC_TESTNET_GATEWAY_WALLET = '0x0077777d7EBA4688BDeF3E311b846F25870A19B9' as const;
const ARC_TESTNET_CHAIN_ID = 'eip155:5042002' as const;
const ARC_TESTNET = defineChain({
  id: 5042002,
  name: 'Arc Testnet',
  testnet: true,
  nativeCurrency: { name: 'USDC', symbol: 'USDC', decimals: 18 },
  rpcUrls: { default: { http: ['https://rpc.testnet.arc.network'] } },
  blockExplorers: { default: { name: 'Arcscan', url: 'https://testnet.arcscan.app' } },
});
const GATEWAY_DEPOSIT_ABI = [
  {
    type: 'function',
    name: 'deposit',
    inputs: [
      { name: 'token', type: 'address' },
      { name: 'value', type: 'uint256' },
    ],
    outputs: [],
    stateMutability: 'nonpayable',
  },
] as const;
const TRANSACTION_HASH = /^0x[0-9a-fA-F]{64}$/u;
const EVM_ADDRESS = /^0x[0-9a-fA-F]{40}$/u;
const MAX_UINT256 = 2n ** 256n - 1n;

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
        defaultChain: ARC_TESTNET,
        supportedChains: [ARC_TESTNET],
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
type EthereumProvider = Awaited<ReturnType<EthereumWallet['getEthereumProvider']>>;

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

export function circleX402SigningRequirements(quote: PaidApiQuote) {
  return {
    scheme: 'exact' as const,
    network: quote.network,
    asset: '0x3600000000000000000000000000000000000000',
    amount: quote.amount_atomic,
    payTo: quote.recipient,
    // The SDK's 100-second buffer is too narrow for a human wallet prompt
    // plus network forwarding. This is used only inside the signed payload;
    // the durable quote remains unchanged and is reconstructed server-side.
    maxTimeoutSeconds: Math.max(
      quote.max_timeout_seconds,
      CIRCLE_X402_USER_WALLET_VALIDITY_WINDOW_SECONDS,
    ),
    extra: {
      name: 'GatewayWalletBatched',
      version: '1',
      verifyingContract: '0x0077777d7EBA4688BDeF3E311b846F25870A19B9',
    },
  };
}

function isPrivyEthereumWallet(
  value: BaseConnectedWalletType | undefined,
): value is ConnectedWallet {
  return value?.type === 'ethereum' && value.walletClientType === 'privy';
}

function validateAddress(value: string, label: string): asserts value is `0x${string}` {
  if (!EVM_ADDRESS.test(value)) throw new Error(`${label} is invalid`);
}

function validatePositiveAtomic(value: string, label: string): bigint {
  if (!/^[1-9][0-9]*$/u.test(value)) throw new Error(`${label} must be a positive integer`);
  const parsed = BigInt(value);
  if (parsed > MAX_UINT256) throw new Error(`${label} is too large`);
  return parsed;
}

function validateTransactionHash(value: unknown): `0x${string}` {
  if (typeof value !== 'string' || !TRANSACTION_HASH.test(value)) {
    throw new Error('Wallet did not return a valid transaction hash');
  }
  return value.toLowerCase() as `0x${string}`;
}

async function waitForSuccessfulReceipt(provider: EthereumProvider, transactionHash: string) {
  for (let attempt = 0; attempt < 90; attempt += 1) {
    const receipt = await provider.request({
      method: 'eth_getTransactionReceipt',
      params: [transactionHash],
    });
    if (receipt !== null && typeof receipt === 'object' && !Array.isArray(receipt)) {
      const status = (receipt as Record<string, unknown>).status;
      if (status === '0x1') return;
      if (status === '0x0') throw new Error('Gateway transaction reverted');
      throw new Error('Gateway transaction receipt is malformed');
    }
    await new Promise<void>((resolve) => window.setTimeout(resolve, 1000));
  }
  throw new Error('Gateway transaction confirmation is not available yet');
}

export function usePrivyUserWallet(): UserWalletSession {
  const { user } = usePrivy();
  const { ready: walletsReady, wallets } = useWallets();
  const { wallet: activeWallet, setActiveWallet, connect: connectWallet } = useActiveWallet();
  const explicitlyConnectedWallet = useRef<{
    readonly subject: string | null;
    readonly wallet: EthereumWallet;
  } | null>(null);
  const subject = user?.id ?? null;
  const selectedWallet: ConnectedWallet | undefined =
    walletsReady && isPrivyEthereumWallet(activeWallet)
      ? activeWallet
      : walletsReady
        ? wallets.find((candidate) => isPrivyEthereumWallet(candidate))
        : undefined;

  useEffect(() => {
    if (selectedWallet && !isPrivyEthereumWallet(activeWallet)) {
      setActiveWallet(selectedWallet);
    }
  }, [activeWallet, selectedWallet, setActiveWallet]);

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

  async function getGatewayBalance(payerWallet: string): Promise<string> {
    validateAddress(payerWallet, 'Gateway balance payer wallet');
    const response = await fetch(CIRCLE_GATEWAY_BALANCES_URL, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        token: 'USDC',
        sources: [{ depositor: payerWallet, domain: ARC_TESTNET_GATEWAY_DOMAIN }],
      }),
    });
    const body: unknown = await response.json().catch(() => null);
    if (!response.ok || body === null || typeof body !== 'object' || Array.isArray(body)) {
      throw new Error('Circle Gateway balance lookup failed');
    }
    const balances = (body as Record<string, unknown>).balances;
    if (!Array.isArray(balances)) throw new Error('Circle Gateway balance response is invalid');
    const matching = balances.find(
      (entry): entry is Record<string, unknown> =>
        entry !== null &&
        typeof entry === 'object' &&
        !Array.isArray(entry) &&
        entry.domain === ARC_TESTNET_GATEWAY_DOMAIN &&
        typeof entry.depositor === 'string' &&
        entry.depositor.toLowerCase() === payerWallet.toLowerCase(),
    );
    if (
      !matching ||
      typeof matching.balance !== 'string' ||
      !/^(?:0|[1-9][0-9]*)(?:\.[0-9]{1,6})?$/u.test(matching.balance)
    ) {
      throw new Error('Circle Gateway balance response is invalid');
    }
    try {
      return usdcToAtomicUnits(matching.balance);
    } catch {
      throw new Error('Circle Gateway balance response is invalid');
    }
  }

  async function getGatewayPendingDeposits(
    payerWallet: string,
  ): Promise<readonly GatewayPendingDeposit[]> {
    validateAddress(payerWallet, 'Gateway deposit payer wallet');
    const response = await fetch(CIRCLE_GATEWAY_DEPOSITS_URL, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        token: 'USDC',
        sources: [{ depositor: payerWallet, domain: ARC_TESTNET_GATEWAY_DOMAIN }],
      }),
    });
    const body: unknown = await response.json().catch(() => null);
    if (!response.ok || body === null || typeof body !== 'object' || Array.isArray(body)) {
      throw new Error('Circle Gateway pending-deposit lookup failed');
    }
    const deposits = (body as Record<string, unknown>).deposits;
    if (!Array.isArray(deposits))
      throw new Error('Circle Gateway pending-deposit response is invalid');
    return deposits.flatMap((entry): GatewayPendingDeposit[] => {
      if (entry === null || typeof entry !== 'object' || Array.isArray(entry)) return [];
      const record = entry as Record<string, unknown>;
      if (
        record.domain !== ARC_TESTNET_GATEWAY_DOMAIN ||
        typeof record.depositor !== 'string' ||
        record.depositor.toLowerCase() !== payerWallet.toLowerCase() ||
        record.status !== 'pending' ||
        typeof record.transactionHash !== 'string' ||
        !TRANSACTION_HASH.test(record.transactionHash) ||
        typeof record.amount !== 'string'
      ) {
        return [];
      }
      return [
        {
          transaction_hash: record.transactionHash.toLowerCase(),
          amount: record.amount,
          status: record.status,
        },
      ];
    });
  }

  async function fundGateway(targetAmountAtomic: string): Promise<GatewayFundingResult> {
    const target = validatePositiveAtomic(targetAmountAtomic, 'Gateway target amount');
    const current = await resolveArcWallet();
    const payerWallet = current.address;
    const available = BigInt(await getGatewayBalance(payerWallet));
    if (available >= target) {
      return {
        target_amount_atomic: targetAmountAtomic,
        deposited_amount_atomic: '0',
        approval_transaction_hash: null,
        deposit_transaction_hash: null,
      };
    }

    const pending = await getGatewayPendingDeposits(payerWallet);
    const existingPending = pending[0];
    if (existingPending) {
      throw new GatewayFundingError(
        'A Gateway deposit is already pending for this wallet. Check its status before funding again.',
        'DEPOSIT',
        existingPending.transaction_hash,
      );
    }

    const amount = target - available;
    const provider = await current.getEthereumProvider();
    const allowanceData = encodeFunctionData({
      abi: erc20Abi,
      functionName: 'allowance',
      args: [payerWallet as `0x${string}`, ARC_TESTNET_GATEWAY_WALLET],
    });
    let allowance = 0n;
    try {
      const rawAllowance = await provider.request({
        method: 'eth_call',
        params: [{ to: ARC_TESTNET_USDC, data: allowanceData }, 'latest'],
      });
      if (typeof rawAllowance === 'string') allowance = BigInt(rawAllowance);
    } catch {
      allowance = 0n;
    }

    let approvalTransactionHash: string | null = null;
    if (allowance < amount) {
      const approvalData = encodeFunctionData({
        abi: erc20Abi,
        functionName: 'approve',
        args: [ARC_TESTNET_GATEWAY_WALLET, amount],
      });
      try {
        approvalTransactionHash = validateTransactionHash(
          await provider.request({
            method: 'eth_sendTransaction',
            params: [
              {
                from: payerWallet,
                to: ARC_TESTNET_USDC,
                data: approvalData,
                value: '0x0',
              },
            ],
          }),
        );
        await waitForSuccessfulReceipt(provider, approvalTransactionHash);
      } catch (error) {
        throw new GatewayFundingError(
          error instanceof Error ? error.message : 'Gateway approval did not complete',
          'APPROVAL',
          approvalTransactionHash,
        );
      }
    }

    const depositData = encodeFunctionData({
      abi: GATEWAY_DEPOSIT_ABI,
      functionName: 'deposit',
      args: [ARC_TESTNET_USDC, amount],
    });
    let depositTransactionHash: string | null = null;
    try {
      depositTransactionHash = validateTransactionHash(
        await provider.request({
          method: 'eth_sendTransaction',
          params: [
            {
              from: payerWallet,
              to: ARC_TESTNET_GATEWAY_WALLET,
              data: depositData,
              value: '0x0',
            },
          ],
        }),
      );
      await waitForSuccessfulReceipt(provider, depositTransactionHash);
    } catch (error) {
      throw new GatewayFundingError(
        error instanceof Error ? error.message : 'Gateway deposit did not complete',
        'DEPOSIT',
        typeof depositTransactionHash === 'string' ? depositTransactionHash : null,
      );
    }
    return {
      target_amount_atomic: targetAmountAtomic,
      deposited_amount_atomic: amount.toString(),
      approval_transaction_hash: approvalTransactionHash,
      deposit_transaction_hash: depositTransactionHash,
    };
  }

  async function signX402Payment(
    quote: PaidApiQuote,
  ): Promise<SubmitPaidApiUserWalletRequest['payment_payload']> {
    const current = await resolveArcWallet();
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
              types: {
                ...parameters.types,
                EIP712Domain: [
                  { name: 'name', type: 'string' },
                  { name: 'version', type: 'string' },
                  { name: 'chainId', type: 'uint256' },
                  { name: 'verifyingContract', type: 'address' },
                ],
              },
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
    const requirements = circleX402SigningRequirements(quote);
    const partial = await new BatchEvmScheme(signer).createPaymentPayload(
      quote.x402_version,
      requirements,
    );
    return { x402Version: partial.x402Version, payload: partial.payload };
  }

  return {
    address:
      selectedWallet?.address ??
      (explicitlyConnectedWallet.current?.subject === subject
        ? explicitlyConnectedWallet.current.wallet.address
        : null),
    connect,
    getGatewayBalance,
    getGatewayPendingDeposits,
    fundGateway,
    sendTransfer,
    signX402Payment,
  };
}
