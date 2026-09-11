import { describe, expect, it, vi } from 'vitest';

import { detectWallets, type Eip1193Provider } from '../src/auth/eip6963.js';
import { WALLET_CATALOGUE } from '../src/auth/wallet-catalogue.js';

const provider: Eip1193Provider = { request: vi.fn() };

function announce(uuid: string, name: string, rdns: string): void {
  window.dispatchEvent(
    new CustomEvent('eip6963:announceProvider', {
      detail: { info: { uuid, name, rdns, icon: 'data:image/svg+xml,<svg/>' }, provider },
    }),
  );
}

describe('detectWallets', () => {
  it('collects announced wallets and notifies subscribers', () => {
    const store = detectWallets();
    const listener = vi.fn();
    store.subscribe(listener);

    announce('a', 'Rabbit Wallet', 'io.rabbit');
    expect(listener).toHaveBeenCalled();
    expect(store.wallets.map((wallet) => wallet.name)).toContain('Rabbit Wallet');
  });

  it('ignores a repeat announcement of the same wallet', () => {
    const store = detectWallets();
    announce('b', 'Rabbit Wallet', 'io.rabbit');
    announce('b', 'Rabbit Wallet', 'io.rabbit');
    expect(store.wallets.filter((wallet) => wallet.uuid === 'b')).toHaveLength(1);
  });

  it('ignores a malformed announcement', () => {
    const store = detectWallets();
    const before = store.wallets.length;
    window.dispatchEvent(new CustomEvent('eip6963:announceProvider', { detail: { info: {} } }));
    expect(store.wallets).toHaveLength(before);
  });

  it('stops notifying after unsubscribe', () => {
    const store = detectWallets();
    const listener = vi.fn();
    store.subscribe(listener)();
    announce('c', 'Another Wallet', 'io.another');
    expect(listener).not.toHaveBeenCalled();
  });
});

describe('WALLET_CATALOGUE', () => {
  it('lists the known wallets with unique ids', () => {
    const ids = WALLET_CATALOGUE.map((wallet) => wallet.id);
    expect(new Set(ids).size).toBe(ids.length);
    expect(ids).toContain('metamask');
    expect(ids).toContain('coinbase_wallet');
    expect(ids).toContain('wallet_connect');
  });
});
