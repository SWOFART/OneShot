import { formatAtomicUsdcWithAsset } from '@oneshot/settlement-ui';
import { useEffect, useState } from 'react';
import type { JobView, SupplierQuote } from '@oneshot/contracts';
import type { JobApiClient } from '../api/job-client.js';
import type { UserWalletSession } from '../auth/session.js';
import { usdcToAtomicUnits } from '../utils/money.js';
import {
  deliveryStatusCopy,
  maskAddress,
  maskIdentifier,
  networkLabel,
  paymentStatusCopy,
  serviceLabel,
} from './workspace-copy.js';

function shortenAddress(value: string): string {
  return maskAddress(value);
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

function mcpPaymentStillSignable(job: JobView): boolean {
  return job.payment_state === 'READY' && Date.parse(job.supplier.expires_at) > Date.now();
}

const USER_WALLET_PAYMENT_CHECK_DELAY_MS = 500;
const USER_WALLET_PAYMENT_CHECK_ATTEMPTS = 30;
function waitForPaymentCheck(): Promise<void> {
  return new Promise((resolve) => {
    window.setTimeout(resolve, USER_WALLET_PAYMENT_CHECK_DELAY_MS);
  });
}

async function resolveUserWalletPayment(
  client: JobApiClient,
  jobId: string,
  transactionHash: string,
  initial: JobView,
): Promise<JobView> {
  let latest = initial;
  for (
    let attempt = 0;
    attempt < USER_WALLET_PAYMENT_CHECK_ATTEMPTS && latest.payment_state === 'UNKNOWN';
    attempt += 1
  ) {
    await waitForPaymentCheck();
    latest = await client.submitUserWalletPayment(jobId, transactionHash);
  }
  return latest;
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
        <span className="badge tone-neutral">Payment preview</span>
      </header>
      <p className="panel-lede">
        Confirm the recipient and the USDC amount they will receive. Network fees are separate.
      </p>
      <dl className="facts">
        <div>
          <dt>Recipient receives</dt>
          <dd className="mono">{quoteAmount(quote)}</dd>
        </div>
        <div>
          <dt>Service destination</dt>
          <dd className="mono" title={quote.recipient}>
            {shortenAddress(quote.recipient)}
          </dd>
        </div>
        <div>
          <dt>Network</dt>
          <dd>{networkLabel(quote.network)}</dd>
        </div>
        <div>
          <dt>Quote valid until</dt>
          <dd>{new Date(quote.expires_at).toLocaleString()}</dd>
        </div>
      </dl>
      <details className="technical-details">
        <summary>Show supplier details</summary>
        <dl className="facts">
          <div>
            <dt>Order reference</dt>
            <dd className="mono break-all">{quote.order_reference}</dd>
          </div>
          <div>
            <dt>Full destination</dt>
            <dd className="mono break-all">{quote.recipient}</dd>
          </div>
        </dl>
      </details>
    </section>
  );
}

