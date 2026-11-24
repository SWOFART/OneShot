import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { ActivityResponse } from '@oneshot/contracts';
import { createSettlementClient, type SettlementClient } from '@oneshot/settlement-ui';
import type { RecoveryClient } from '@oneshot/recovery-ui';
import { CommitRing } from '@oneshot/brand';
import '@oneshot/recovery-ui/styles.css';
import '@oneshot/settlement-ui/styles.css';

import { OneShotApiClient } from './api/client.js';
import { JobApiClient } from './api/job-client.js';
import { createApiRecoveryClient } from './api/recovery-client.js';
import {
  selectCredential,
  unconfiguredOperatorSession,
  type UseOperatorSession,
  type UserWalletSession,
} from './auth/session.js';
import { Hero } from './components/Hero.js';
import { browserSettlementChain } from './wallet-chain.js';
import { LoginGate } from './components/LoginGate.js';
import { McpDocsPage } from './components/McpDocsPage.js';
import { McpProfile } from './components/McpProfile.js';
import { ReadinessBanner } from './components/ReadinessBanner.js';
import { JobList, JobWorkspace } from './components/JobWorkspace.js';
import { PaymentProtectionPanel } from './components/WorkspacePanels.js';
import { applyTheme, readStoredTheme, type Theme } from './theme.js';
import './styles.css';

export interface AppProps {
  readonly apiClient?: OneShotApiClient;
  readonly jobClient?: JobApiClient;
  readonly settlementClient?: SettlementClient;
  readonly recoveryClient?: RecoveryClient;
  readonly useOperatorSession?: UseOperatorSession;
  readonly userWallet?: UserWalletSession;
  /** Optional prepared MCP job to open directly in the wallet-signing workspace. */
  readonly mcpJobId?: string;
  /** Browser path; omitted or unknown paths show the public landing page. */
  readonly route?: string;
}

function SunIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true" width="18" height="18">
      <circle cx="12" cy="12" r="4" fill="none" stroke="currentColor" strokeWidth="1.75" />
      <path
        d="M12 2.5v2.2M12 19.3v2.2M2.5 12h2.2M19.3 12h2.2M5.1 5.1l1.6 1.6M17.3 17.3l1.6 1.6M18.9 5.1l-1.6 1.6M6.7 17.3l-1.6 1.6"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.75"
        strokeLinecap="round"
      />
    </svg>
  );
}

function MoonIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true" width="18" height="18">
      <path
        d="M15.5 3.2a8.2 8.2 0 1 0 5.3 14.2A8.4 8.4 0 0 1 15.5 3.2Z"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.75"
        strokeLinejoin="round"
      />
    </svg>
  );
}

function SiteFooter() {
  return (
    <footer className="site-footer">
      <p>One job. Many retries. At most one committed settlement.</p>
      <nav aria-label="Footer">
        <a href="#how-it-works">How it works</a>
        <a href="/docs/mcp">Agent docs</a>
        <a href="mailto:work@kapustazh.dev">work@kapustazh.dev</a>
      </nav>
    </footer>
  );
}

