import { useCallback, useMemo, useRef, useState, type KeyboardEvent } from 'react';
import type { ActivityResponse } from '@oneshot/contracts';
import { createSettlementClient, type SettlementClient } from '@oneshot/settlement-ui';
import type { RecoveryClient } from '@oneshot/recovery-ui';
import { CommitRing } from '@oneshot/brand';
import '@oneshot/recovery-ui/styles.css';
import '@oneshot/settlement-ui/styles.css';

import { OneShotApiClient } from './api/client.js';
import { JobApiClient } from './api/job-client.js';
import { PaidApiClient } from './api/paid-api-client.js';
import { createApiRecoveryClient } from './api/recovery-client.js';
import {
  selectCredential,
  unconfiguredOperatorSession,
  type UseOperatorSession,
} from './auth/session.js';
import { ErrorBoundary } from './components/ErrorBoundary.js';
import { Hero } from './components/Hero.js';
import { IntentForm } from './components/IntentForm.js';
import { IntentStatusView } from './components/IntentStatusView.js';
import { LoginGate } from './components/LoginGate.js';
import { ReadinessBanner } from './components/ReadinessBanner.js';
import { CircleX402DemoPanel, JobList, JobWorkspace } from './components/JobWorkspace.js';
import { RecoverySurface, SettlementSurface } from './components/FrontendSurfaces.js';
import { applyTheme, readStoredTheme, type Theme } from './theme.js';
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
  readonly jobClient?: JobApiClient;
  readonly paidApiClient?: PaidApiClient;
  readonly settlementClient?: SettlementClient;
  readonly recoveryClient?: RecoveryClient;
  readonly useOperatorSession?: UseOperatorSession;
  /** main.tsx passes the browser route; omitted preserves legacy test composition. */
  readonly route?: string;
}

function LandingPage(props: { readonly theme: Theme; readonly onToggleTheme: () => void }) {
  return (
    <main className="app-shell" aria-label="OneShot public landing page">
      <nav className="top-nav" aria-label="Public navigation">
        <div className="brand-group">
          <CommitRing size={36} title="OneShot" />
          <div className="brand-text">
            <span className="brand-name">OneShot</span>
            <span className="brand-tag">SETTLEMENT ENGINE</span>
          </div>
        </div>
        <div className="nav-status-group">
          <span className="status-badge network-badge">
            <span className="status-dot" />
            Arc Testnet (5042002)
          </span>
          <span className="status-badge token-badge">Native USDC</span>
          <button type="button" className="theme-toggle" onClick={props.onToggleTheme}>
            {props.theme === 'dark' ? 'Light theme' : 'Dark theme'}
          </button>
        </div>
        <a className="nav-console-link" href="/app">
          Open workspace
        </a>
      </nav>
      <header className="app-header hero-section">
        <Hero>
          <p className="eyebrow">RESUMABLE PAID TOOLS / ARC TESTNET</p>
          <h1>Resume the job, not the payment.</h1>
          <p className="hero-lead">
            Approve one company-data report. If an agent restarts, the original task, payment
            evidence and supplier result stay together.
          </p>
          <p className="hero-sublead">
            One job. Many retries. At most one committed settlement. Team-operated testnet
            integration.
          </p>
          <div className="hero-actions">
            <a className="btn-hero-cta" href="/app">
              Open workspace
            </a>
            <a className="btn-hero-secondary" href="#how-it-works">
              How it works
            </a>
          </div>
        </Hero>
      </header>
      <section id="how-it-works" className="invariants-section" aria-labelledby="how-heading">
        <div className="section-header">
          <h2 id="how-heading">A safe paid-tool workflow</h2>
        </div>
        <div className="invariants-grid">
          <article className="invariant-card">
            <h3>Approve the exact purchase</h3>
            <p>
              Review supplier, recipient, amount, network and wallet policy before an external
              payment can start.
            </p>
          </article>
          <article className="invariant-card">
            <h3>Keep one task key</h3>
            <p>
              Replacement agents reuse the same task key, supplier order and Business Intent. A
              changed payload is held as a conflict.
            </p>
          </article>
          <article className="invariant-card">
            <h3>Retrieve the existing result</h3>
            <p>
              Payment uncertainty is reconciled read-only. A committed payment with delayed delivery
              resumes the original supplier order only.
            </p>
          </article>
        </div>
      </section>
    </main>
  );
}

