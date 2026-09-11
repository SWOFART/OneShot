import { formatAtomicUsdcWithAsset } from '@oneshot/settlement-ui';
import { useEffect, useState } from 'react';
import type { JobView, SupplierQuote } from '@oneshot/contracts';
import type { JobApiClient } from '../api/job-client.js';

function shortenAddress(value: string): string {
  return value.length > 14 ? `${value.slice(0, 8)}…${value.slice(-6)}` : value;
}

function quoteAmount(quote: SupplierQuote): string {
  return formatAtomicUsdcWithAsset(quote.amount_atomic, quote.asset) ?? 'Unavailable';
}

export function SupplierQuotePanel({
  quote,
  heading = 'Supplier quote',
}: {
  readonly quote: SupplierQuote;
  readonly heading?: string;
}) {
  return (
    <section className="panel quote-panel" aria-label={heading}>
      <header className="panel-heading">
        <h3>{heading}</h3>
        <span className="badge tone-neutral">API quote</span>
      </header>
      <p className="panel-lede">These values came from the supplier order returned by the API.</p>
      <dl className="facts">
        <div>
          <dt>Amount</dt>
          <dd className="mono">{quoteAmount(quote)}</dd>
        </div>
        <div>
          <dt>Recipient</dt>
          <dd className="mono" title={quote.recipient}>
            {shortenAddress(quote.recipient)}
          </dd>
        </div>
        <div>
          <dt>Network</dt>
          <dd>{quote.network}</dd>
        </div>
        <div>
          <dt>Order reference</dt>
          <dd className="mono break-all">{quote.order_reference}</dd>
        </div>
      </dl>
    </section>
  );
}

export function JobWorkspace(props: {
  readonly client: JobApiClient;
  readonly onSelectIntent: (id: string) => void;
}) {
  const [taskKey, setTaskKey] = useState('');
  const [subject, setSubject] = useState('');
  const [approvedJob, setApprovedJob] = useState<JobView | null>(null);
  const [notice, setNotice] = useState('');

  async function start(): Promise<void> {
    try {
      const job = await props.client.start({
        task_key: taskKey,
        tool_id: 'team-report-v1',
        report_subject: subject,
      });
      setApprovedJob(job);
      setNotice(`Job ${job.job_id} is approved. Payment authorization is queued.`);
      props.onSelectIntent(job.business_intent_id);
    } catch {
      setNotice('The job was not started. Keep the same task key when retrying this request.');
    }
  }

  return (
    <section className="panel" aria-label="Start a company-data report">
      <header>
        <h2>Start a company-data report</h2>
        <p>
          Enter a stable task key and subject. The API creates the supplier order and returns the
          exact recipient, amount, network, and order reference before payment authorization.
        </p>
      </header>
      <label htmlFor="task-key">Stable task key</label>
      <input
        id="task-key"
        value={taskKey}
        onChange={(event) => setTaskKey(event.target.value)}
        placeholder="Keep this key for every retry"
      />
      <label htmlFor="report-subject">Report subject</label>
      <input
        id="report-subject"
        value={subject}
        onChange={(event) => setSubject(event.target.value)}
        placeholder="Company or domain"
      />
      <button
        type="button"
        disabled={!taskKey.trim() || !subject.trim()}
        onClick={() => void start()}
      >
        Approve and start job
      </button>
      {notice && (
        <p role="status" className="notice">
          {notice}
        </p>
      )}
      {approvedJob && <SupplierQuotePanel quote={approvedJob.supplier} />}
    </section>
  );
}

export function JobList(props: {
  readonly client: JobApiClient;
  readonly onSelectIntent: (id: string) => void;
}) {
  const [jobs, setJobs] = useState<readonly JobView[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  async function refresh(): Promise<void> {
    setLoading(true);
    try {
      setJobs(await props.client.list());
      setError('');
    } catch {
      setError('Jobs could not be loaded. Check API readiness and operator authentication.');
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void refresh();
  }, []);

  return (
    <section className="panel" aria-label="Jobs and results">
      <header className="panel-heading">
        <div>
          <p className="eyebrow">WORKSPACE JOBS</p>
          <h2>Jobs and results</h2>
        </div>
        <button type="button" className="secondary compact" onClick={() => void refresh()}>
          Refresh jobs
        </button>
      </header>
      {error && (
        <p role="alert" className="notice error-notice">
          {error}
        </p>
      )}
      {loading ? (
        <p role="status">Loading jobs…</p>
      ) : jobs.length === 0 ? (
        <p>No jobs yet. Open Tools to start a supported report.</p>
      ) : (
        <ul className="attempts job-list">
          {jobs.map((job) => (
            <li key={job.job_id}>
              <div className="job-row-heading">
                <button
                  type="button"
                  className="secondary compact"
                  onClick={() => props.onSelectIntent(job.business_intent_id)}
                >
                  {job.task_key}
                </button>
                <span className="badge tone-neutral">{job.delivery_state}</span>
              </div>
              <p>
                Payment: <strong>{job.payment_state}</strong> · Delivery:{' '}
                <strong>{job.delivery_state}</strong>
              </p>
              <p className="job-quote-summary">
                Quote: <span className="mono">{quoteAmount(job.supplier)}</span> · recipient{' '}
                <span className="mono" title={job.supplier.recipient}>
                  {shortenAddress(job.supplier.recipient)}
                </span>
              </p>
              {job.result ? (
                <p>
                  <strong>Result ready:</strong> {job.result.report}
                </p>
              ) : job.payment_state === 'COMMITTED' ? (
                <button
                  type="button"
                  className="secondary compact"
                  onClick={() => void props.client.resume(job.job_id).then(refresh)}
                >
                  Resume delivery (never pays)
                </button>
              ) : null}
              <button
                type="button"
                className="secondary compact"
                onClick={() => props.onSelectIntent(job.business_intent_id)}
              >
                View payment evidence
              </button>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
