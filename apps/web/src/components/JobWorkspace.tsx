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

function subjectSlug(value: string): string {
  const slug = value
    .normalize('NFKD')
    .replace(/[^a-zA-Z0-9]+/gu, '-')
    .replace(/^-+|-+$/gu, '')
    .toLowerCase();
  return slug.slice(0, 48) || 'company';
}

function explorerHref(transactionHash: string | undefined): string | undefined {
  return transactionHash && /^0x[0-9a-f]{64}$/u.test(transactionHash)
    ? `https://testnet.arcscan.app/tx/${transactionHash}`
    : undefined;
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
        <div>
          <dt>Quote expires</dt>
          <dd>{new Date(quote.expires_at).toLocaleString()}</dd>
        </div>
      </dl>
    </section>
  );
}

export function JobWorkspace(props: {
  readonly client: JobApiClient;
  readonly onSelectIntent: (id: string) => void;
}) {
  const [subject, setSubject] = useState('');
  const [customTaskKey, setCustomTaskKey] = useState('');
  const [runSuffix] = useState(() => crypto.randomUUID().slice(0, 8));
  const [quote, setQuote] = useState<SupplierQuote | null>(null);
  const [quoteLoading, setQuoteLoading] = useState(false);
  const [approvedJob, setApprovedJob] = useState<JobView | null>(null);
  const [notice, setNotice] = useState('');
  const generatedTaskKey = subject.trim() ? `report-${subjectSlug(subject)}-${runSuffix}` : '';
  const taskKey = customTaskKey.trim() || generatedTaskKey;

  function clearQuote(): void {
    setQuote(null);
    setApprovedJob(null);
    setNotice('');
  }

  async function loadQuote(): Promise<void> {
    setQuoteLoading(true);
    setNotice('');
    try {
      setQuote(
        await props.client.quote({
          task_key: taskKey,
          tool_id: 'team-report-v1',
          report_subject: subject,
        }),
      );
    } catch {
      setQuote(null);
      setNotice('A live quote is not available. Check API readiness and try again.');
    } finally {
      setQuoteLoading(false);
    }
  }

  async function start(): Promise<void> {
    if (!quote) return;
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
    <section className="panel job-workspace" aria-label="Start a company-data report">
      <header>
        <h2>Start a company-data report</h2>
        <p>
          Enter a company or domain. OneShot creates a stable task key for this run and fetches a
          live team-operated Arc Testnet invoice before any payment authorization is requested.
        </p>
      </header>
      <label htmlFor="report-subject">Company or domain</label>
      <input
        id="report-subject"
        value={subject}
        onChange={(event) => {
          setSubject(event.target.value);
          clearQuote();
        }}
        placeholder="acme.com"
      />
      <label htmlFor="generated-task-key">Task key for retries</label>
      <input
        id="generated-task-key"
        value={generatedTaskKey}
        readOnly
        placeholder="Generated after entering a subject"
      />
      <small className="field-help">
        Keep this generated key if the request needs to be retried. It prevents a second payment for
        the same run.
      </small>
      <details className="advanced-fields">
        <summary>Use a custom task key (advanced)</summary>
        <label htmlFor="custom-task-key">Custom stable task key</label>
        <input
          id="custom-task-key"
          value={customTaskKey}
          onChange={(event) => {
            setCustomTaskKey(event.target.value);
            clearQuote();
          }}
          placeholder="acme-report-2026-09-11"
        />
      </details>
      {!quote && (
        <button
          type="button"
          disabled={quoteLoading || !taskKey.trim() || !subject.trim()}
          onClick={() => void loadQuote()}
        >
          {quoteLoading ? 'Loading live quote…' : 'Get live quote'}
        </button>
      )}
      {quote && !approvedJob && (
        <>
          <SupplierQuotePanel heading="Review quote before approval" quote={quote} />
          <p className="field-help">
            Nothing has been paid yet. Approval sends the quoted USDC from the server-configured
            Privy wallet to the displayed Arc Testnet recipient.
          </p>
          <button type="button" onClick={() => void start()}>
            Approve payment and start job
          </button>
        </>
      )}
      {notice && (
        <p role="status" className="notice">
          {notice}
        </p>
      )}
      {approvedJob && (
        <SupplierQuotePanel heading="Approved payment" quote={approvedJob.supplier} />
      )}
    </section>
  );
}

export function CircleX402DemoPanel() {
  return (
    <section className="panel" aria-label="Circle x402 API demo">
      <header className="panel-heading">
        <div>
          <p className="eyebrow">SEPARATE PAYMENT RAIL</p>
          <h2>Paid API purchase via Circle x402</h2>
        </div>
        <span className="badge tone-neutral">Arc Testnet</span>
      </header>
      <p>
        This demo pays one Circle Gateway x402 dataset request with Privy EIP-712 signing. It is
        separate from the direct Arc settlement demonstration above and never retries an ambiguous
        paid request.
      </p>
      <p className="field-help">
        Configure the endpoint and a funded Gateway testnet balance in the deployment secret store,
        then run <code>pnpm demo:x402</code>. The script prints only the quote, transaction hash and
        stable Business Intent ID.
      </p>
      <a
        className="secondary compact"
        href="https://github.com/SWOFART/OneShot/blob/develop/docs/CIRCLE_X402_DEMO.md"
        target="_blank"
        rel="noreferrer noopener"
      >
        Open x402 runbook
      </a>
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
              {job.settlement && (
                <p className="job-settlement-summary">
                  <strong>Payment confirmed:</strong>{' '}
                  {explorerHref(job.settlement.transaction_hash) ? (
                    <a
                      href={explorerHref(job.settlement.transaction_hash)}
                      target="_blank"
                      rel="noreferrer noopener"
                    >
                      View the ArcScan transaction
                    </a>
                  ) : (
                    <span className="mono">{job.settlement.transaction_hash}</span>
                  )}
                </p>
              )}
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
