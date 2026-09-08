import { useMemo, useState } from 'react';

import { OneShotApiClient } from './api/client.js';
import { ErrorBoundary } from './components/ErrorBoundary.js';
import { IntentForm } from './components/IntentForm.js';
import { IntentStatusView } from './components/IntentStatusView.js';
import { ReadinessBanner } from './components/ReadinessBanner.js';
import './styles.css';

type Tab = 'create' | 'status';

export function App() {
  const [activeTab, setActiveTab] = useState<Tab>('create');
  const [selectedIntentId, setSelectedIntentId] = useState('');
  const [authToken, setAuthToken] = useState('');
  const client = useMemo(
    () =>
      new OneShotApiClient({
        baseUrl: import.meta.env.VITE_ONESHOT_API_BASE_URL ?? '',
        getAuthToken: () => authToken.trim() || null,
      }),
    [authToken],
  );

  function showStatus(intentId: string): void {
    setSelectedIntentId(intentId);
    setActiveTab('status');
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
          <button
            type="button"
            role="tab"
            aria-selected={activeTab === 'create'}
            aria-controls="create-panel"
            onClick={() => setActiveTab('create')}
          >
            Create or replay
          </button>
          <button
            type="button"
            role="tab"
            aria-selected={activeTab === 'status'}
            aria-controls="status-panel"
            onClick={() => setActiveTab('status')}
          >
            Authoritative status
          </button>
        </nav>

        <main id={activeTab === 'create' ? 'create-panel' : 'status-panel'} role="tabpanel">
          {activeTab === 'create' ? (
            <IntentForm client={client} onIntentCreatedOrSelected={showStatus} />
          ) : (
            <IntentStatusView client={client} initialIntentId={selectedIntentId} />
          )}
        </main>
      </div>
    </ErrorBoundary>
  );
}
