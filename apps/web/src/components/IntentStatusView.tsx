import type { IntentResponse, IntentState } from '@oneshot/contracts';
import { useCallback, useEffect, useRef, useState, type FormEvent } from 'react';

import type { OneShotApiClient } from '../api/client.js';
import { atomicUnitsToUsdc } from '../utils/money.js';

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
        setMessage(result.kind === 'NOT_FOUND' ? `Intent "${id}" was not found.` : result.message);
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
          'Reconciliation job enqueued. Settlement remains blocked pending evidence.',
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
    <section className="panel status-view" aria-label="Authoritative intent status viewer">
      <header>
        <h2>Authoritative status</h2>
        <p>Read from the OneShot ledger. UNKNOWN always blocks another payment.</p>
      </header>

      <form className="lookup" onSubmit={lookup}>
        <label className="sr-only" htmlFor="status-intent-id">
          Business Intent ID
        </label>
        <input
          id="status-intent-id"
          value={searchId}
          onChange={(event) => setSearchId(event.target.value)}
          placeholder="Business Intent ID"
        />
        <button type="submit" disabled={loading || !searchId.trim()}>
          {loading ? 'Loading…' : 'Lookup'}
        </button>
        {activeId && (
          <button className="secondary" type="button" onClick={() => void read(activeId)}>
            Refresh
          </button>
        )}
      </form>

      {message && (
        <div className="notice error" role="alert">
          {message}
        </div>
      )}
      {polling && (
        <p className="polling" role="status">
          Polling authoritative state · {pollCount + 1}/{MAX_POLLS}
        </p>
      )}

      {intent && (
        <div className="intent-details">
          <div className={`state-card state-${intent.state.toLowerCase()}`}>
            <div>
              <small>Authoritative state</small>
              <strong>{intent.state}</strong>
            </div>
            <div>
              <small>Ledger version</small>
              <strong>{intent.version}</strong>
            </div>
            <div>
              <small>Attempts</small>
              <strong>{intent.attempts.length}</strong>
            </div>
          </div>

          {intent.state === 'UNKNOWN' && (
            <section className="notice warning" role="alert">
              <h3>Settlement outcome is unknown</h3>
              <p>No retry is allowed until reconciliation finds authoritative evidence.</p>
              <button type="button" disabled={reconciling} onClick={() => void reconcile()}>
                {reconciling ? 'Enqueueing…' : 'Enqueue Reconciliation'}
              </button>
              {reconcileMessage && <p role="status">{reconcileMessage}</p>}
            </section>
          )}

          <dl className="facts">
            <div>
              <dt>Business Intent ID</dt>
              <dd>{intent.business_intent_id}</dd>
            </div>
            <div>
              <dt>Recipient</dt>
              <dd>{intent.recipient}</dd>
            </div>
            <div>
              <dt>Amount</dt>
              <dd>
                {atomicUnitsToUsdc(intent.amount_atomic)} USDC{' '}
                <small>({intent.amount_atomic} atomic)</small>
              </dd>
            </div>
            <div>
              <dt>Network</dt>
              <dd>{intent.network}</dd>
            </div>
            <div>
              <dt>Purpose</dt>
              <dd>{intent.purpose}</dd>
            </div>
          </dl>

          <section>
            <h3>Attempts</h3>
            {intent.attempts.length === 0 ? (
              <p className="muted">No execution attempts yet.</p>
            ) : (
              <ol className="attempts">
                {intent.attempts.map((attempt) => (
                  <li key={attempt.attempt_id}>
                    <strong>{attempt.stage}</strong> · {attempt.created_at}
                    {attempt.sanitized_error && <p>{attempt.sanitized_error}</p>}
                  </li>
                ))}
              </ol>
            )}
          </section>
        </div>
      )}
    </section>
  );
}
