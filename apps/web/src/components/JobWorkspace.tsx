import { formatAtomicUsdcWithAsset } from '@oneshot/settlement-ui';
import { useEffect, useState } from 'react';
import type { JobView, PaidApiQuote, PaidApiResponse, SupplierQuote } from '@oneshot/contracts';
import type { JobApiClient } from '../api/job-client.js';
import type { PaidApiClient } from '../api/paid-api-client.js';
import { usdcToAtomicUnits } from '../utils/money.js';

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
  return transactionHash && /^0x[0-9a-f]{64}$/iu.test(transactionHash)
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
  const [recipient, setRecipient] = useState('');
  const [amount, setAmount] = useState('');
  const [customTaskKey, setCustomTaskKey] = useState('');
  const [runSuffix] = useState(() => crypto.randomUUID().slice(0, 8));
  const [quote, setQuote] = useState<SupplierQuote | null>(null);
  const [quoteLoading, setQuoteLoading] = useState(false);
  const [approvedJob, setApprovedJob] = useState<JobView | null>(null);
  const [notice, setNotice] = useState('');
  const generatedTaskKey = subject.trim() ? `report-${subjectSlug(subject)}-${runSuffix}` : '';
  const taskKey = customTaskKey.trim() || generatedTaskKey;

  function amountAtomic(): string | null {
    try {
      const value = usdcToAtomicUnits(amount);
      return value === '0' ? null : value;
    } catch {
      return null;
    }
  }

  function request() {
    const atomicAmount = amountAtomic();
    if (!atomicAmount || !recipient.trim() || !taskKey.trim() || !subject.trim()) return null;
    return {
      task_key: taskKey,
      tool_id: 'team-report-v1' as const,
      report_subject: subject.trim(),
      recipient: recipient.trim(),
      amount_atomic: atomicAmount,
    };
  }

  function clearQuote(): void {
    setQuote(null);
    setApprovedJob(null);
    setNotice('');
  }

  async function loadQuote(): Promise<void> {
    const jobRequest = request();
    if (!jobRequest) {
      setNotice('Enter a valid recipient wallet and a positive USDC amount.');
      return;
    }
    setQuoteLoading(true);
    setNotice('');
    try {
      setQuote(
        await props.client.quote({
          ...jobRequest,
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
    const jobRequest = request();
    if (!jobRequest) {
      setNotice('Enter a valid recipient wallet and a positive USDC amount.');
      return;
    }
    try {
      const job = await props.client.start(jobRequest);
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
      <label htmlFor="report-recipient">Recipient wallet</label>
      <input
        id="report-recipient"
        value={recipient}
        onChange={(event) => {
          setRecipient(event.target.value);
          clearQuote();
        }}
        placeholder="0x…"
        inputMode="text"
        autoComplete="off"
        spellCheck={false}
        aria-describedby="report-recipient-help"
      />
      <small id="report-recipient-help" className="field-help">
        Use an Arc Testnet wallet allowed by the active Privy policy.
      </small>
      <label htmlFor="report-amount">Amount (USDC)</label>
      <input
        id="report-amount"
        value={amount}
        onChange={(event) => {
          setAmount(event.target.value);
          clearQuote();
        }}
        placeholder="0.01"
        inputMode="decimal"
        autoComplete="off"
        aria-describedby="report-amount-help"
      />
      <small id="report-amount-help" className="field-help">
        Up to 6 decimal places. The request is sent as integer USDC atomic units.
      </small>
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
          disabled={quoteLoading || !request()}
          onClick={() => void loadQuote()}
        >
          {quoteLoading ? 'Loading live quote…' : 'Get live quote'}
        </button>
      )}
      {quote && !approvedJob && (
        <>
          <SupplierQuotePanel heading="Review quote before approval" quote={quote} />
          <p className="field-help">
            Nothing has been paid yet. Approval sends the quoted USDC from the Privy wallet to the
            recipient you entered, subject to the active wallet policy.
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

export function CircleX402DemoPanel(props: {
  readonly client?: PaidApiClient;
  readonly onSelectIntent: (id: string) => void;
}) {
  const [taskKey, setTaskKey] = useState(() => `circle-api-${crypto.randomUUID().slice(0, 8)}`);
  const [quote, setQuote] = useState<PaidApiQuote | null>(null);
  const [request, setRequest] = useState<PaidApiResponse | null>(null);
  const [loading, setLoading] = useState<'quote' | 'start' | 'refresh' | null>(null);
  const [notice, setNotice] = useState('');
  const paidApiRequest = { task_key: taskKey.trim(), tool_id: 'circle-x402-api-v1' as const };

  function clear(): void {
    setQuote(null);
    setRequest(null);
    setNotice('');
  }

  async function loadQuote(): Promise<void> {
    if (!props.client || !paidApiRequest.task_key) return;
    setLoading('quote');
    setNotice('');
    try {
      setQuote(await props.client.quote(paidApiRequest));
    } catch {
      setQuote(null);
      setNotice('A live x402 quote is unavailable. Check the API endpoint and try again.');
    } finally {
      setLoading(null);
    }
  }

  async function approve(): Promise<void> {
    if (!props.client) return;
    setLoading('start');
    setNotice('');
    try {
      const result = await props.client.start(paidApiRequest);
      setRequest(result);
      props.onSelectIntent(result.business_intent_id);
      setNotice('OneShot accepted this Business Intent. The worker owns the payment attempt.');
    } catch {
      setNotice('The paid API request was not accepted. Keep the same task key before retrying.');
    } finally {
      setLoading(null);
    }
  }

  async function refresh(): Promise<void> {
    if (!props.client || !request) return;
    setLoading('refresh');
    try {
      setRequest(await props.client.get(request.business_intent_id));
      setNotice('Payment state refreshed from the authoritative OneShot ledger.');
    } catch {
      setNotice('Payment state could not be refreshed; no new payment was submitted.');
    } finally {
      setLoading(null);
    }
  }

  return (
    <section className="panel" aria-label="Circle x402 API demo">
      <header className="panel-heading">
        <div>
          <p className="eyebrow">LIVE PAID API</p>
          <h2>Buy a Circle x402 API result</h2>
        </div>
        <span className="badge tone-neutral">Arc Testnet</span>
      </header>
      <p>
        Review the live Circle Gateway quote, approve one stable task key, and watch OneShot move
        the payment through Arc Testnet. Repeating the same task key replays the stored Business
        Intent and cannot create a second settlement.
      </p>
      <label htmlFor="paid-api-task-key">Paid API task key</label>
      <input
        id="paid-api-task-key"
        value={taskKey}
        onChange={(event) => {
          setTaskKey(event.target.value);
          clear();
        }}
        maxLength={128}
        autoComplete="off"
        spellCheck={false}
      />
      <small className="field-help">
        Keep this exact key if the browser or agent retries. A changed quote is returned as a
        conflict instead of being charged twice.
      </small>
      {!props.client ? (
        <p className="field-help">
          The paid API integration is not configured in this environment.
        </p>
      ) : !quote && !request ? (
        <button
          type="button"
          disabled={loading !== null || !paidApiRequest.task_key}
          onClick={() => void loadQuote()}
        >
          {loading === 'quote' ? 'Checking live quote…' : 'Check live quote'}
        </button>
      ) : null}
      {quote && !request && (
        <>
          <section className="panel quote-panel" aria-label="Paid API quote">
            <header className="panel-heading">
              <h3>Review x402 quote</h3>
              <span className="badge tone-neutral">No charge yet</span>
            </header>
            <dl className="facts">
              <div>
                <dt>Amount</dt>
                <dd className="mono">
                  {formatAtomicUsdcWithAsset(quote.amount_atomic, quote.asset) ?? 'Unavailable'}
                </dd>
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
                <dt>Resource</dt>
                <dd className="break-all">{quote.resource_url}</dd>
              </div>
            </dl>
          </section>
          <p className="field-help">
            Approval creates the durable intent. Only the worker can submit the Circle payment;
            delayed or ambiguous outcomes stay UNKNOWN for reconciliation.
          </p>
          <button type="button" disabled={loading !== null} onClick={() => void approve()}>
            {loading === 'start' ? 'Approving…' : 'Approve and buy API result'}
          </button>
        </>
      )}
      {request && (
        <section className="paid-api-status" aria-label="Paid API payment status">
          <div className="job-row-heading">
            <strong>Payment: {request.payment_state}</strong>
            <span className="badge tone-neutral">One intent</span>
          </div>
          <p className="mono break-all">{request.business_intent_id}</p>
          {request.provider_transaction_hash && (
            <p>
              Circle Gateway transaction:{' '}
              {explorerHref(request.provider_transaction_hash) ? (
                <a
                  href={explorerHref(request.provider_transaction_hash)}
                  target="_blank"
                  rel="noreferrer noopener"
                >
                  View on ArcScan
                </a>
              ) : (
                <span className="mono">{request.provider_transaction_hash}</span>
              )}
            </p>
          )}
          {request.settlement ? (
            <p>
              <strong>Payment confirmed on Arc:</strong>{' '}
              <a
                href={explorerHref(request.settlement.transaction_hash)}
                target="_blank"
                rel="noreferrer noopener"
              >
                View committed settlement
              </a>
            </p>
          ) : (
            <p className="field-help">
              Arc confirmation is pending. Refresh this read-only status; do not approve a new task
              key while this one is unresolved.
            </p>
          )}
          {request.response !== undefined && (
            <pre className="response-output">{JSON.stringify(request.response, null, 2)}</pre>
          )}
          <button
            type="button"
            className="secondary compact"
            disabled={loading !== null}
            onClick={() => void refresh()}
          >
            {loading === 'refresh' ? 'Refreshing…' : 'Refresh payment'}
          </button>
        </section>
      )}
      {notice && (
        <p role="status" className="notice">
          {notice}
        </p>
      )}
      <a
        className="secondary compact"
        href="https://github.com/SWOFART/OneShot/blob/develop/docs/CIRCLE_X402_DEMO.md"
        target="_blank"
        rel="noreferrer noopener"
      >
        Open x402 deployment runbook
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
