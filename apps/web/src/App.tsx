import { useMemo, useState } from 'react';
import {
  createSettlementClient,
  SettlementDetailsRoute,
  type SettlementClient,
} from '@oneshot/settlement-ui';
import { RecoveryRoute, type RecoveryClient } from '@oneshot/recovery-ui';
import '@oneshot/recovery-ui/styles.css';
import '@oneshot/settlement-ui/styles.css';

import { OneShotApiClient } from './api/client.js';
import { createApiRecoveryClient } from './api/recovery-client.js';
import { ErrorBoundary } from './components/ErrorBoundary.js';
import { IntentForm } from './components/IntentForm.js';
import { IntentStatusView } from './components/IntentStatusView.js';
import { ReadinessBanner } from './components/ReadinessBanner.js';
import './styles.css';

type Tab = 'create' | 'status' | 'settlement' | 'recovery';

export interface AppProps {
  readonly apiClient?: OneShotApiClient;
  readonly settlementClient?: SettlementClient;
  readonly recoveryClient?: RecoveryClient;
}

const TABS: readonly { readonly id: Tab; readonly label: string }[] = [
  { id: 'create', label: 'Create or replay' },
  { id: 'status', label: 'Authoritative status' },
  { id: 'settlement', label: 'Settlement details' },
  { id: 'recovery', label: 'Recovery evidence' },
];

export function App(props: AppProps = {}) {
  const [activeTab, setActiveTab] = useState<Tab>('create');
  const [selectedIntentId, setSelectedIntentId] = useState('');
  const [authToken, setAuthToken] = useState('');
  const apiBaseUrl = import.meta.env.VITE_ONESHOT_API_BASE_URL ?? '';
  const apiClient = useMemo(
    () =>
      props.apiClient ??
      new OneShotApiClient({ baseUrl: apiBaseUrl, getAuthToken: () => authToken.trim() || null }),
    [apiBaseUrl, authToken, props.apiClient],
  );
  const settlementClient = useMemo(
    () =>
      props.settlementClient ??
      createSettlementClient({
        baseUrl: apiBaseUrl,
        getAuthToken: () => authToken.trim() || null,
      }),
    [apiBaseUrl, authToken, props.settlementClient],
  );
  const recoveryClient = useMemo(
    () =>
      props.recoveryClient ??
      createApiRecoveryClient({
        baseUrl: apiBaseUrl,
        getAuthToken: () => authToken.trim() || null,
      }),
    [apiBaseUrl, authToken, props.recoveryClient],
  );

  function selectIntent(intentId: string): void {
    setSelectedIntentId(intentId);
  }

  return (
    <ErrorBoundary>
      <div className="app-shell">
        <header className="app-header">
          <p className="eyebrow">ONESHOT / ARC TESTNET</p>
          <h1>One job. Many retries. One settlement.</h1>
          <p>Create a stable payment intent and follow its authoritative state.</p>
          <ReadinessBanner client={apiClient} />
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

        <section className="intent-context" aria-label="Selected business intent">
          <label htmlFor="selected-intent-input">Active Business Intent ID</label>
          <input
            id="selected-intent-input"
            value={selectedIntentId}
            onChange={(event) => setSelectedIntentId(event.target.value)}
            placeholder="Create an intent or enter its stable ID"
          />
        </section>

        <nav className="tabs" aria-label="Application sections">
          {TABS.map((tab) => (
            <button
              key={tab.id}
              type="button"
              aria-pressed={activeTab === tab.id}
              onClick={() => setActiveTab(tab.id)}
            >
              {tab.label}
            </button>
          ))}
        </nav>

        <div>
          {activeTab === 'create' && (
            <IntentForm client={apiClient} onIntentCreatedOrSelected={selectIntent} />
          )}
          {activeTab === 'status' && (
            <IntentStatusView client={apiClient} initialIntentId={selectedIntentId} />
          )}
          {activeTab === 'settlement' &&
            (selectedIntentId.trim() ? (
              <SettlementDetailsRoute
                businessIntentId={selectedIntentId.trim()}
                client={settlementClient}
              />
            ) : (
              <p className="notice">Enter a Business Intent ID to read settlement details.</p>
            ))}
          {activeTab === 'recovery' &&
            (selectedIntentId.trim() ? (
              <RecoveryRoute businessIntentId={selectedIntentId.trim()} client={recoveryClient} />
            ) : (
              <p className="notice">Enter a Business Intent ID to read recovery evidence.</p>
            ))}
        </div>
      </div>
    </ErrorBoundary>
  );
}
