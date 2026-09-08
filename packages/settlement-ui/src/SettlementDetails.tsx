import { AuthorizationStatePanel } from './AuthorizationStatePanel.js';
import type { SettlementDetailsView } from './contract.js';
import { PolicySummaryPanel } from './PolicySummaryPanel.js';
import { SettlementStatePanel } from './SettlementStatePanel.js';
import { TransactionDetails } from './TransactionDetails.js';

export interface SettlementDetailsPanelProps {
  readonly view: SettlementDetailsView;
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
  return (
    <div className="settlement-details" data-contract-version={view.contractVersion}>
      <header className="details-header">
        <p className="eyebrow">ONESHOT / AUTHORIZATION AND SETTLEMENT</p>
        <h1 className="mono break-all">{view.businessIntentId}</h1>
        {view.purpose !== null && <p className="purpose">{view.purpose}</p>}
      </header>
      <PolicySummaryPanel policy={view.policy} />
      <AuthorizationStatePanel authorization={view.authorization} />
      <SettlementStatePanel view={view} />
      <TransactionDetails view={view} />
    </div>
  );
}
