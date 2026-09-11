import { cleanup, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';

import type { DetectedWallet, WalletStore } from '../src/auth/eip6963.js';
import { WalletPicker } from '../src/components/WalletPicker.js';

afterEach(cleanup);

function wallet(name: string, rdns: string): DetectedWallet {
  return {
    uuid: rdns,
    name,
    rdns,
    icon: 'data:image/svg+xml,<svg/>',
    provider: { request: vi.fn() },
  };
}

function storeOf(...wallets: readonly DetectedWallet[]): WalletStore {
  return { wallets, subscribe: () => () => undefined };
}

const noop = (): void => undefined;
const resolve = async (): Promise<void> => undefined;

describe('WalletPicker', () => {
  it('lists detected wallets before the catalogue', () => {
    render(
      <WalletPicker
        store={storeOf(wallet('Rabbit Wallet', 'io.rabbit'))}
        signIn={resolve}
        onOtherWallet={noop}
        onEmail={noop}
      />,
    );
    const options = screen.getAllByRole('option').map((node) => node.textContent ?? '');
    expect(options[0]).toContain('Rabbit Wallet');
    expect(options.join(' ')).toContain('MetaMask');
  });

  it('filters both groups as you type', async () => {
    const user = userEvent.setup();
    render(
      <WalletPicker
        store={storeOf(wallet('Rabbit Wallet', 'io.rabbit'))}
        signIn={resolve}
        onOtherWallet={noop}
        onEmail={noop}
      />,
    );
    await user.type(screen.getByRole('searchbox', { name: /search wallets/iu }), 'rain');
    const options = screen.getAllByRole('option').map((node) => node.textContent ?? '');
    expect(options.join(' ')).toContain('Rainbow');
    expect(options.join(' ')).not.toContain('Rabbit Wallet');
  });

  it('says so when nothing matches', async () => {
    const user = userEvent.setup();
    render(<WalletPicker store={storeOf()} signIn={resolve} onOtherWallet={noop} onEmail={noop} />);
    await user.type(screen.getByRole('searchbox', { name: /search wallets/iu }), 'zzzz');
    expect(screen.getByRole('status').textContent).toMatch(/no wallet matches/iu);
  });

  it('moves the active option with the arrow keys and signs in on Enter', async () => {
    const user = userEvent.setup();
    const detected = wallet('Rabbit Wallet', 'io.rabbit');
    const signIn = vi.fn(resolve);
    render(
      <WalletPicker
        store={storeOf(detected)}
        signIn={signIn}
        onOtherWallet={noop}
        onEmail={noop}
      />,
    );
    await user.click(screen.getByRole('searchbox', { name: /search wallets/iu }));
    await user.keyboard('{ArrowDown}{Enter}');
    expect(signIn).toHaveBeenCalledWith(detected);
  });

  it('clears the query on Escape', async () => {
    const user = userEvent.setup();
    render(<WalletPicker store={storeOf()} signIn={resolve} onOtherWallet={noop} onEmail={noop} />);
    const search = screen.getByRole('searchbox', { name: /search wallets/iu }) as HTMLInputElement;
    await user.type(search, 'meta{Escape}');
    expect(search.value).toBe('');
  });

  it('falls back to Privy for a wallet that is not installed', async () => {
    const user = userEvent.setup();
    const onOtherWallet = vi.fn();
    render(
      <WalletPicker
        store={storeOf()}
        signIn={resolve}
        onOtherWallet={onOtherWallet}
        onEmail={noop}
      />,
    );
    await user.click(screen.getByRole('option', { name: /MetaMask/iu }));
    expect(onOtherWallet).toHaveBeenCalled();
  });

  it('surfaces a sign-in failure without leaking detail', async () => {
    const user = userEvent.setup();
    const detected = wallet('Rabbit Wallet', 'io.rabbit');
    render(
      <WalletPicker
        store={storeOf(detected)}
        signIn={async () => {
          throw new Error('0xdeadbeef signature 0x1234');
        }}
        onOtherWallet={noop}
        onEmail={noop}
      />,
    );
    await user.click(screen.getByRole('option', { name: /Rabbit Wallet/iu }));
    const alert = await screen.findByRole('alert');
    expect(alert.textContent).toMatch(/could not sign in/iu);
    expect(alert.textContent).not.toContain('0xdeadbeef');
  });
});
