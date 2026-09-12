import type { ActivityResponse } from '@oneshot/contracts';
import type { RecoveryClient } from '@oneshot/recovery-ui';
import type { SettlementClient } from '@oneshot/settlement-ui';

import { RecoverySurface, SettlementSurface } from './FrontendSurfaces.js';
import { maskIdentifier } from './workspace-copy.js';

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
