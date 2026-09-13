import type { AuthorizationDisplay, AuthorizationDisplayStatus } from './contract.js';

export interface AuthorizationStatePanelProps {
  readonly authorization: AuthorizationDisplay;
}

const STATUS_LABELS: Readonly<Record<AuthorizationDisplayStatus, string>> = {
  CHECKING: 'Checking',
  AUTHORIZED: 'Authorized',
  DENIED: 'Denied',
  UNAVAILABLE: 'Unavailable',
  CONFIG_MISMATCH: 'Configuration mismatch',
  NOT_REPORTED: 'Not reported',
};

const STATUS_TONE: Readonly<Record<AuthorizationDisplayStatus, string>> = {
  CHECKING: 'pending',
  AUTHORIZED: 'success',
  DENIED: 'danger',
  UNAVAILABLE: 'warning',
  CONFIG_MISMATCH: 'danger',
  NOT_REPORTED: 'warning',
};

/**
 * Each explanation states what the status means for settlement rights. None of
 * them describes a way around the outcome: this interface exposes no override,
 * and a denial is an outcome to read, not an obstacle to route around.
 */
const STATUS_EXPLANATIONS: Readonly<Record<AuthorizationDisplayStatus, string>> = {
  CHECKING:
    'Privy is evaluating this attempt against the wallet policy. Nothing is authorized yet.',
  AUTHORIZED: 'Privy permitted exactly the requested scope for this attempt.',
  DENIED: 'Privy refused this attempt. No settlement was submitted and this attempt is closed.',
  UNAVAILABLE:
    'Authorization could not be evaluated. This is neither an approval nor a denial, and the attempt failed safe without submitting.',
  CONFIG_MISMATCH:
    'The expected wallet, policy, network, or token identity did not match the configured values, so authorization stopped before any submission.',
  NOT_REPORTED: 'The latest attempt carries no authorization status.',
};

const STATUS_NOTE: Readonly<Partial<Record<AuthorizationDisplayStatus, string>>> = {
  DENIED: 'OneShot cannot override a Privy denial, and this interface offers no bypass.',
  CONFIG_MISMATCH: 'Identity checks fail closed. No settlement is possible while they disagree.',
  UNAVAILABLE: 'An unavailable authorization never grants a submission right.',
};

/**
 * B05.2 authorization states.
 *
 * `CHECKING`, `AUTHORIZED`, `DENIED`, `UNAVAILABLE`, and `CONFIG_MISMATCH` are
 * distinct and separately explained, because collapsing "denied" into
 * "unavailable" would read a hard refusal as a retryable blip.
 */
export function AuthorizationStatePanel({ authorization }: AuthorizationStatePanelProps) {
  const note = STATUS_NOTE[authorization.status] ?? null;

  return (
    <section className="panel authorization-panel" aria-labelledby="authorization-heading">
      <header className="panel-heading">
        <h2 id="authorization-heading">Authorization</h2>
        <span
          className={`badge tone-${STATUS_TONE[authorization.status]}`}
          data-authorization-status={authorization.status}
        >
          {STATUS_LABELS[authorization.status]}
        </span>
      </header>
      <p className="panel-lede">{STATUS_EXPLANATIONS[authorization.status]}</p>
      {authorization.sanitizedReason !== null && (
        <p className="sanitized-reason">
          <span className="eyebrow">Reported reason</span>
          {authorization.sanitizedReason}
        </p>
      )}
      {note !== null && <p className="panel-note">{note}</p>}
      <dl className="facts">
        <div>
          <dt>Attempt</dt>
          <dd className="mono">{authorization.attemptId ?? 'None recorded'}</dd>
        </div>
        <div>
          <dt>Recorded</dt>
          <dd>{authorization.occurredAt ?? 'Not recorded'}</dd>
        </div>
        <div>
          <dt>Attempt outcome</dt>
          <dd>{authorization.terminal ? 'Closed for this attempt' : 'Open'}</dd>
        </div>
      </dl>
    </section>
  );
}
