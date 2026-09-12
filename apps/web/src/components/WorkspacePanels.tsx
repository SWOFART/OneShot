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
        <span className="badge tone-success">Protected</span>
      </header>
      <p className="panel-lede">
        These rules describe what the connected Privy wallet may pay. OneShot checks them before a
        payment starts.
      </p>
      <div className="workspace-fact-grid">
        <article>
          <span>Per request</span>
          <strong>Privy policy limit</strong>
          <p>Requests above the approved amount stop before signing.</p>
        </article>
        <article>
          <span>Allowed destination</span>
          <strong>Approved API services</strong>
          <p>Recipient and network must match the active policy.</p>
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
          Policy changes are managed by the workspace owner in Privy. This view is intentionally
          read-only and never bypasses wallet authorization.
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
          <p>Start approved services, review quotes, and check payment protection.</p>
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
  const confirmed = activity?.recorded_settlement_count ?? 0;
  const checking = activity?.uncertain_job_count ?? 0;
  const extra = activity?.unmatched_transfer_count ?? 0;

  return (
    <section className="panel workspace-panel protection-panel" aria-label="Payment protection">
      <header className="panel-heading">
        <div>
          <p className="eyebrow">PAYMENT SAFETY</p>
          <h2>Payment protection</h2>
        </div>
        <span className="badge tone-success">No duplicate payments</span>
      </header>
      <p className="panel-lede">
        If a paid API responds late or a browser loses the response, OneShot checks the existing
        payment before allowing any next step.
      </p>
      <div className="protection-steps" aria-label="Payment protection steps">
        <article>
          <span className="step-number">1</span>
          <div>
            <strong>Payment proof</strong>
            <p>Circle and Arc evidence are checked before a retry.</p>
          </div>
        </article>
        <article>
          <span className="step-number">2</span>
          <div>
            <strong>Result recovery</strong>
            <p>The original request is resumed; the payment is not repeated.</p>
          </div>
        </article>
        <article>
          <span className="step-number">3</span>
          <div>
            <strong>Safe hold</strong>
            <p>Unclear evidence blocks a new payment until it is resolved.</p>
          </div>
        </article>
      </div>
      <div className="protection-summary" aria-label="Payment protection summary">
        <div>
          <span>Confirmed payments</span>
          <strong>{confirmed}</strong>
        </div>
        <div>
          <span>Requests being checked</span>
          <strong>{checking}</strong>
        </div>
        <div>
          <span>Additional network activity</span>
          <strong>{extra}</strong>
        </div>
      </div>
      <button type="button" className="secondary" onClick={onRefresh}>
        Check payment activity
      </button>
      <p className="workspace-status" role="status">
        {activityError ??
          (activity
            ? `${String(observation?.freshness ?? 'Evidence checked')} · payment records unchanged`
            : 'Evidence is checked read-only when you request it.')}
      </p>
      {intentId ? (
        <details className="technical-details">
          <summary>Open payment proof for {maskIdentifier(intentId)}</summary>
          <p className="panel-lede">
            This read-only view shows the Arc and Privy evidence for the selected request. It cannot
            create or retry a payment.
          </p>
          <SettlementSurface businessIntentId={intentId} client={settlementClient} />
          <h3>Payment and result checks</h3>
          <RecoverySurface businessIntentId={intentId} client={recoveryClient} />
        </details>
      ) : (
        <p className="field-help">
          Open a request from Requests to inspect its protection details.
        </p>
      )}
    </section>
  );
}
