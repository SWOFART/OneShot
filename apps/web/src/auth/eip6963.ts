/**
 * EIP-6963 wallet discovery.
 *
 * Wallets announce themselves in response to a request event, so the list
 * arrives asynchronously and can grow after first paint. Announcements come
 * from browser extensions and are untrusted input: every field is validated
 * before it reaches the picker, and nothing announced is ever logged.
 */

export interface Eip1193Provider {
  request(args: {
    readonly method: string;
    readonly params?: readonly unknown[];
  }): Promise<unknown>;
}

export interface DetectedWallet {
  readonly uuid: string;
  readonly name: string;
  readonly rdns: string;
  readonly icon: string;
  readonly provider: Eip1193Provider;
}

export interface WalletStore {
  readonly wallets: readonly DetectedWallet[];
  readonly subscribe: (listener: () => void) => () => void;
}

function isNonEmptyString(value: unknown): value is string {
  return typeof value === 'string' && value.length > 0;
}

function parseAnnouncement(detail: unknown): DetectedWallet | null {
  if (typeof detail !== 'object' || detail === null) return null;
  const { info, provider } = detail as { info?: unknown; provider?: unknown };
  if (typeof info !== 'object' || info === null) return null;
  const { uuid, name, rdns, icon } = info as Record<string, unknown>;
  if (!isNonEmptyString(uuid) || !isNonEmptyString(name)) return null;
  if (!isNonEmptyString(rdns) || !isNonEmptyString(icon)) return null;
  if (typeof provider !== 'object' || provider === null) return null;
  if (typeof (provider as Eip1193Provider).request !== 'function') return null;
  return { uuid, name, rdns, icon, provider: provider as Eip1193Provider };
}

export function detectWallets(): WalletStore {
  const found = new Map<string, DetectedWallet>();
  const listeners = new Set<() => void>();

  window.addEventListener('eip6963:announceProvider', (event: Event) => {
    const wallet = parseAnnouncement((event as CustomEvent<unknown>).detail);
    if (wallet === null || found.has(wallet.uuid)) return;
    found.set(wallet.uuid, wallet);
    for (const listener of listeners) listener();
  });

  window.dispatchEvent(new Event('eip6963:requestProvider'));

  return {
    get wallets() {
      return [...found.values()];
    },
    subscribe(listener) {
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },
  };
}
