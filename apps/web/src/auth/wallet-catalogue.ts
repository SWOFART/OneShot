/**
 * Wallets Privy can connect that are not installed in this browser.
 *
 * The ids are Privy's own `WalletListEntry` values, so handing one to Privy's
 * modal as a fallback needs no translation. Detected wallets never come from
 * here — they announce their own names and icons over EIP-6963.
 */

export interface CatalogueWallet {
  readonly id: string;
  readonly name: string;
}

export const WALLET_CATALOGUE: readonly CatalogueWallet[] = [
  { id: 'metamask', name: 'MetaMask' },
  { id: 'coinbase_wallet', name: 'Coinbase Wallet' },
  { id: 'base_account', name: 'Base Account' },
  { id: 'rainbow', name: 'Rainbow' },
  { id: 'phantom', name: 'Phantom' },
  { id: 'zerion', name: 'Zerion' },
  { id: 'cryptocom', name: 'Crypto.com' },
  { id: 'uniswap', name: 'Uniswap Wallet' },
  { id: 'okx_wallet', name: 'OKX Wallet' },
  { id: 'universal_profile', name: 'Universal Profile' },
  { id: 'safe', name: 'Safe' },
  { id: 'bybit_wallet', name: 'Bybit Wallet' },
  { id: 'ronin_wallet', name: 'Ronin Wallet' },
  { id: 'haha_wallet', name: 'HaHa Wallet' },
  { id: 'binance', name: 'Binance Wallet' },
  { id: 'bitget_wallet', name: 'Bitget Wallet' },
  { id: 'wallet_connect', name: 'WalletConnect' },
];
