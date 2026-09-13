import type { SettlementDetailsView, SettlementPhase } from './contract.js';

export interface SettlementStatePanelProps {
  readonly view: SettlementDetailsView;
}

const PHASE_LABELS: Readonly<Record<SettlementPhase, string>> = {
  AWAITING_AUTHORIZATION: 'Awaiting authorization',
  READY: 'Ready',
  SUBMITTING: 'Submitting',
  PENDING_UNKNOWN: 'Unknown',
  COMMITTED: 'Committed',
  FINAL_FAILED_SAFE: 'Failed safe',
  REJECTED: 'Rejected',
};

const PHASE_TONE: Readonly<Record<SettlementPhase, string>> = {
  AWAITING_AUTHORIZATION: 'pending',
  READY: 'pending',
  SUBMITTING: 'pending',
  PENDING_UNKNOWN: 'warning',
  COMMITTED: 'success',
  FINAL_FAILED_SAFE: 'neutral',
  REJECTED: 'danger',
};

const PHASE_EXPLANATIONS: Readonly<Record<SettlementPhase, string>> = {
  AWAITING_AUTHORIZATION: 'No settlement may be submitted until authorization resolves.',
  READY: 'Authorization passed and OneShot holds submission ownership for this intent.',
  SUBMITTING: 'An attempt is crossing the provider boundary. Its outcome is not yet known.',
  PENDING_UNKNOWN:
    'A payment may or may not have been broadcast. Reconciliation from durable, Privy, and Arc evidence resolves this; absence of an index result is not proof that no payment happened.',
  COMMITTED: 'Exactly one settlement is committed for this Business Intent.',
  FINAL_FAILED_SAFE: 'This intent closed without a committed settlement.',
  REJECTED: 'Authorization rejected this intent, so no settlement exists.',
};

/** Arc is pending or final. Confirmation counts are deliberately not rendered. */
function arcFinality(phase: SettlementPhase): string | null {
  if (phase === 'COMMITTED') return 'Final';
  if (phase === 'SUBMITTING' || phase === 'PENDING_UNKNOWN') return 'Pending';
  return null;
}

/**
 * B05.3 settlement states.
 *
 * `UNKNOWN` renders as visibly non-terminal and carries no settlement action.
 * The slice as a whole exposes no submit, resend, or force-pay control, so an
 * ambiguous outcome has nothing to click.
 */
export function SettlementStatePanel({ view }: SettlementStatePanelProps) {
  const finality = arcFinality(view.phase);
  const unknown = view.phase === 'PENDING_UNKNOWN';

  return (
    <section
      className="panel settlement-panel"
      aria-labelledby="settlement-state-heading"
      data-settlement-phase={view.phase}
    >
      <header className="panel-heading">
        <h2 id="settlement-state-heading">Settlement</h2>
        <span className={`badge tone-${PHASE_TONE[view.phase]}`}>{PHASE_LABELS[view.phase]}</span>
      </header>
      <p className="panel-lede">{PHASE_EXPLANATIONS[view.phase]}</p>
      {unknown && (
        <p className="panel-note" role="status">
          Not final. No new settlement action is available for an unknown outcome.
        </p>
      )}
      <dl className="facts">
        <div>
          <dt>Durable state</dt>
          <dd>{view.state}</dd>
        </div>
        <div>
          <dt>Outcome</dt>
          <dd>{view.terminal ? 'Final' : 'Not final'}</dd>
        </div>
        {finality !== null && (
          <div>
            <dt>Arc</dt>
            <dd>{finality}</dd>
          </div>
        )}
      </dl>
      {!view.evidenceAvailable && (
        <p className="panel-note">
          No evidence observations are available for this intent yet. Missing evidence does not
          change the authoritative state above.
        </p>
      )}
      {view.evidence.length > 0 && (
        <ul className="evidence-list">
          {view.evidence.map((entry) => (
            <li key={`${entry.source}-${entry.digest}`} className="evidence-item">
              <span className="evidence-source">{entry.source}</span>
              <span className={`chip chip-${entry.authorityClass.toLowerCase()}`}>
                {entry.authorityClass}
              </span>
              {entry.freshness !== null && <span className="chip">{entry.freshness}</span>}
              <span className="evidence-meta">
                {entry.retrievedAt}
                {entry.blockNumber !== null ? ` · block ${entry.blockNumber}` : ''}
              </span>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
