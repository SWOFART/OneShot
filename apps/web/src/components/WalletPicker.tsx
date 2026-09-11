import { useEffect, useMemo, useState, type KeyboardEvent } from 'react';

import { getWalletStore, type DetectedWallet, type WalletStore } from '../auth/eip6963.js';
import { WALLET_CATALOGUE } from '../auth/wallet-catalogue.js';

/**
 * The operator's wallet chooser.
 *
 * Privy's own modal lists every wallet it supports with no way to search it,
 * which is more than an operator can scan. This covers the same ground in one
 * searchable box: wallets actually installed in this browser first, then the
 * catalogue. Picking an installed wallet signs in headlessly; anything else
 * hands off to Privy's modal, which owns WalletConnect and the mobile flows.
 */

interface Option {
  readonly key: string;
  readonly name: string;
  readonly icon?: string;
  readonly wallet?: DetectedWallet;
}

export interface WalletPickerProps {
  readonly signIn: (wallet: DetectedWallet) => Promise<void>;
  readonly onOtherWallet: () => void;
  readonly onEmail: () => void;
  /** Injected by tests. Production discovers wallets itself. */
  readonly store?: WalletStore;
}

export function WalletPicker(props: WalletPickerProps) {
  const store = useMemo(() => props.store ?? getWalletStore(), [props.store]);
  const [detected, setDetected] = useState<readonly DetectedWallet[]>(() => store.wallets);
  const [query, setQuery] = useState('');
  const [active, setActive] = useState(-1);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => store.subscribe(() => setDetected(store.wallets)), [store]);

  const options = useMemo<readonly Option[]>(() => {
    const installed = new Set(detected.map((entry) => entry.name.toLowerCase()));
    const all: Option[] = [
      ...detected.map((entry) => ({
        key: entry.uuid,
        name: entry.name,
        ...(entry.icon === undefined ? {} : { icon: entry.icon }),
        wallet: entry,
      })),
      ...WALLET_CATALOGUE.filter((entry) => !installed.has(entry.name.toLowerCase())).map(
        (entry) => ({ key: entry.id, name: entry.name }),
      ),
    ];
    const needle = query.trim().toLowerCase();
    if (needle === '') return all;
    return all.filter(
      (option) =>
        option.name.toLowerCase().includes(needle) ||
        (option.wallet?.rdns.toLowerCase().includes(needle) ?? false),
    );
  }, [detected, query]);

  async function choose(option: Option): Promise<void> {
    setError(null);
    if (option.wallet === undefined) {
      props.onOtherWallet();
      return;
    }
    setBusy(true);
    try {
      await props.signIn(option.wallet);
    } catch {
      // The underlying error may carry an address, a SIWE message, or a
      // signature. None of that belongs on screen or in a log.
      setError('Could not sign in with that wallet. Try again, or pick another.');
    } finally {
      setBusy(false);
    }
  }

  function onSearchKeyDown(event: KeyboardEvent<HTMLInputElement>): void {
    if (event.key === 'Escape') {
      setQuery('');
      setActive(-1);
      return;
    }
    if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
      event.preventDefault();
      if (options.length === 0) return;
      const step = event.key === 'ArrowDown' ? 1 : -1;
      setActive((current) => (current + step + options.length) % options.length);
      return;
    }
    if (event.key === 'Enter' && active >= 0) {
      event.preventDefault();
      const option = options[active];
      if (option !== undefined) void choose(option);
    }
  }

  const activeOption = active >= 0 ? options[active] : undefined;

  return (
    <section className="wallet-picker" aria-label="Choose a wallet">
      <h2>Operator sign-in</h2>
      <p className="gate-subtitle">
        The console reads authoritative payment state. Sign in to continue.
      </p>

      <input
        type="search"
        className="wallet-search"
        aria-label="Search wallets"
        aria-controls="wallet-list"
        {...(activeOption === undefined
          ? {}
          : { 'aria-activedescendant': `wallet-${activeOption.key}` })}
        value={query}
        onChange={(event) => {
          setQuery(event.target.value);
          setActive(-1);
        }}
        onKeyDown={onSearchKeyDown}
        placeholder="Search wallets"
      />

      {options.length === 0 ? (
        <p role="status" className="muted">
          No wallet matches “{query.trim()}”.
        </p>
      ) : (
        <ul id="wallet-list" className="wallet-list" role="listbox" aria-label="Wallets">
          {options.map((option, index) => (
            <li
              key={option.key}
              id={`wallet-${option.key}`}
              role="option"
              aria-selected={index === active}
              tabIndex={-1}
              className="wallet-option"
              onClick={() => void choose(option)}
            >
              {option.icon !== undefined && <img src={option.icon} alt="" width="20" height="20" />}
              <span>{option.name}</span>
              {option.wallet === undefined && <small>Not installed</small>}
            </li>
          ))}
        </ul>
      )}

      {error !== null && (
        <p role="alert" className="notice error">
          {error}
        </p>
      )}

      <div className="wallet-actions">
        <button type="button" className="secondary" disabled={busy} onClick={props.onOtherWallet}>
          Other wallet
        </button>
        <button type="button" className="secondary" disabled={busy} onClick={props.onEmail}>
          Continue with email
        </button>
      </div>
    </section>
  );
}
