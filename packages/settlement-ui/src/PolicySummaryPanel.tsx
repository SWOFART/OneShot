import type { PolicyDisplayStatus, PolicySummaryDisplay } from './contract.js';

export interface PolicySummaryPanelProps {
  readonly policy: PolicySummaryDisplay;
}

const POLICY_STATUS_LABELS: Readonly<Record<PolicyDisplayStatus, string>> = {
  CONFIGURED: 'Configured',
  EXCEEDED: 'Cap exceeded',
  NOT_CONFIGURED: 'Not configured',
  UNKNOWN: 'Unknown',
  NOT_REPORTED: 'Not reported',
};

const POLICY_STATUS_TONE: Readonly<Record<PolicyDisplayStatus, string>> = {
  CONFIGURED: 'success',
  EXCEEDED: 'danger',
  NOT_CONFIGURED: 'danger',
  UNKNOWN: 'warning',
  NOT_REPORTED: 'warning',
};

const POLICY_STATUS_EXPLANATIONS: Readonly<Record<PolicyDisplayStatus, string>> = {
  CONFIGURED: 'Privy reports an active spending policy for this wallet.',
  EXCEEDED: 'The requested amount is above the approved per-settlement cap.',
  NOT_CONFIGURED: 'No matching Privy policy is configured, so no settlement can be authorized.',
  UNKNOWN: 'Privy policy state could not be read. Unknown is not treated as permitted.',
  NOT_REPORTED: 'The API returned no policy summary for this intent.',
};

function allowlistLabel(allowlisted: boolean | null): string {
  if (allowlisted === null) return 'No allowlist reported';
  return allowlisted ? 'On the allowlist' : 'Not on the allowlist';
}

function capLabel(policy: PolicySummaryDisplay): string {
  if (policy.settlementCapDisplay === null) return 'Not reported';
  return `${policy.settlementCapDisplay} ${policy.asset}`;
}

function withinCapLabel(withinCap: boolean | null): string {
  if (withinCap === null) return 'Cannot be compared';
  return withinCap ? 'At or under the cap' : 'Above the cap';
}

/**
 * B05.1 policy summary.
 *
 * Renders only sanitized policy fields the API publishes. Authorization keys,
 * signatures, owner material, and raw provider payloads have no prop here and
 * no path to the DOM.
 */
export function PolicySummaryPanel({ policy }: PolicySummaryPanelProps) {
  return (
    <section className="panel policy-panel" aria-labelledby="policy-summary-heading">
      <header className="panel-heading">
        <h2 id="policy-summary-heading">Policy</h2>
        <span className={`badge tone-${POLICY_STATUS_TONE[policy.status]}`}>
          {POLICY_STATUS_LABELS[policy.status]}
        </span>
      </header>
      <p className="panel-lede">{POLICY_STATUS_EXPLANATIONS[policy.status]}</p>
      <dl className="facts">
        <div>
          <dt>Network</dt>
          <dd>{policy.network}</dd>
        </div>
        <div>
          <dt>Asset</dt>
          <dd>{policy.asset}</dd>
        </div>
        <div>
          <dt>Recipient</dt>
          <dd>
            <span className="mono">{policy.recipient}</span>{' '}
            <span className={policy.recipientAllowlisted === true ? 'inline-ok' : 'inline-warning'}>
              {allowlistLabel(policy.recipientAllowlisted)}
            </span>
          </dd>
        </div>
        <div>
          <dt>Per-settlement cap</dt>
          <dd>{capLabel(policy)}</dd>
        </div>
        <div>
          <dt>Requested amount</dt>
          <dd>
            {policy.amountDisplay === null ? (
              'Malformed amount'
            ) : (
              <>
                <span className="mono">{policy.amountDisplay}</span> {policy.asset}
                <span className="fact-note">{withinCapLabel(policy.amountWithinCap)}</span>
              </>
            )}
          </dd>
        </div>
        {policy.policyId !== null && (
          <div>
            <dt>Policy reference</dt>
            <dd className="mono">{policy.policyId}</dd>
          </div>
        )}
        {policy.allowedRecipients.length > 0 && (
          <div>
            <dt>Allowed recipients</dt>
            <dd>
              <ul className="address-list">
                {policy.allowedRecipients.map((address) => (
                  <li key={address} className="mono">
                    {address}
                  </li>
                ))}
              </ul>
            </dd>
          </div>
        )}
      </dl>
    </section>
  );
}