function CabinetPage(props: {
  readonly session: ReturnType<UseOperatorSession>;
  readonly machineToken: string;
  readonly setMachineToken: (value: string) => void;
  readonly apiClient: OneShotApiClient;
  readonly jobClient: JobApiClient;
  readonly paidApiClient: PaidApiClient;
  readonly settlementClient: SettlementClient;
  readonly recoveryClient: RecoveryClient;
  readonly theme: Theme;
  readonly onToggleTheme: () => void;
}) {
  const [section, setSection] = useState<'overview' | 'tools' | 'jobs' | 'recovery'>('overview');
  const [intentId, setIntentId] = useState('');
  const [activity, setActivity] = useState<ActivityResponse | null>(null);
  const [activityError, setActivityError] = useState<string | null>(null);
  const labels = {
    overview: 'Overview',
    tools: 'Tools',
    jobs: 'Jobs',
    recovery: 'Recovery & activity',
  } as const;
  return (
    <main className="app-shell" aria-label="OneShot workspace cabinet">
      <nav className="top-nav" aria-label="Workspace navigation">
        <a className="brand-group" href="/">
          <CommitRing size={36} title="OneShot" />
          <span className="brand-name">OneShot</span>
        </a>
        <div className="nav-status-group">
          <span className="status-badge network-badge">
            <span className="status-dot" />
            Arc Testnet (5042002)
          </span>
          <span className="status-badge token-badge">Native USDC</span>
          <button type="button" className="theme-toggle" onClick={props.onToggleTheme}>
            {props.theme === 'dark' ? 'Light theme' : 'Dark theme'}
          </button>
        </div>
      </nav>
      <LoginGate
        session={props.session}
        machineToken={props.machineToken}
        onMachineTokenChange={props.setMachineToken}
      >
        <header className="app-header hero-section">
          <Hero>
            <p className="eyebrow">WORKSPACE</p>
            <h1>Jobs and results</h1>
            <p className="hero-lead">
              Payments and delivery are separate. No action here can force a replacement payment.
            </p>
          </Hero>
        </header>
        <nav className="tabs" aria-label="Cabinet sections" role="tablist">
          {Object.entries(labels).map(([key, label]) => (
            <button
              key={key}
              type="button"
              role="tab"
              aria-selected={section === key}
              onClick={() => setSection(key as typeof section)}
            >
              {label}
            </button>
          ))}
        </nav>
        {/* Keyed on the section so React remounts the panel on every switch,
            which restarts the fade in `.tab-fade`. */}
        <div className="tab-fade" key={section}>
          {section === 'overview' && (
            <section className="panel">
              <h2>Work needing attention</h2>
              <p>
                Use Tools to start the supported report, Jobs to retrieve a result, and Recovery &
                activity to inspect payment evidence.
              </p>
              <ReadinessBanner client={props.apiClient} />
            </section>
          )}
          {section === 'tools' && (
            <div className="panel-stack">
              <JobWorkspace client={props.jobClient} onSelectIntent={setIntentId} />
              <CircleX402DemoPanel client={props.paidApiClient} onSelectIntent={setIntentId} />
            </div>
          )}
          {section === 'jobs' && <JobList client={props.jobClient} onSelectIntent={setIntentId} />}
          {section === 'recovery' && (
            <section className="panel recovery-panel">
              <h2>Recovery & activity</h2>
              <p>
                Refresh is read-only. Graph observations never change payment authority or permit a
                new settlement.
              </p>
              <button
                type="button"
                className="secondary"
                onClick={() => {
                  setActivityError(null);
                  void props.jobClient
                    .refreshActivity()
                    .then(setActivity)
                    .catch(() => {
                      setActivityError(
                        'Activity refresh is unavailable; payment records remain unchanged.',
                      );
                    });
                }}
              >
                Refresh activity
              </button>
              <p role="status">
                {activityError ??
                  (activity
                    ? `${activity.observation?.freshness ?? 'UNAVAILABLE'} — ${activity.observation?.coverage_note ?? 'No indexed coverage available.'}`
                    : 'No activity refresh yet.')}
              </p>
              {activity && (
                <div className="activity-summary">
                  <p>
                    {activity.recorded_settlement_count} recorded settlement(s),{' '}
                    {activity.uncertain_job_count} uncertain job(s),{' '}
                    {activity.unmatched_transfer_count ?? 0} unmatched indexed transfer(s).
                  </p>
                  {(activity.transfers ?? []).filter((transfer) => transfer.match === 'UNMATCHED')
                    .length > 0 && (
                    <ul aria-label="Unmatched indexed transfers">
                      {(activity.transfers ?? [])
                        .filter((transfer) => transfer.match === 'UNMATCHED')
                        .map((transfer) => (
                          <li key={`${transfer.transaction_hash}:${transfer.log_index}`}>
                            {transfer.transaction_hash.slice(0, 10)}… · log {transfer.log_index} ·{' '}
                            {transfer.amount_atomic} atomic USDC
                          </li>
                        ))}
                    </ul>
                  )}
                </div>
              )}
              <label htmlFor="cabinet-intent">Selected job intent</label>
              <input
                id="cabinet-intent"
                value={intentId}
                onChange={(event) => setIntentId(event.target.value)}
                placeholder="Select a job to inspect evidence"
              />
              <RecoverySurface businessIntentId={intentId} client={props.recoveryClient} />
            </section>
          )}
        </div>
        {intentId && (
          <section className="panel payment-evidence-panel" aria-label="Payment evidence">
            <h2>Payment evidence</h2>
            <p>
              Read-only Arc and Privy evidence for the selected job. This view never creates or
              retries a payment.
            </p>
            <SettlementSurface businessIntentId={intentId} client={props.settlementClient} />
          </section>
        )}
      </LoginGate>
    </main>
  );
}

