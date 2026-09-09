import { useCallback, useMemo, useRef, useState, type KeyboardEvent } from 'react';
import { createSettlementClient, type SettlementClient } from '@oneshot/settlement-ui';
import type { RecoveryClient } from '@oneshot/recovery-ui';
import '@oneshot/recovery-ui/styles.css';
import '@oneshot/settlement-ui/styles.css';

import { OneShotApiClient } from './api/client.js';
import { createApiRecoveryClient } from './api/recovery-client.js';
import {
  selectCredential,
  unconfiguredOperatorSession,
  type UseOperatorSession,
} from './auth/session.js';
import { ErrorBoundary } from './components/ErrorBoundary.js';
import { IntentForm } from './components/IntentForm.js';
import { IntentStatusView } from './components/IntentStatusView.js';
import { LoginGate } from './components/LoginGate.js';
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

export interface AppProps {
  readonly apiClient?: OneShotApiClient;
  readonly settlementClient?: SettlementClient;
  readonly recoveryClient?: RecoveryClient;
  readonly useOperatorSession?: UseOperatorSession;
}

export function App(props: AppProps = {}) {
  const useOperatorSession = props.useOperatorSession ?? unconfiguredOperatorSession;
  const session = useOperatorSession();
  const [activeTab, setActiveTab] = useState<Tab>('create');
  const [selectedIntentId, setSelectedIntentId] = useState('');
  const [machineToken, setMachineToken] = useState('');
  const credentialRef = useRef<string | null>(null);
  credentialRef.current = selectCredential(session, machineToken);
  const getAuthToken = useCallback(() => credentialRef.current, []);
  const tabRefs = useRef<Record<Tab, HTMLButtonElement | null>>({
    create: null,
    status: null,
    settlement: null,
    recovery: null,
  });
  const apiBaseUrl = import.meta.env.VITE_ONESHOT_API_BASE_URL ?? '';
  const apiClient = useMemo(
    () => props.apiClient ?? new OneShotApiClient({ baseUrl: apiBaseUrl, getAuthToken }),
    [apiBaseUrl, getAuthToken, props.apiClient],
  );
  const settlementClient = useMemo(
    () =>
      props.settlementClient ??
      createSettlementClient({ baseUrl: apiBaseUrl, getAuthToken }),
    [apiBaseUrl, getAuthToken, props.settlementClient],
  );
  const recoveryClient = useMemo(
    () =>
      props.recoveryClient ??
      createApiRecoveryClient({ baseUrl: apiBaseUrl, getAuthToken }),
    [apiBaseUrl, getAuthToken, props.recoveryClient],
  );

  function selectIntent(intentId: string): void {
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
          <ReadinessBanner client={apiClient} />
        </header>

        <LoginGate
          session={session}
          machineToken={machineToken}
          onMachineTokenChange={setMachineToken}
        >
          <section className="intent-context" aria-label="Selected business intent">
            <label htmlFor="selected-intent-input">Active Business Intent ID</label>
            <input
              id="selected-intent-input"
              value={selectedIntentId}
              onChange={(event) => setSelectedIntentId(event.target.value)}
              placeholder="Create an intent or enter its stable ID"
            />
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
              <IntentForm client={apiClient} onIntentCreatedOrSelected={selectIntent} />
            ) : activeTab === 'status' ? (
              <IntentStatusView client={apiClient} initialIntentId={selectedIntentId} />
            ) : activeTab === 'settlement' ? (
              <SettlementSurface
                businessIntentId={selectedIntentId.trim()}
                client={settlementClient}
              />
            ) : (
              <RecoverySurface businessIntentId={selectedIntentId.trim()} client={recoveryClient} />
            )}
          </main>
        </LoginGate>
      </div>
    </ErrorBoundary>
  );
}
