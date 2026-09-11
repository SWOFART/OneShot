import { describe, expect, it, vi } from 'vitest';

import { detectWallets, type Eip1193Provider } from '../src/auth/eip6963.js';
import { WALLET_CATALOGUE } from '../src/auth/wallet-catalogue.js';

const provider: Eip1193Provider = { request: vi.fn() };

function dispatchAnnouncement(detail: unknown): void {
  window.dispatchEvent(new CustomEvent('eip6963:announceProvider', { detail }));
}

function announce(uuid: string, name: string, rdns: string): void {
  dispatchAnnouncement({
    info: { uuid, name, rdns, icon: 'data:image/svg+xml,<svg/>' },
    provider,
  });
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

  it('keeps the first wallet when a uuid is re-announced with a different name and provider', () => {
    const store = detectWallets();
    const firstProvider: Eip1193Provider = { request: vi.fn() };
    const secondProvider: Eip1193Provider = { request: vi.fn() };

    dispatchAnnouncement({
      info: {
        uuid: 'dup',
        name: 'First Wallet',
        rdns: 'io.first',
        icon: 'data:image/svg+xml,<svg/>',
      },
      provider: firstProvider,
    });
    dispatchAnnouncement({
      info: {
        uuid: 'dup',
        name: 'Second Wallet',
        rdns: 'io.second',
        icon: 'data:image/svg+xml,<svg/>',
      },
      provider: secondProvider,
    });

    const matches = store.wallets.filter((wallet) => wallet.uuid === 'dup');
    expect(matches).toHaveLength(1);
    expect(matches[0]?.name).toBe('First Wallet');
    expect(matches[0]?.provider).toBe(firstProvider);
  });

  it('drops an announcement with a missing or blank rdns', () => {
    const store = detectWallets();
    dispatchAnnouncement({
      info: { uuid: 'bad-rdns', name: 'Bad Wallet', rdns: '', icon: 'data:image/svg+xml,<svg/>' },
      provider,
    });
    expect(store.wallets.some((wallet) => wallet.uuid === 'bad-rdns')).toBe(false);
  });

  it('drops an announcement whose provider is missing', () => {
    const store = detectWallets();
    dispatchAnnouncement({
      info: {
        uuid: 'no-provider',
        name: 'No Provider Wallet',
        rdns: 'io.noprovider',
        icon: 'data:image/svg+xml,<svg/>',
      },
    });
    expect(store.wallets.some((wallet) => wallet.uuid === 'no-provider')).toBe(false);
  });

  it('drops an announcement whose provider.request is not a function', () => {
    const store = detectWallets();
    dispatchAnnouncement({
      info: {
        uuid: 'bad-request',
        name: 'Bad Request Wallet',
        rdns: 'io.badrequest',
        icon: 'data:image/svg+xml,<svg/>',
      },
      provider: { request: 'not-a-function' },
    });
    expect(store.wallets.some((wallet) => wallet.uuid === 'bad-request')).toBe(false);
  });

  it('accepts a wallet whose icon is not a data URI, but drops the icon', () => {
    const store = detectWallets();
    dispatchAnnouncement({
      info: {
        uuid: 'https-icon',
        name: 'Https Icon Wallet',
        rdns: 'io.httpsicon',
        icon: 'https://evil.example/beacon.gif',
      },
      provider,
    });
    const wallet = store.wallets.find((candidate) => candidate.uuid === 'https-icon');
    expect(wallet).toBeDefined();
    expect(wallet && 'icon' in wallet).toBe(false);
  });

  it('drops an announcement whose name exceeds the length cap', () => {
    const store = detectWallets();
    dispatchAnnouncement({
      info: {
        uuid: 'long-name',
        name: 'x'.repeat(257),
        rdns: 'io.longname',
        icon: 'data:image/svg+xml,<svg/>',
      },
      provider,
    });
    expect(store.wallets.some((wallet) => wallet.uuid === 'long-name')).toBe(false);
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