export function App(props: AppProps = {}) {
  const useOperatorSession = props.useOperatorSession ?? unconfiguredOperatorSession;
  const session = useOperatorSession();
  const [activeTab, setActiveTab] = useState<Tab>('create');
  const [selectedIntentId, setSelectedIntentId] = useState('');
  const [machineToken, setMachineToken] = useState('');
  const [theme, setTheme] = useState<Theme>(() => readStoredTheme());

  function toggleTheme(): void {
    const next: Theme = theme === 'dark' ? 'light' : 'dark';
    setTheme(next);
    applyTheme(next);
  }
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
    () => props.settlementClient ?? createSettlementClient({ baseUrl: apiBaseUrl, getAuthToken }),
    [apiBaseUrl, getAuthToken, props.settlementClient],
  );
  const recoveryClient = useMemo(
    () => props.recoveryClient ?? createApiRecoveryClient({ baseUrl: apiBaseUrl, getAuthToken }),
    [apiBaseUrl, getAuthToken, props.recoveryClient],
  );
  const jobClient = useMemo(
    () => props.jobClient ?? new JobApiClient({ baseUrl: apiBaseUrl, getAuthToken }),
    [apiBaseUrl, getAuthToken, props.jobClient],
  );
  const paidApiClient = useMemo(
    () => props.paidApiClient ?? new PaidApiClient({ baseUrl: apiBaseUrl, getAuthToken }),
    [apiBaseUrl, getAuthToken, props.paidApiClient],
  );

  if (props.route === '/') return <LandingPage theme={theme} onToggleTheme={toggleTheme} />;
  if (props.route?.startsWith('/app')) {
    return (
      <CabinetPage
        session={session}
        machineToken={machineToken}
        setMachineToken={setMachineToken}
        apiClient={apiClient}
        jobClient={jobClient}
        paidApiClient={paidApiClient}
        settlementClient={settlementClient}
        recoveryClient={recoveryClient}
        theme={theme}
        onToggleTheme={toggleTheme}
      />
    );
  }

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
        <nav className="top-nav" aria-label="Site Navigation">
          <div className="brand-group">
            <CommitRing size={36} title="OneShot" />
            <div className="brand-text">
              <span className="brand-name">OneShot</span>
              <span className="brand-tag">SETTLEMENT ENGINE</span>
            </div>
          </div>

          <div className="nav-status-group">
            <span className="status-badge network-badge">
              <span className="status-dot"></span>
              Arc Testnet (5042002)
            </span>
            <span className="status-badge token-badge">Native USDC</span>
            <button type="button" className="theme-toggle" onClick={toggleTheme}>
              {theme === 'dark' ? 'Light theme' : 'Dark theme'}
            </button>
          </div>

          <a href="#console" className="nav-console-link">
            Operator Console ↓
          </a>
        </nav>

        <header className="app-header hero-section">
          <Hero>
            <p className="eyebrow">ONESHOT / ARC TESTNET</p>
            <h1>One job. Many retries. One settlement.</h1>
            <p className="hero-lead">
              Deterministic payment lifecycle with pre-execution policy checks, idempotency
              enforcement, and hashless recovery on Arc.
            </p>
            <div className="hero-actions">
              <a href="#console" className="btn-hero-cta">
                Open Operator Console ↓
              </a>
              <a
                href="https://testnet.arcscan.app"
                target="_blank"
                rel="noreferrer"
                className="btn-hero-secondary"
              >
                ArcScan Explorer ↗
              </a>
            </div>
          </Hero>
          <ReadinessBanner client={apiClient} />
        </header>

        <section className="invariants-section" aria-label="System Invariants">
          <div className="section-header">
            <span className="section-eyebrow">ARCHITECTURAL GUARANTEES</span>
            <h2>Scoped payment safety</h2>
          </div>

          <div className="invariants-grid">
            <article className="invariant-card">
              <div className="invariant-index">01 / ATOMIC PRECISION</div>
              <h3>At-most-once settlement</h3>
              <p>
                Stable intent identity keeps retries and replays on one approved settlement path.
              </p>
            </article>

            <article className="invariant-card">
              <div className="invariant-index">02 / PRE-EXECUTION POLICY</div>
              <h3>Pre-Flight Policy Gating</h3>
              <p>
                Dynamic balance verification, recipient allowlists, and operator volume caps run
                prior to mempool submission, denying unauthorized calls before gas is consumed.
              </p>
            </article>

            <article className="invariant-card">
              <div className="invariant-index">03 / HASHLESS RECOVERY</div>
              <h3>Cryptographic Reconciliation</h3>
              <p>
                When RPC gateways timeout or transaction hashes are dropped during transit, the
                engine queries authoritative ledger receipts and Subgraph indexers to discover truth
                safely.
              </p>
            </article>

            <article className="invariant-card">
              <div className="invariant-index">04 / CARDINALITY INVARIANT</div>
              <h3>Bounded State Machine</h3>
              <p>
                Strict 1:1 business-intent-to-settlement mapping across all ledger transitions. An
                intent marked UNKNOWN strictly freezes all concurrent payouts until proof is
                observed.
              </p>
            </article>
          </div>
        </section>

        <section className="console-container" id="console" aria-label="Operator Console Workspace">
          <div className="console-header">
            <span className="section-eyebrow">WORKSPACE</span>
            <h2>Authoritative Execution Engine</h2>
            <p className="console-subtitle">
              Inspect real-time ledger states, construct validated payment intents, or audit
              cryptographic settlement and recovery evidence.
            </p>
          </div>

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

            <main
              key={activeTab}
              className="tab-fade"
              id={`${activeTab}-panel`}
              role="tabpanel"
              aria-labelledby={`${activeTab}-tab`}
            >
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
                <RecoverySurface
                  businessIntentId={selectedIntentId.trim()}
                  client={recoveryClient}
                />
              )}
            </main>
          </LoginGate>
        </section>

        <footer className="app-footer">
          <div className="footer-top">
            <div className="footer-brand">
              <div className="brand-group">
                <CommitRing size={28} />
                <span className="brand-name">OneShot</span>
              </div>
              <p className="footer-desc">
                Stablecoin-native payment lifecycle engine with pre-flight policy gating and
                subgraph recovery on Arc Testnet.
              </p>
            </div>

            <div className="footer-meta">
              <div className="meta-col">
                <span className="meta-label">NETWORK</span>
                <span className="meta-value">Arc Testnet (5042002)</span>
              </div>
              <div className="meta-col">
                <span className="meta-label">SETTLEMENT ASSET</span>
                <span className="meta-value">Native USDC (ERC-20)</span>
              </div>
              <div className="meta-col">
                <span className="meta-label">TOKEN CONTRACT</span>
                <code className="meta-code">0x3600...0000</code>
              </div>
            </div>
          </div>

          <div className="footer-bottom">
            <span>OneShot Protocol · Built for Circle Arc Challenge</span>
            <div className="footer-links">
              <a href="https://testnet.arcscan.app" target="_blank" rel="noreferrer">
                ArcScan
              </a>
              <a href="https://github.com/SWOFART/OneShot" target="_blank" rel="noreferrer">
                GitHub
              </a>
            </div>
          </div>
        </footer>
      </div>
    </ErrorBoundary>
  );
}