export function JobWorkspace(props: {
  readonly client: JobApiClient;
  readonly userWallet?: UserWalletSession;
  readonly onSelectIntent: (id: string) => void;
  readonly initialJobId?: string;
}) {
  const [subject, setSubject] = useState('');
  const [recipient, setRecipient] = useState('');
  const [amount, setAmount] = useState('');
  const [customTaskKey, setCustomTaskKey] = useState('');
  const [runSuffix] = useState(() => crypto.randomUUID().slice(0, 8));
  const [quote, setQuote] = useState<SupplierQuote | null>(null);
  const [quoteLoading, setQuoteLoading] = useState(false);
  const [starting, setStarting] = useState(false);
  const [approvedJob, setApprovedJob] = useState<JobView | null>(null);
  const [paymentHash, setPaymentHash] = useState<string | null>(null);
  const [walletAttempted, setWalletAttempted] = useState(false);
  const [paymentChecking, setPaymentChecking] = useState(false);
  const [mcpJobLoading, setMcpJobLoading] = useState(Boolean(props.initialJobId));
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
    setPaymentHash(null);
    setWalletAttempted(false);
    setPaymentChecking(false);
    setNotice('');
  }

  async function loadQuote(): Promise<void> {
    const jobRequest = request();
    if (!jobRequest) {
      setNotice('Enter a valid service destination and a positive USDC amount.');
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
      setNotice(
        'The service could not prepare a payment preview. No payment was requested. Check the connection and try again.',
      );
    } finally {
      setQuoteLoading(false);
    }
  }

  useEffect(() => {
    if (!props.initialJobId) return;
    let cancelled = false;
    setMcpJobLoading(true);
    void (async () => {
      try {
        const job = await props.client.get(props.initialJobId!);
        if (job.payment_mode !== 'USER_WALLET' || !job.user_payment) {
          throw new Error('The linked payment is not a user-wallet payment');
        }
        if (cancelled) return;
        setApprovedJob(job);
        if (job.user_payment.transaction_hash) setPaymentHash(job.user_payment.transaction_hash);
        setNotice(
          mcpPaymentStillSignable(job)
            ? 'MCP payment is ready. Review the details, then confirm the wallet signature.'
            : job.payment_state === 'READY'
              ? 'This MCP signing link has expired. Create a new approved payment instead.'
              : `This MCP payment is already ${job.payment_state}.`,
        );
      } catch {
        if (!cancelled) {
          setNotice('The MCP payment link is invalid, expired, or belongs to another workspace.');
        }
      } finally {
        if (!cancelled) setMcpJobLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [props.client, props.initialJobId]);

  async function start(): Promise<void> {
    if (!quote) return;
    const jobRequest = request();
    if (!jobRequest) {
      setNotice('Enter a valid recipient wallet and a positive USDC amount.');
      return;
    }
    setStarting(true);
    const userWallet = props.userWallet;
    if (!userWallet) {
      /*
       * НЕ УДАЛЯТЬ: the old server-wallet UI handoff is intentionally disabled
       * for personal payments. Corporate autonomous agents may use that mode
       * through a separately selected backend integration.
       */
      setNotice('Connect a Privy or MetaMask wallet before approving this direct Arc payment.');
      setStarting(false);
      return;
    }
    setWalletAttempted(false);
    setPaymentHash(null);
    let prepared = false;
    let submittedHash: string | null = null;
    try {
      const payerWallet = userWallet.address ?? (await userWallet.connect());
      if (!payerWallet) {
        setNotice('No Ethereum wallet is connected. Nothing was paid.');
        return;
      }
      const job = await props.client.prepareUserWalletJob({
        ...jobRequest,
        payer_wallet: payerWallet,
      });
      if (!job.user_payment) throw new Error('The API did not return a user-wallet payment plan');
      if (
        job.user_payment.recipient.toLowerCase() !== jobRequest.recipient.toLowerCase() ||
        job.user_payment.amount_atomic !== jobRequest.amount_atomic
      ) {
        throw new Error('The durable payment plan differs from the reviewed quote');
      }
      setApprovedJob(job);
      if (job.user_payment.transaction_hash) {
        setPaymentHash(job.user_payment.transaction_hash);
        setNotice(
          'The original wallet transaction is already recorded. Check that same transaction; do not approve another payment.',
        );
        return;
      }
      setNotice(
        'Review the exact recipient and amount in Privy, then confirm the wallet transaction.',
      );
      prepared = true;
      setWalletAttempted(true);
      const transactionHash = await userWallet.sendTransfer(job.user_payment);
      submittedHash = transactionHash;
      setPaymentHash(transactionHash);
      const initial = await props.client.submitUserWalletPayment(job.job_id, transactionHash);
      setApprovedJob(initial);
      setPaymentChecking(initial.payment_state === 'UNKNOWN');
      const updated = await resolveUserWalletPayment(
        props.client,
        job.job_id,
        transactionHash,
        initial,
      );
      setApprovedJob(updated);
      setNotice(
        updated.payment_state === 'COMMITTED'
          ? 'Payment confirmed from your connected wallet. Supplier delivery can now continue.'
          : updated.payment_state === 'UNKNOWN'
            ? 'Transaction recorded but not final. Automatic checks ended; use the same transaction check if needed. Do not pay again.'
            : `Payment state: ${updated.payment_state}.`,
      );
    } catch {
      setNotice(
        submittedHash || paymentHash
          ? 'The transaction hash is recorded. Use Check payment to verify it; do not submit another transaction.'
          : prepared
            ? 'No transaction hash was returned. Do not click pay again until you confirm whether the wallet submitted it.'
            : 'The payment was not prepared. Keep the same task key if you need to inspect it.',
      );
    } finally {
      setPaymentChecking(false);
      setStarting(false);
    }
  }

  async function checkPayment(): Promise<void> {
    if (!approvedJob || !paymentHash) return;
    setPaymentChecking(true);
    try {
      const initial = await props.client.submitUserWalletPayment(approvedJob.job_id, paymentHash);
      const updated = await resolveUserWalletPayment(
        props.client,
        approvedJob.job_id,
        paymentHash,
        initial,
      );
      setApprovedJob(updated);
      setNotice(
        updated.payment_state === 'COMMITTED'
          ? 'Payment confirmed from your connected wallet.'
          : 'The same transaction is not final yet. No new payment was submitted.',
      );
    } catch {
      setNotice('Receipt verification is temporarily unavailable. No new payment was submitted.');
    } finally {
      setPaymentChecking(false);
    }
  }

  async function signMcpPayment(): Promise<void> {
    const job = approvedJob;
    const userWallet = props.userWallet;
    const payment = job?.user_payment;
    if (!job || !userWallet || !payment || job.payment_state !== 'READY') return;
    setStarting(true);
    setWalletAttempted(true);
    let submittedHash: string | null = null;
    try {
      const payerWallet = userWallet.address ?? (await userWallet.connect());
      if (!payerWallet) throw new Error('No Ethereum wallet is connected');
      if (payerWallet.toLowerCase() !== payment.payer_wallet.toLowerCase()) {
        throw new Error('The connected wallet does not match the prepared payer wallet');
      }
      setNotice('Review the recipient and amount in your wallet, then confirm the transaction.');
      const transactionHash = await userWallet.sendTransfer(payment);
      submittedHash = transactionHash;
      setPaymentHash(transactionHash);
      const initial = await props.client.submitUserWalletPayment(job.job_id, transactionHash);
      setApprovedJob(initial);
      setPaymentChecking(initial.payment_state === 'UNKNOWN');
      const updated = await resolveUserWalletPayment(
        props.client,
        job.job_id,
        transactionHash,
        initial,
      );
      setApprovedJob(updated);
      setNotice(
        updated.payment_state === 'COMMITTED'
          ? 'Payment confirmed from your connected wallet.'
          : updated.payment_state === 'UNKNOWN'
            ? 'Transaction recorded but not final. Use the same transaction check if needed.'
            : `Payment state: ${updated.payment_state}.`,
      );
    } catch {
      setNotice(
        submittedHash
          ? 'The transaction hash is recorded. Use Check payment to verify it; do not pay again.'
          : 'No transaction hash was returned. Do not approve another payment until you confirm the wallet status.',
      );
    } finally {
      setPaymentChecking(false);
      setStarting(false);
    }
  }

  return (
    <section
      className="panel job-workspace"
      aria-label="Direct Arc payment"
      aria-busy={quoteLoading || starting || mcpJobLoading}
    >
      <header>
        <p className="eyebrow">DIRECT PAYMENT</p>
        <h2>Direct Arc payment</h2>
        <p>
          Send USDC directly to a reviewed recipient on Arc Testnet. OneShot keeps the payment and
          its team-operated sample result bound to one request across retries.
        </p>
      </header>
      <label htmlFor="report-subject">Payment purpose</label>
      <input
        id="report-subject"
        disabled={quoteLoading || starting}
        value={subject}
        onChange={(event) => {
          setSubject(event.target.value);
          clearQuote();
        }}
        placeholder="Describe the payment intent"
      />
      <label htmlFor="report-recipient">Service destination wallet</label>
      <input
        id="report-recipient"
        disabled={quoteLoading || starting}
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
        The connected Privy Ethereum wallet will pay this exact recipient on Arc Testnet. OneShot
        verifies the receipt and never replaces the user wallet payment.
      </small>
      <label htmlFor="report-amount">Amount (USDC)</label>
      <input
        id="report-amount"
        disabled={quoteLoading || starting}
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
        This is the amount the recipient receives, excluding network fees. Up to 6 decimal places.
      </small>
      <details className="advanced-fields">
        <summary>Request key (advanced)</summary>
        <label htmlFor="generated-task-key">Request key</label>
        <input
          id="generated-task-key"
          value={generatedTaskKey}
          readOnly
          placeholder="Generated after entering a subject"
        />
        <small className="field-help">
          Keep this key when retrying. It resumes the same request instead of creating another
          payment.
        </small>
        <label htmlFor="custom-task-key">Custom request key (optional)</label>
        <input
          id="custom-task-key"
          disabled={quoteLoading || starting}
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
          {quoteLoading ? 'Preparing preview…' : 'Review payment details'}
        </button>
      )}
      {quote && !approvedJob && (
        <>
          <SupplierQuotePanel heading="Review before approval" quote={quote} />
          <details className="technical-details agent-handoff">
            <summary>Request for your agent</summary>
            <p>
              Send this exact request to POST /v1/jobs/user-wallet/prepare only after approval and
              add the connected payer_wallet. Reuse its task key when resuming. The amount is in
              USDC atomic units, not dollars; network fees are separate.
            </p>
            <pre className="response-output">{JSON.stringify(request(), null, 2)}</pre>
          </details>
          <p className="field-help">
            Nothing has been paid yet. Approval prepares a durable intent, then your connected
            wallet shows the exact USDC transfer for confirmation. OneShot never uses a server
            wallet for this report.
          </p>
          <button type="button" onClick={() => void start()} disabled={starting || walletAttempted}>
            {starting ? 'Starting request…' : 'Approve and pay from my wallet'}
          </button>
        </>
      )}
      {notice && (
        <p role="status" className="notice">
          {notice}
        </p>
      )}
      {approvedJob && (
        <>
          <SupplierQuotePanel heading="User-wallet payment" quote={approvedJob.supplier} />
          <p role="status" className="field-help">
            Payment state: <strong>{approvedJob.payment_state}</strong>. Payer:{' '}
            <span className="mono">
              {approvedJob.user_payment?.payer_wallet ?? 'connected wallet'}
            </span>
          </p>
          {props.initialJobId &&
            mcpPaymentStillSignable(approvedJob) &&
            approvedJob.user_payment && (
              <button
                type="button"
                onClick={() => void signMcpPayment()}
                disabled={starting || mcpJobLoading || walletAttempted}
              >
                {starting ? 'Waiting for wallet…' : 'Confirm and sign in wallet'}
              </button>
            )}
          {paymentHash && approvedJob.payment_state !== 'COMMITTED' && (
            <button
              type="button"
              className="secondary"
              disabled={paymentChecking}
              onClick={() => void checkPayment()}
            >
              {paymentChecking ? 'Checking Arc receipt…' : 'Check payment (same transaction)'}
            </button>
          )}
          <button
            type="button"
            className="secondary compact"
            onClick={() => props.onSelectIntent(approvedJob.business_intent_id)}
          >
            Open payment proof
          </button>
        </>
      )}
    </section>
  );
}

export function JobList(props: {
  readonly client: JobApiClient;
  readonly onSelectIntent: (id: string) => void;
}) {
  const [requests, setRequests] = useState<readonly JobView[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [checkingPaymentJobId, setCheckingPaymentJobId] = useState<string | null>(null);

  async function refresh(): Promise<void> {
    setLoading(true);
    try {
      const listed = await props.client.list();
      setRequests(listed);
      setError('');
    } catch {
      setError('Requests could not be loaded. Check API readiness and your workspace session.');
    } finally {
      setLoading(false);
    }
  }

  async function checkRecordedPayment(job: JobView): Promise<void> {
    const transactionHash = job.user_payment?.transaction_hash;
    if (job.payment_mode !== 'USER_WALLET' || !transactionHash) return;
    setCheckingPaymentJobId(job.job_id);
    setError('');
    try {
      await props.client.submitUserWalletPayment(job.job_id, transactionHash);
      await refresh();
    } catch {
      setError('The recorded transaction could not be verified. No new payment was submitted.');
    } finally {
      setCheckingPaymentJobId(null);
    }
  }

  useEffect(() => {
    void refresh();
  }, []);

  return (
    <section
      className="panel"
      aria-label="Requests and results"
      aria-busy={loading || checkingPaymentJobId !== null}
    >
      <header className="panel-heading">
        <div>
          <p className="eyebrow">API REQUESTS</p>
          <h2>Requests and results</h2>
        </div>
        <button
          type="button"
          className="secondary compact"
          disabled={loading || checkingPaymentJobId !== null}
          onClick={() => void refresh()}
        >
          {loading ? 'Refreshing…' : 'Refresh requests'}
        </button>
      </header>
      {/* The request list arrives after the panel has mounted, so the tab's own
          fade is long over by the time there is anything to read. Keying this
          block on the loading state remounts it when the rows land, which runs
          the same fade on the content the operator actually waited for. */}
      <div className="tab-fade" key={loading ? 'loading' : 'loaded'}>
        {error && (
          <p role="alert" className="notice error-notice">
            {error}
          </p>
        )}
        {loading ? (
          <p role="status">Checking requests…</p>
        ) : requests.length === 0 ? (
          <p>No requests yet. Open Payment services to start a supported request.</p>
        ) : (
          <ul className="attempts job-list">
            {requests.map((request, index) => {
              const job = request;
              const payment = paymentStatusCopy(job.payment_state);
              const delivery = deliveryStatusCopy(job.delivery_state);
              return (
                <li key={job.job_id}>
                  <div className="job-row-heading">
                    <button
                      type="button"
                      className="secondary compact"
                      onClick={() => props.onSelectIntent(job.business_intent_id)}
                    >
                      Open request {index + 1}
                    </button>
                    <span className={`badge tone-${delivery.tone}`}>{delivery.label}</span>
                  </div>
                  <p>
                    <strong>{serviceLabel(job.tool_id)}</strong> · {payment.label}
                  </p>
                  <p className="job-quote-summary">
                    Price: <span className="mono">{quoteAmount(job.supplier)}</span> ·{' '}
                    {delivery.description}
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
                  {job.result && (
                    <p>
                      <strong>Result ready:</strong> {job.result.report}
                    </p>
                  )}
                  {job.payment_mode === 'USER_WALLET' &&
                    job.payment_state === 'UNKNOWN' &&
                    job.user_payment?.transaction_hash && (
                      <button
                        type="button"
                        className="secondary compact"
                        disabled={
                          loading || checkingPaymentJobId !== null
                        }
                        onClick={() => void checkRecordedPayment(job)}
                      >
                        {checkingPaymentJobId === job.job_id
                          ? 'Checking recorded transaction...'
                          : 'Check recorded transaction (no payment)'}
                      </button>
                    )}
                  <button
                    type="button"
                    className="secondary compact"
                    onClick={() => props.onSelectIntent(job.business_intent_id)}
                  >
                    Open payment proof
                  </button>
                  <details className="technical-details">
                    <summary>Show request details</summary>
                    <dl className="facts">
                      <div>
                        <dt>Request key</dt>
                        <dd className="mono break-all">{maskIdentifier(job.task_key)}</dd>
                      </div>
                      <div>
                        <dt>Supplier order</dt>
                        <dd className="mono break-all">{job.supplier.order_reference}</dd>
                      </div>
                      <div>
                        <dt>Destination</dt>
                        <dd className="mono break-all">{shortenAddress(job.supplier.recipient)}</dd>
                      </div>
                    </dl>
                  </details>
                </li>
              );
            })}
          </ul>
        )}
      </div>
    </section>
  );
}
