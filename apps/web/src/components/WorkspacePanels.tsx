import type { ActivityResponse } from '@oneshot/contracts';
import type { RecoveryClient } from '@oneshot/recovery-ui';
import type { SettlementClient } from '@oneshot/settlement-ui';

import { RecoverySurface, SettlementSurface } from './FrontendSurfaces.js';
import { maskIdentifier } from './workspace-copy.js';

function shortHash(value: string): string {
  return `${value.slice(0, 10)}…${value.slice(-8)}`;
}

function graphStatusLabel(
  status: ActivityResponse['transactions'][number]['graph_status'],
): string {
  switch (status) {
    case 'INDEXED_TRANSFER':
      return 'Indexed transfer';
    case 'NOT_INDEXED':
      return 'Hash not indexed';
    case 'NO_TRANSACTION_HASH':
      return 'No transaction hash';
    case 'UNAVAILABLE':
      return 'Graph unavailable';
  }
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
  const transactions = activity?.transactions ?? [];
  const transfers = activity?.transfers ?? [];
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
      {activity && (
        <div className="proof-history" aria-label="Site transaction history">
          <header className="proof-history-heading">
            <div>
              <p className="eyebrow">SITE AUDIT TRAIL</p>
              <h3>Every payment request</h3>
            </div>
            <span className="proof-read-only">GRAPH + LEDGER</span>
          </header>
          <p className="field-help">
            One row is shown for every payment request created in this workspace, including
            rejected, failed, uncertain and approved outcomes.
          </p>
          {transactions.length > 0 ? (
            <ol className="proof-history-list">
              {transactions.map((transaction) => (
                <li key={transaction.job_id} className="proof-history-item">
                  <div className="proof-history-item-heading">
                    <strong>{transaction.payment_state}</strong>
                    <span>{transaction.payment_mode}</span>
                  </div>
                  <p>
                    Request <code>{maskIdentifier(transaction.business_intent_id)}</code> ·{' '}
                    <code>{transaction.amount_atomic}</code> atomic USDC to{' '}
                    <code>{shortHash(transaction.recipient)}</code>
                  </p>
                  <p>
                    {transaction.transaction_hash ? (
                      <>
                        Transaction <code>{shortHash(transaction.transaction_hash)}</code>
                      </>
                    ) : (
                      'No transaction hash was recorded for this outcome.'
                    )}{' '}
                    · The Graph: <strong>{graphStatusLabel(transaction.graph_status)}</strong>
                    {transaction.graph_block_number
                      ? ` · block ${transaction.graph_block_number}`
                      : ''}
                    {transaction.graph_log_index !== undefined
                      ? ` · log ${transaction.graph_log_index}`
                      : ''}
                  </p>
                  {transaction.graph_status === 'NOT_INDEXED' && (
                    <small>
                      The Graph has no matching event yet. That is not proof that payment did not
                      happen; Arc receipt and OneShot state remain authoritative.
                    </small>
                  )}
                  {transaction.graph_status === 'UNAVAILABLE' && (
                    <small>
                      Graph evidence could not be read for this refresh. Arc receipt and OneShot
                      state remain authoritative.
                    </small>
                  )}
                </li>
              ))}
            </ol>
          ) : (
            <p className="field-help">No site payment requests are recorded yet.</p>
          )}
          {transfers.length > 0 && (
            <details className="proof-transfer-details">
              <summary>Indexed Graph transfers ({transfers.length})</summary>
              <ul className="proof-transfer-list">
                {transfers.map((transfer) => (
                  <li key={`${transfer.transaction_hash}:${transfer.log_index}`}>
                    <span>
                      <code>{shortHash(transfer.transaction_hash)}</code> · log {transfer.log_index}{' '}
                      · {transfer.amount_atomic} atomic USDC
                    </span>
                    <small>
                      {transfer.match === 'RECORDED_SETTLEMENT'
                        ? 'Matched to a OneShot settlement'
                        : 'Unmatched network activity'}
                      {transfer.sender ? ` · from ${shortHash(transfer.sender)}` : ''}
                      {transfer.token_contract
                        ? ` · token ${shortHash(transfer.token_contract)}`
                        : ''}
                      {transfer.block_number ? ` · block ${transfer.block_number}` : ''}
                      {transfer.block_timestamp ? ` · ${transfer.block_timestamp}` : ''}
                    </small>
                  </li>
                ))}
              </ul>
            </details>
          )}
        </div>
      )}
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
