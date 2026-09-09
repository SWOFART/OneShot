import { createSettlementClient } from '@oneshot/settlement-ui';
import { useMemo, useRef, useState, type KeyboardEvent } from 'react';

import { OneShotApiClient } from './api/client.js';
import { ErrorBoundary } from './components/ErrorBoundary.js';
import { IntentForm } from './components/IntentForm.js';
import { IntentStatusView } from './components/IntentStatusView.js';
import { ReadinessBanner } from './components/ReadinessBanner.js';
import { RecoverySurface, SettlementSurface } from './components/FrontendSurfaces.js';
import './styles.css';

type Tab = 'create' | 'status' | 'settlement' | 'recovery';

const TAB_ORDER: readonly Tab[] = ['create', 'status', 'settlement', 'recovery'];

const TAB_LABELS: Readonly<Record<Tab, string>> = {
  create: 'Create or replay',
  status: 'Authoritative status',
  settlement: 'Settlement evidence',
  recovery: 'Recovery evidence',
};

export function App() {
  const [activeTab, setActiveTab] = useState<Tab>('create');
  const [selectedIntentId, setSelectedIntentId] = useState('');
  const [authToken, setAuthToken] = useState('');
  const tabRefs = useRef<Record<Tab, HTMLButtonElement | null>>({
    create: null,
    status: null,
    settlement: null,
    recovery: null,
  });
  const client = useMemo(
    () =>
      new OneShotApiClient({
        baseUrl: import.meta.env.VITE_ONESHOT_API_BASE_URL ?? '',
        getAuthToken: () => authToken.trim() || null,
      }),
    [authToken],
  );
  const settlementClient = useMemo(
    () =>
      createSettlementClient({
        baseUrl: import.meta.env.VITE_ONESHOT_API_BASE_URL ?? '',
        getAuthToken: () => authToken.trim() || null,
      }),
    [authToken],
  );

  function showStatus(intentId: string): void {
    setSelectedIntentId(intentId);
    setActiveTab('status');
  }

  function handleTabKeyDown(event: KeyboardEvent<HTMLButtonElement>, currentTab: Tab): void {
    const currentIndex = TAB_ORDER.indexOf(currentTab);
    let nextIndex: number | undefined;

    if (event.key === 'ArrowRight') nextIndex = (currentIndex + 1) % TAB_ORDER.length;
    if (event.key === 'ArrowLeft')
      nextIndex = (currentIndex - 1 + TAB_ORDER.length) % TAB_ORDER.length;
    if (event.key === 'Home') nextIndex = 0;
    if (event.key === 'End') nextIndex = TAB_ORDER.length - 1;
    if (nextIndex === undefined) return;

    event.preventDefault();
    const nextTab = TAB_ORDER[nextIndex];
    if (nextTab === undefined) return;
    setActiveTab(nextTab);
    tabRefs.current[nextTab]?.focus();
  }

  return (
    <ErrorBoundary>
      <div className="app-shell">
        <header className="app-header">
          <p className="eyebrow">ONESHOT / ARC TESTNET</p>
          <h1>One job. Many retries. One settlement.</h1>
          <p>Create a stable payment intent and follow its authoritative state.</p>
          <ReadinessBanner client={client} />
        </header>

        <section className="auth-bar" aria-label="Service authorization">
          <label htmlFor="auth-token-input">Demo service token</label>
          <input
            id="auth-token-input"
            type="password"
            autoComplete="off"
            value={authToken}
            onChange={(event) => setAuthToken(event.target.value)}
          />
          <small>Memory only. Sent as Bearer authorization.</small>
        </section>

        <nav className="tabs" aria-label="Application sections" role="tablist">
          {TAB_ORDER.map((tab) => (
            <button
              key={tab}
              id={`${tab}-tab`}
              ref={(element) => {
                tabRefs.current[tab] = element;
              }}
              type="button"
              role="tab"
              tabIndex={activeTab === tab ? 0 : -1}
              aria-selected={activeTab === tab}
              aria-controls={`${tab}-panel`}
              onClick={() => setActiveTab(tab)}
              onKeyDown={(event) => handleTabKeyDown(event, tab)}
            >
              {TAB_LABELS[tab]}
            </button>
          ))}
        </nav>

        <main id={`${activeTab}-panel`} role="tabpanel" aria-labelledby={`${activeTab}-tab`}>
          {activeTab === 'create' ? (
            <IntentForm client={client} onIntentCreatedOrSelected={showStatus} />
          ) : activeTab === 'status' ? (
            <IntentStatusView client={client} initialIntentId={selectedIntentId} />
          ) : activeTab === 'settlement' ? (
            <SettlementSurface businessIntentId={selectedIntentId} client={settlementClient} />
          ) : (
            <RecoverySurface businessIntentId={selectedIntentId} />
          )}
        </main>
      </div>
    </ErrorBoundary>
  );
}
