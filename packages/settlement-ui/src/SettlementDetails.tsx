import { AuthorizationStatePanel } from './AuthorizationStatePanel.js';
import type { SettlementDetailsView } from './contract.js';
import { PolicySummaryPanel } from './PolicySummaryPanel.js';
import { SettlementStatePanel } from './SettlementStatePanel.js';
import { TransactionDetails } from './TransactionDetails.js';

export interface SettlementDetailsPanelProps {
  readonly view: SettlementDetailsView;
}

function proofStatus(view: SettlementDetailsView): {
  readonly label: string;
  readonly tone: string;
} {
  if (view.verification === 'VERIFIED') return { label: 'Verified', tone: 'success' };
  if (view.verification === 'UNVERIFIED') return { label: 'Needs verification', tone: 'warning' };
  return { label: 'No settlement', tone: 'neutral' };
}

/**
 * The composed B05 slice: policy, authorization, settlement state, and verified
 * transaction evidence for one Business Intent.
 *
 * It renders already-projected data and owns no fetching, so a shell can mount
 * it directly at Gate P5. It exposes no control that could submit, resubmit, or
 * force a settlement.
 */
export function SettlementDetailsPanel({ view }: SettlementDetailsPanelProps) {
  const status = proofStatus(view);
  return (
    <div className="settlement-details" data-contract-version={view.contractVersion}>
      <header className="details-header">
        <div className="proof-title-row">
          <div>
            <p className="eyebrow">PAYMENT PROOF · ARC TESTNET</p>
            <h1>Payment proof</h1>
          </div>
          <span className={`badge tone-${status.tone}`}>{status.label}</span>
        </div>
        {view.purpose !== null && <p className="purpose">{view.purpose}</p>}
        <dl className="proof-facts" aria-label="Payment request facts">
          <div>
            <dt>Request</dt>
            <dd className="mono break-all">{view.businessIntentId}</dd>
          </div>
          <div>
            <dt>Network</dt>
            <dd>{view.policy.network}</dd>
          </div>
          <div>
            <dt>Recipient</dt>
            <dd className="mono break-all">{view.policy.recipient}</dd>
          </div>
          <div>
            <dt>Amount</dt>
            <dd>
              {view.policy.amountDisplay ?? 'Not reported'} {view.policy.asset}
            </dd>
          </div>
        </dl>
      </header>
      <PolicySummaryPanel policy={view.policy} />
      <AuthorizationStatePanel authorization={view.authorization} />
      <SettlementStatePanel view={view} />
      <TransactionDetails view={view} />
    </div>
  );
}
