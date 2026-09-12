import type { ActivityResponse } from '@oneshot/contracts';
import type { RecoveryClient } from '@oneshot/recovery-ui';
import type { SettlementClient } from '@oneshot/settlement-ui';

import type { OperatorSessionStatus } from '../auth/session.js';
import { RecoverySurface, SettlementSurface } from './FrontendSurfaces.js';
import { maskIdentifier } from './workspace-copy.js';

export function SpendingRulesPanel() {
  return (
    <section className="panel workspace-panel" aria-label="Spending rules">
      <header className="panel-heading">
        <div>
          <p className="eyebrow">PAYMENT CONTROLS</p>
          <h2>Spending rules</h2>
        </div>
        <span className="badge tone-neutral">Live policy not loaded</span>
      </header>
      <p className="panel-lede">
        This page explains the payment controls. It does not currently read the active Privy policy,
        so it cannot confirm your wallet’s limit or permitted destinations.
      </p>
      <div className="workspace-fact-grid">
        <article>
          <span>Per request</span>
          <strong>Check the active policy</strong>
          <p>
            The wallet limit and OneShot’s configured limit both apply. No $1 limit is assumed here.
          </p>
        </article>
        <article>
          <span>Allowed destination</span>
          <strong>Review the full recipient</strong>
          <p>Preview shows who receives the payment. The worker checks the configured allowlist.</p>
        </article>
        <article>
          <span>Settlement network</span>
          <strong>Arc Testnet · USDC</strong>
          <p>Testnet only in this workspace.</p>
        </article>
        <article>
          <span>Retry protection</span>
          <strong>One payment per request</strong>
          <p>Repeating a request reuses its payment identity.</p>
        </article>
      </div>
      <details className="technical-details">
        <summary>Why can’t I edit the rule here?</summary>
        <p>
          The policy owner manages the active rules in Privy. Site access does not grant permission
          to change wallet rules. A site editor needs owner authorization and confirmation from
          Privy before it can show a change as applied.
        </p>
      </details>
    </section>
  );
}

export function TeamAccessPanel({ status }: { readonly status: OperatorSessionStatus }) {
  const connected = status === 'SIGNED_IN';
  return (
    <section className="panel workspace-panel" aria-label="Team and access">
      <header className="panel-heading">
        <div>
          <p className="eyebrow">WORKSPACE ACCESS</p>
          <h2>Team &amp; access</h2>
        </div>
        <span className={`badge tone-${connected ? 'success' : 'neutral'}`}>
          {connected ? 'Connected' : 'Service session'}
        </span>
      </header>
      <p className="panel-lede">
        Access is tied to the current Privy session. Signing keys and wallet credentials never
        appear in this workspace.
      </p>
      <div className="workspace-fact-grid">
        <article>
          <span>Current session</span>
          <strong>
            {connected ? 'Privy wallet connected' : 'Authenticated service connection'}
          </strong>
          <p>Requests use the configured OneShot authorization boundary.</p>
        </article>
        <article>
          <span>Available actions</span>
          <strong>Run, review, and inspect</strong>
          <p>Start approved services, review quotes, and check payment proof.</p>
        </article>
        <article>
          <span>Payment authority</span>
          <strong>OneShot worker only</strong>
          <p>The browser cannot sign, submit, or force a replacement payment.</p>
        </article>
      </div>
      <details className="technical-details">
        <summary>Advanced integration details</summary>
        <p>
          API clients authenticate through the current session. Developer endpoints and machine
          tokens are intentionally kept out of the primary workspace flow.
        </p>
      </details>
    </section>
  );
}

export function PaymentProtectionPanel({
  activity,
  activityError,
  intentId,
  recoveryClient,
  settlementClient,
  onRefresh,
}: {
  readonly activity: ActivityResponse | null;
  readonly activityError: string | null;
  readonly intentId: string;
  readonly recoveryClient: RecoveryClient;
  readonly settlementClient: SettlementClient;
  readonly onRefresh: () => void;
}) {
  const observation = activity?.observation;
  const count = (value: number | undefined): string =>
    activity === null || value === undefined ? '—' : String(value);

  return (
    <section className="panel workspace-panel proof-panel" aria-label="Payment proof">
      <header className="panel-heading">
        <div>
          <p className="eyebrow">READ-ONLY EVIDENCE</p>
          <h2>Payment proof</h2>
        </div>
        <span className={`badge tone-${activity === null ? 'neutral' : 'success'}`}>
          {activity === null ? 'Not checked' : 'Checked'}
        </span>
      </header>
      <p className="panel-lede">
        OneShot reads the durable ledger, provider status, and Arc observations before a result can
        be resumed. This view never creates another payment.
      </p>
      <div className="proof-metrics" aria-label="Payment activity summary">
        <article>
          <span>Committed settlements</span>
          <strong>{count(activity?.recorded_settlement_count)}</strong>
          <small>Recorded in OneShot</small>
        </article>
        <article>
          <span>Unknown outcomes</span>
          <strong>{count(activity?.uncertain_job_count)}</strong>
          <small>Held for reconciliation</small>
        </article>
        <article>
          <span>Unmatched transfers</span>
          <strong>{count(activity?.unmatched_transfer_count)}</strong>
          <small>Network activity without a match</small>
        </article>
      </div>
      <div className="proof-controls">
        <button type="button" className="secondary" onClick={onRefresh}>
          Check payment activity
        </button>
        <p className="workspace-status" role="status">
          {activityError ??
            (activity
              ? `${String(observation?.freshness ?? 'Evidence checked')} · payment records unchanged`
              : 'No activity check has been requested.')}
        </p>
      </div>
      {intentId ? (
        <div className="proof-request">
          <header className="proof-request-heading">
            <div>
              <p className="eyebrow">SELECTED REQUEST</p>
              <h3>Payment proof</h3>
              <p className="proof-request-id">{maskIdentifier(intentId)}</p>
            </div>
            <span className="proof-read-only">READ ONLY</span>
          </header>
          <div className="proof-surface">
            <SettlementSurface businessIntentId={intentId} client={settlementClient} />
          </div>
          <header className="proof-request-heading recovery-heading">
            <div>
              <p className="eyebrow">RECOVERY CONTROL</p>
              <h3>Recovery control</h3>
            </div>
            <span className="proof-read-only">NO PAYMENT ACTION</span>
          </header>
          <div className="proof-surface">
            <RecoverySurface businessIntentId={intentId} client={recoveryClient} />
          </div>
        </div>
      ) : (
        <p className="field-help">
          Open a request from Requests to inspect its payment proof and recovery control.
        </p>
      )}
    </section>
  );
}
