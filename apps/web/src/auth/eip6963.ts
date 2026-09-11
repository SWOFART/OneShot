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
  readonly icon?: string;
  readonly provider: Eip1193Provider;
}

export interface WalletStore {
  readonly wallets: readonly DetectedWallet[];
  readonly subscribe: (listener: () => void) => () => void;
}

const MAX_FIELD_LENGTH = 256;
const MAX_ICON_BYTES = 256 * 1024;
const DATA_IMAGE_URI_PATTERN = /^data:image\//u;

function isNonEmptyString(value: unknown): value is string {
  return typeof value === 'string' && value.length > 0;
}

function isBoundedString(value: unknown): value is string {
  return isNonEmptyString(value) && value.length <= MAX_FIELD_LENGTH;
}

function isAcceptableIcon(value: unknown): value is string {
  return (
    isNonEmptyString(value) && value.length <= MAX_ICON_BYTES && DATA_IMAGE_URI_PATTERN.test(value)
  );
}

function parseAnnouncement(detail: unknown): DetectedWallet | null {
  if (typeof detail !== 'object' || detail === null) return null;
  const { info, provider } = detail as { info?: unknown; provider?: unknown };
  if (typeof info !== 'object' || info === null) return null;
  const { uuid, name, rdns, icon } = info as Record<string, unknown>;
  if (!isBoundedString(uuid) || !isBoundedString(name)) return null;
  if (!isBoundedString(rdns)) return null;
  if (typeof provider !== 'object' || provider === null) return null;
  if (typeof (provider as Eip1193Provider).request !== 'function') return null;
  return {
    uuid,
    name,
    rdns,
    ...(isAcceptableIcon(icon) ? { icon } : {}),
    provider: provider as Eip1193Provider,
  };
}

/**
 * Each call registers a permanent `window` listener that is never removed.
 * Callers must invoke this once per app session (memoise the result) rather
 * than once per render or per component mount.
 */
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
