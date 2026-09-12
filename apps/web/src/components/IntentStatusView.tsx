import type { IntentResponse, IntentState } from '@oneshot/contracts';
import { useCallback, useEffect, useRef, useState, type FormEvent } from 'react';

import type { OneShotApiClient } from '../api/client.js';
import { atomicUnitsToUsdc } from '../utils/money.js';
import { maskIdentifier, paymentStatusCopy } from './workspace-copy.js';

interface Props {
  readonly client: OneShotApiClient;
  readonly initialIntentId?: string;
}

const STOP_POLLING = new Set<IntentState>(['COMMITTED', 'FAILED_SAFE', 'REJECTED', 'UNKNOWN']);
const MAX_POLLS = 12;

export function IntentStatusView({ client, initialIntentId = '' }: Props) {
  const [searchId, setSearchId] = useState(initialIntentId);
  const [activeId, setActiveId] = useState(initialIntentId);
  const [intent, setIntent] = useState<IntentResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const [pollCount, setPollCount] = useState(0);
  const [polling, setPolling] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [reconcileMessage, setReconcileMessage] = useState<string | null>(null);
  const [reconciling, setReconciling] = useState(false);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (initialIntentId && initialIntentId !== activeId) {
      setSearchId(initialIntentId);
      setActiveId(initialIntentId);
    }
  }, [activeId, initialIntentId]);

  const read = useCallback(
    async (id: string, showLoading = true): Promise<IntentResponse | null> => {
      if (showLoading) setLoading(true);
      setMessage(null);
      try {
        const result = await client.getIntent(id);
        if (result.kind === 'SUCCESS') {
          setIntent(result.intent);
          return result.intent;
        }
        setIntent(null);
        setMessage(
          result.kind === 'NOT_FOUND'
            ? 'That request could not be found in the workspace.'
            : result.message,
        );
        return null;
      } finally {
        if (showLoading) setLoading(false);
      }
    },
    [client],
  );

  useEffect(() => {
    if (!activeId) return;
    let cancelled = false;
    setPollCount(0);
    setPolling(true);

    async function poll(attempt: number): Promise<void> {
      const current = await read(activeId, attempt === 0);
      if (
        cancelled ||
        current === null ||
        STOP_POLLING.has(current.state) ||
        attempt + 1 >= MAX_POLLS
      ) {
        setPolling(false);
        return;
      }
      setPollCount(attempt + 1);
      timer.current = setTimeout(
        () => void poll(attempt + 1),
        Math.min(1_000 + attempt * 500, 4_000),
      );
    }

    void poll(0);
    return () => {
      cancelled = true;
      if (timer.current) clearTimeout(timer.current);
    };
  }, [activeId, read]);

  function lookup(event: FormEvent): void {
    event.preventDefault();
    const id = searchId.trim();
    if (!id) return;
    if (id === activeId) void read(id);
    else setActiveId(id);
  }

  async function reconcile(): Promise<void> {
    if (intent?.state !== 'UNKNOWN') return;
    setReconciling(true);
    setReconcileMessage(null);
    try {
      const result = await client.reconcileIntent(intent.business_intent_id);
      if (result.kind === 'QUEUED') {
        setReconcileMessage(
          'Payment check queued. A new settlement remains blocked until it finishes.',
        );
        await read(intent.business_intent_id);
      } else if (result.kind === 'NOT_FOUND') {
        setReconcileMessage('Reconciliation failed: intent was not found.');
      } else {
        setReconcileMessage(`Reconciliation failed: ${result.message}`);
      }
    } finally {
      setReconciling(false);
    }
  }

  return (
    <section className="panel status-view" aria-label="Payment status viewer">
      <header>
        <h2>Payment status</h2>
        <p>Read from the OneShot ledger. A request being checked cannot be paid again.</p>
      </header>

      <details className="technical-details" open={!activeId}>
        <summary>Look up another request (advanced)</summary>
        <form className="lookup" onSubmit={lookup}>
          <label className="sr-only" htmlFor="status-intent-id">
            Request identifier
          </label>
          <input
            id="status-intent-id"
            value={searchId}
            onChange={(event) => setSearchId(event.target.value)}
            placeholder="Request identifier"
          />
          <button type="submit" disabled={loading || !searchId.trim()}>
            {loading ? 'Checking…' : 'Look up'}
          </button>
          {activeId && (
            <button className="secondary" type="button" onClick={() => void read(activeId)}>
              Check again
            </button>
          )}
        </form>
      </details>

      {message && (
        <div className="notice error" role="alert">
          {message}
        </div>
      )}
      {polling && (
        <p className="polling" role="status">
          Checking payment status · {pollCount + 1}/{MAX_POLLS}
        </p>
      )}

      {intent && (
        <div className="intent-details">
          <div className={`state-card state-${intent.state.toLowerCase()}`}>
            <div>
              <small>Payment status</small>
              <strong>{paymentStatusCopy(intent.state).label}</strong>
            </div>
          </div>

          {intent.state === 'UNKNOWN' && (
            <section className="notice warning" role="alert">
              <h3>Payment verification is still in progress</h3>
              <p>
                OneShot is checking the existing payment. Do not start a new request until this
                check finishes.
              </p>
              <button type="button" disabled={reconciling} onClick={() => void reconcile()}>
                {reconciling ? 'Checking…' : 'Check payment status'}
              </button>
              {reconcileMessage && <p role="status">{reconcileMessage}</p>}
            </section>
          )}

          <dl className="facts">
            <div>
              <dt>Amount</dt>
              <dd>{atomicUnitsToUsdc(intent.amount_atomic)} USDC</dd>
            </div>
            <div>
              <dt>Network</dt>
              <dd>Arc Testnet</dd>
            </div>
            <div>
              <dt>Request</dt>
              <dd>{intent.purpose}</dd>
            </div>
          </dl>

          <details className="technical-details">
            <summary>Show request identifiers and execution history</summary>
            <dl className="facts">
              <div>
                <dt>Request identifier</dt>
                <dd className="mono break-all">{maskIdentifier(intent.business_intent_id, 10)}</dd>
              </div>
              <div>
                <dt>Service destination</dt>
                <dd className="mono break-all">{intent.recipient}</dd>
              </div>
              <div>
                <dt>Ledger version</dt>
                <dd>{intent.version}</dd>
              </div>
            </dl>
            <section>
              <h3>Execution history</h3>
              {intent.attempts.length === 0 ? (
                <p className="muted">No execution attempts yet.</p>
              ) : (
                <ol className="attempts">
                  {intent.attempts.map((attempt) => (
                    <li key={attempt.attempt_id}>
                      <strong>{paymentStatusCopy(attempt.stage).label}</strong> ·{' '}
                      {attempt.created_at}
                      {attempt.sanitized_error && <p>{attempt.sanitized_error}</p>}
                    </li>
                  ))}
                </ol>
              )}
            </section>
          </details>
        </div>
      )}
    </section>
  );
}
