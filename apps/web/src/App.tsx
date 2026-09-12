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
import {
  PaymentProtectionPanel,
  SpendingRulesPanel,
  TeamAccessPanel,
} from './components/WorkspacePanels.js';
import { applyTheme, readStoredTheme, type Theme } from './theme.js';
import './styles.css';

type Tab = 'create' | 'status' | 'settlement' | 'recovery';
const TAB_ORDER: readonly Tab[] = ['create', 'status', 'settlement', 'recovery'];
const TAB_LABELS: Readonly<Record<Tab, string>> = {
  create: 'Create request',
  status: 'Payment status',
  settlement: 'Payment proof',
  recovery: 'Protection checks',
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
            Arc Testnet
          </span>
          <span className="status-badge token-badge">USDC</span>
          <button type="button" className="theme-toggle" onClick={props.onToggleTheme}>
            {props.theme === 'dark' ? 'Light theme' : 'Dark theme'}
          </button>
        </div>
        <a className="nav-console-link" href="/app">
          Open workspace
        </a>
      </nav>
      <header className="app-header hero-section">
        <Hero height={620}>
          <p className="eyebrow">RESUMABLE PAID SERVICES / ARC TESTNET</p>
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
              Review the service, destination, amount, network and wallet rule before payment can
              start.
            </p>
          </article>
          <article className="invariant-card">
            <h3>Keep one task key</h3>
            <p>
              Retries reuse the same request key and supplier order. Changed details are held for
              review.
            </p>
          </article>
          <article className="invariant-card">
            <h3>Retrieve the existing result</h3>
            <p>
              Payment checks are read-only. If delivery is delayed, the original supplier request
              resumes without another charge.
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
  const [section, setSection] = useState<
    'overview' | 'services' | 'requests' | 'protection' | 'spending' | 'access'
  >('overview');
  const [intentId, setIntentId] = useState('');
  const [activity, setActivity] = useState<ActivityResponse | null>(null);
  const [activityError, setActivityError] = useState<string | null>(null);
  const labels = {
    overview: 'Overview',
    services: 'API services',
    requests: 'Requests',
    protection: 'Payment protection',
    spending: 'Spending rules',
    access: 'Team & access',
  } as const;

  function selectRequest(id: string): void {
    setIntentId(id);
    setSection('protection');
  }
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
            Arc Testnet
          </span>
          <span className="status-badge token-badge">USDC</span>
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
        <header className="app-header hero-section cabinet-header">
          <Hero>
            <p className="eyebrow">WORKSPACE</p>
            <h1>Your payment workspace</h1>
            <p className="hero-lead">
              Run approved paid APIs, keep one payment identity per request, and recover results
              without paying twice.
            </p>
          </Hero>
        </header>
        <details className="walkthrough">
          <summary>Walk through a real request</summary>
          <p>
            Use the actual service, wallet and result. This guide never creates or pays a request
            for you.
          </p>
          <ol>
            <li>
              <strong>Review controls.</strong> Check the execution wallet’s active Privy rules and
              the permitted amount and recipient.
            </li>
            <li>
              <strong>Prepare a request.</strong> Open API services. For the team report, enter a
              subject, recipient and amount, then review payment details. Circle Dataset API gets
              its price from the service.
            </li>
            <li>
              <strong>Approve deliberately.</strong> Read “Recipient receives”, the destination and
              Arc Testnet network. Keep the request key. Only the explicit approval button starts a
              payment request.
            </li>
            <li>
              <strong>Read the result.</strong> Open Requests for a team report. For Circle Dataset
              API, use Check payment status in its service card. Inspect the actual payment state
              and result.
            </li>
            <li>
              <strong>Demonstrate recovery.</strong> For a team report, resume the existing result
              from Requests. For Circle, replay the same request only when its payment is confirmed.
              An uncertain payment needs investigation, not a new key.
            </li>
          </ol>
          <p>
            Record the actual outcome. If a service is unavailable or a payment stays uncertain,
            explain that state instead of presenting a completed demo.
          </p>
          <button
            type="button"
            className="secondary compact"
            onClick={() => setSection('services')}
          >
            Open services for walkthrough
          </button>
        </details>
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
        {section === 'overview' && (
          <section className="panel workspace-overview">
            <p className="eyebrow">ONE JOB · ONE PAYMENT</p>
            <h2>What would you like to do?</h2>
            <p>
              Choose a connected API service, review its exact quote, and follow the result from one
              durable request. Technical evidence stays available when you need it.
            </p>
            <div className="workspace-action-grid">
              <button type="button" onClick={() => setSection('services')}>
                Run an API service
              </button>
              <button type="button" className="secondary" onClick={() => setSection('requests')}>
                View requests
              </button>
              <button type="button" className="secondary" onClick={() => setSection('protection')}>
                See payment protection
              </button>
            </div>
            <ReadinessBanner client={props.apiClient} />
          </section>
        )}
        {section === 'services' && (
          <>
            <JobWorkspace client={props.jobClient} onSelectIntent={selectRequest} />
            <CircleX402DemoPanel client={props.paidApiClient} onSelectIntent={selectRequest} />
          </>
        )}
        {section === 'requests' && (
          <JobList client={props.jobClient} onSelectIntent={selectRequest} />
        )}
        {section === 'protection' && (
          <PaymentProtectionPanel
            activity={activity}
            activityError={activityError}
            intentId={intentId}
            recoveryClient={props.recoveryClient}
            settlementClient={props.settlementClient}
            onRefresh={() => {
              setActivityError(null);
              void props.jobClient
                .refreshActivity()
                .then(setActivity)
                .catch(() => {
                  setActivityError(
                    'Payment activity is unavailable right now. Existing payment records are unchanged.',
                  );
                });
            }}
          />
        )}
        {section === 'spending' && <SpendingRulesPanel />}
        {section === 'access' && <TeamAccessPanel status={props.session.status} />}
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
              Arc Testnet
            </span>
            <span className="status-badge token-badge">USDC</span>
            <button type="button" className="theme-toggle" onClick={toggleTheme}>
              {theme === 'dark' ? 'Light theme' : 'Dark theme'}
            </button>
          </div>

          <a href="#console" className="nav-console-link">
            Open payment console ↓
          </a>
        </nav>

        <header className="app-header hero-section">
          <Hero>
            <p className="eyebrow">ONESHOT / ARC TESTNET</p>
            <h1>One job. Many retries. One settlement.</h1>
            <p className="hero-lead">
              A durable payment workflow with wallet policy checks, retry protection, and read-only
              recovery on Arc.
            </p>
            <div className="hero-actions">
              <a href="#console" className="btn-hero-cta">
                Open payment console ↓
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
              <div className="invariant-index">01 / PAYMENT SAFETY</div>
              <h3>One payment per request</h3>
              <p>A stable request key keeps retries on one approved payment path.</p>
            </article>

            <article className="invariant-card">
              <div className="invariant-index">02 / WALLET POLICY</div>
              <h3>Approved before sending</h3>
              <p>
                Destination, amount and spending rules are checked before the worker can submit a
                payment.
              </p>
            </article>

            <article className="invariant-card">
              <div className="invariant-index">03 / NETWORK EVIDENCE</div>
              <h3>Read-only recovery</h3>
              <p>
                If a response is delayed, OneShot checks the ledger and network observations without
                submitting another payment.
              </p>
            </article>

            <article className="invariant-card">
              <div className="invariant-index">04 / REQUEST LIFECYCLE</div>
              <h3>Safe hold on uncertainty</h3>
              <p>
                When payment proof is incomplete, the request pauses until it is verified. No second
                payment is allowed.
              </p>
            </article>
          </div>
        </section>

        <section className="console-container" id="console" aria-label="Payment workspace">
          <div className="console-header">
            <span className="section-eyebrow">WORKSPACE</span>
            <h2>Your payment workspace</h2>
            <p className="console-subtitle">
              Run and protect API payments: create a request, review the exact payment, and inspect
              proof only when you need it.
            </p>
          </div>

          <LoginGate
            session={session}
            machineToken={machineToken}
            onMachineTokenChange={setMachineToken}
          >
            <details className="intent-context technical-details">
              <summary>Open a request by identifier (advanced)</summary>
              <label htmlFor="selected-intent-input">Request identifier</label>
              <input
                id="selected-intent-input"
                value={selectedIntentId}
                onChange={(event) => setSelectedIntentId(event.target.value)}
                placeholder="Create a request or enter its stable identifier"
              />
            </details>

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
                <span className="meta-value">Arc Testnet</span>
              </div>
              <div className="meta-col">
                <span className="meta-label">SETTLEMENT ASSET</span>
                <span className="meta-value">USDC</span>
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