function LandingPage(props: { readonly theme: Theme; readonly onToggleTheme: () => void }) {
  return (
    <main id="main-content" className="app-shell" aria-label="OneShot public landing page">
      <a className="skip-link" href="#main-content">
        Skip to content
      </a>
      <nav className="top-nav" aria-label="Public navigation">
        <div className="brand-group">
          <CommitRing size={36} title="OneShot" />
          <div className="brand-text">
            <span className="brand-name">OneShot</span>
            <span className="brand-tag">SETTLEMENT ENGINE</span>
          </div>
        </div>
        <div className="nav-end">
          <button
            type="button"
            className="theme-icon"
            onClick={props.onToggleTheme}
            aria-label={props.theme === 'dark' ? 'Switch to light theme' : 'Switch to dark theme'}
          >
            {props.theme === 'dark' ? <SunIcon /> : <MoonIcon />}
          </button>
          <a className="nav-console-link" href="/app">
            Open workspace
          </a>
        </div>
      </nav>
      <header className="app-header hero-section">
        <Hero>
          <p className="eyebrow">Settlement infrastructure</p>
          <h1>One payment identity across every retry.</h1>
          <p className="hero-lead">
            OneShot is settlement infrastructure for companies whose agents buy services. An
            approved obligation keeps one USDC payment, even when the agent crashes, retries, or is
            replaced.
          </p>
          <p className="hero-sublead">
            Built for businesses and the platforms that sell to their agents. The settlement rail
            is chosen per deployment.
          </p>
          <div className="hero-actions">
            <a className="btn-hero-cta" href="/app">
              Open workspace
            </a>
            <a className="btn-hero-secondary" href="/docs/mcp">
              Connect an agent
            </a>
            <a className="btn-hero-secondary" href="#how-it-works">
              How it works
            </a>
          </div>
        </Hero>
      </header>
      <section id="how-it-works" className="invariants-section" aria-labelledby="how-heading">
        <div className="section-header">
          <h2 id="how-heading">How an operator stays in control</h2>
          <p>The same business intent survives retries. The payment does not.</p>
        </div>
        <div className="invariants-grid">
          <article className="invariant-card">
            <h3>Name the obligation</h3>
            <p>
              One stable request key covers the service, recipient, amount, and chain. A changed
              detail is held for review instead of becoming a second payment.
            </p>
          </article>
          <article className="invariant-card">
            <h3>Grant one settlement</h3>
            <p>
              Durable state decides who may submit. Wallet policy can only narrow that. A crash
              after broadcast becomes <code>UNKNOWN</code> until it is reconciled.
            </p>
          </article>
          <article className="invariant-card">
            <h3>Read the evidence</h3>
            <p>
              Operators and replacement agents see the same payment record. A delayed index is not
              treated as proof that the payment never happened.
            </p>
          </article>
        </div>
      </section>
      <section className="guarantee-section" aria-labelledby="guarantee-heading">
        <p className="eyebrow">The guarantee</p>
        <h2 id="guarantee-heading">One intent. Many attempts. One settlement.</h2>
        <p>
          OneShot owns the payment record. Retries, restarts, and parallel workers converge on that
          record. An uncertain payment stays <code>UNKNOWN</code> until receipt evidence resolves
          it.
        </p>
      </section>
      <section className="audience-section" aria-labelledby="audience-heading">
        <div className="section-header">
          <h2 id="audience-heading">Who it is for</h2>
          <p>Two kinds of company, one payment record.</p>
        </div>
        <div className="invariants-grid">
          <article className="invariant-card">
            <h3>Businesses running agents</h3>
            <p>
              Approve a purchase once. If the agent or the worker restarts, the workspace shows the
              same intent, attempt history, and settlement evidence.
            </p>
          </article>
          <article className="invariant-card">
            <h3>Platforms selling to agents</h3>
            <p>
              Connect an agent with the MCP payment tools. The user wallet signs the payment.
              OneShot prepares the request and verifies the receipt.
            </p>
          </article>
        </div>
      </section>
      <p className="chains-note">
        OneShot is chain-agnostic. Each deployment settles on the rail its operator selects, and
        the payment identity stays the same. Chain configuration is documented for operators.
      </p>
      <SiteFooter />
    </main>
  );
}

function CabinetPage(props: {
  readonly session: ReturnType<UseOperatorSession>;
  readonly machineToken: string;
  readonly setMachineToken: (value: string) => void;
  readonly apiClient: OneShotApiClient;
  readonly jobClient: JobApiClient;
  readonly settlementClient: SettlementClient;
  readonly recoveryClient: RecoveryClient;
  readonly theme: Theme;
  readonly onToggleTheme: () => void;
  readonly userWallet?: UserWalletSession;
  readonly mcpJobId?: string;
}) {
  const [section, setSection] = useState<
    'overview' | 'services' | 'requests' | 'protection' | 'profile'
  >(props.mcpJobId ? 'services' : 'overview');
  const [intentId, setIntentId] = useState('');
  const [activity, setActivity] = useState<ActivityResponse | null>(null);
  const [activityError, setActivityError] = useState<string | null>(null);
  const workspaceUnlocked =
    props.session.status === 'SIGNED_IN' || props.machineToken.trim() !== '';
  const refreshActivity = useCallback(async (): Promise<void> => {
    if (!workspaceUnlocked || typeof props.jobClient.refreshActivity !== 'function') return;
    setActivityError(null);
    try {
      setActivity(await props.jobClient.refreshActivity());
    } catch {
      setActivityError(
        'Payment activity is unavailable right now. Existing payment records are unchanged.',
      );
    }
  }, [props.jobClient, workspaceUnlocked]);

  useEffect(() => {
    void refreshActivity();
  }, [refreshActivity]);

  useEffect(() => {
    if (section === 'protection') void refreshActivity();
  }, [refreshActivity, section]);

  const labels = {
    overview: 'Overview',
    services: 'Payment services',
    requests: 'Requests',
    protection: 'Payment proof',
    profile: 'Profile',
  } as const;

  function selectRequest(id: string): void {
    setIntentId(id);
    setSection('protection');
  }
  return (
    <main id="main-content" className="app-shell" aria-label="OneShot workspace cabinet">
      <a className="skip-link" href="#main-content">
        Skip to content
      </a>
      <nav className="top-nav" aria-label="Workspace navigation">
        <a className="brand-group" href="/">
          <CommitRing size={36} title="OneShot" />
          <span className="brand-name">OneShot</span>
        </a>
        <div className="nav-status-group">
          <span className="status-badge network-badge">
            <span className="status-dot" />
            {browserSettlementChain().displayName}
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
        {...(props.userWallet ? { userWallet: props.userWallet } : {})}
      >
        <header className="app-header hero-section cabinet-header">
          <Hero>
            <p className="eyebrow">WORKSPACE</p>
            <h1>Your payment workspace</h1>
            <p className="hero-lead">
              Run approved Arc payments, keep one payment identity per request, and recover results
              without paying twice.
            </p>
          </Hero>
        </header>
        <details className="walkthrough">
          <summary>Walk through a real payment</summary>
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
              <strong>Prepare a request.</strong> Open Payment services. For a direct Arc payment,
              enter its purpose, recipient and amount, then review the exact payment details.
            </li>
            <li>
              <strong>Approve deliberately.</strong> Read “Recipient receives”, the destination and
              {browserSettlementChain().displayName} network. Keep the request key. Only the
              explicit approval button starts a payment request.
            </li>
            <li>
              <strong>Read the result.</strong> Open Requests and inspect the actual payment state
              and result.
            </li>
            <li>
              <strong>Demonstrate recovery.</strong> Resume the existing sample result from
              Requests. An uncertain payment needs investigation, not a new key.
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
        {/* Keyed on the section so React remounts the panel on every
            switch, which restarts the fade in `.tab-fade`. */}
        <div className="tab-fade" key={section}>
          {section === 'overview' && (
            <section className="panel workspace-overview">
              <p className="eyebrow">ONE JOB · ONE PAYMENT</p>
              <h2>What would you like to do?</h2>
              <p>
                Send one direct USDC payment on {browserSettlementChain().displayName}: review the
                exact quote, approve once, and follow the same durable request from approval to
                proof. Payment evidence stays available whenever you need it.
              </p>
              <div className="workspace-action-grid">
                <button type="button" onClick={() => setSection('services')}>
                  Run a direct payment
                </button>
                <button type="button" className="secondary" onClick={() => setSection('requests')}>
                  View requests
                </button>
                <button
                  type="button"
                  className="secondary"
                  onClick={() => setSection('protection')}
                >
                  See payment proof
                </button>
              </div>
              <ReadinessBanner client={props.apiClient} />
            </section>
          )}
          {section === 'services' && (
            <div className="panel-stack">
              <JobWorkspace
                client={props.jobClient}
                {...(props.mcpJobId ? { initialJobId: props.mcpJobId } : {})}
                {...(props.userWallet ? { userWallet: props.userWallet } : {})}
                onSelectIntent={selectRequest}
              />
            </div>
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
              onRefresh={() => void refreshActivity()}
            />
          )}
          {section === 'profile' && <McpProfile client={props.jobClient} />}
        </div>
      </LoginGate>
    </main>
  );
}

export function App(props: AppProps = {}) {
  const useOperatorSession = props.useOperatorSession ?? unconfiguredOperatorSession;
  const session = useOperatorSession();
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

  if (props.route === '/') return <LandingPage theme={theme} onToggleTheme={toggleTheme} />;
  if (props.route?.startsWith('/docs/mcp')) {
    return <McpDocsPage theme={theme} onToggleTheme={toggleTheme} />;
  }
  if (props.route?.startsWith('/app')) {
    return (
      <CabinetPage
        session={session}
        machineToken={machineToken}
        setMachineToken={setMachineToken}
        apiClient={apiClient}
        jobClient={jobClient}
        settlementClient={settlementClient}
        recoveryClient={recoveryClient}
        {...(props.userWallet ? { userWallet: props.userWallet } : {})}
        {...(props.mcpJobId ? { mcpJobId: props.mcpJobId } : {})}
        theme={theme}
        onToggleTheme={toggleTheme}
      />
    );
  }

  return <LandingPage theme={theme} onToggleTheme={toggleTheme} />;
}
