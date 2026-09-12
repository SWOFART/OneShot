import { formatAtomicUsdcWithAsset } from '@oneshot/settlement-ui';
import { useEffect, useState } from 'react';
import type { JobView, PaidApiQuote, PaidApiResponse, SupplierQuote } from '@oneshot/contracts';
import type { JobApiClient } from '../api/job-client.js';
import type { UserWalletSession } from '../auth/session.js';
import {
  PaidApiUserWalletSubmissionError,
  type PaidApiClient,
} from '../api/paid-api-client.js';
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
      try {
        const job = await props.client.start(jobRequest);
        setApprovedJob(job);
        setNotice('Request accepted. Payment authorization is queued.');
      } catch {
        setNotice('The request was not started. Keep the same request key when retrying.');
      } finally {
        setStarting(false);
      }
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
      setNotice(
        'Review the exact recipient and amount in Privy, then confirm the wallet transaction.',
      );
      prepared = true;
      setWalletAttempted(true);
      const transactionHash = await userWallet.sendTransfer(job.user_payment);
      submittedHash = transactionHash;
      setPaymentHash(transactionHash);
      const updated = await props.client.submitUserWalletPayment(job.job_id, transactionHash);
      setApprovedJob(updated);
      setNotice(
        updated.payment_state === 'COMMITTED'
          ? 'Payment confirmed from your connected wallet. Supplier delivery can now continue.'
          : updated.payment_state === 'UNKNOWN'
            ? 'Transaction recorded but not final. Check the same transaction later; do not pay again.'
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
      setStarting(false);
    }
  }

  async function checkPayment(): Promise<void> {
    if (!approvedJob || !paymentHash) return;
    setPaymentChecking(true);
    try {
      const updated = await props.client.submitUserWalletPayment(approvedJob.job_id, paymentHash);
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

  return (
    <section
      className="panel job-workspace"
      aria-label="Direct Arc payment"
      aria-busy={quoteLoading || starting}
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
        placeholder="Q4 supplier research"
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
              Send this exact request to POST /v1/jobs only after approval. Reuse its task key when
              resuming. The amount is in USDC atomic units, not dollars; network fees are separate.
            </p>
            <pre className="response-output">{JSON.stringify(request(), null, 2)}</pre>
          </details>
          <p className="field-help">
            {props.userWallet
              ? 'Nothing has been paid yet. Approval prepares a durable intent, then your connected wallet shows the exact USDC transfer for confirmation. OneShot never uses a server wallet for this report.'
              : 'Nothing has been paid yet. Approval queues the existing server-wallet payment path for this test composition.'}
          </p>
          <button type="button" onClick={() => void start()} disabled={starting || walletAttempted}>
            {starting
              ? 'Starting request…'
              : props.userWallet
                ? 'Approve and pay from my wallet'
                : 'Approve and run service'}
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
          <SupplierQuotePanel
            heading={props.userWallet ? 'User-wallet payment' : 'Request accepted'}
            quote={approvedJob.supplier}
          />
          {props.userWallet && (
            <>
              <p role="status" className="field-help">
                Payment state: <strong>{approvedJob.payment_state}</strong>. Payer:{' '}
                <span className="mono">
                  {approvedJob.user_payment?.payer_wallet ?? 'connected wallet'}
                </span>
              </p>
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
            </>
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

export function CircleX402DemoPanel(props: {
  readonly client?: PaidApiClient;
  readonly userWallet?: UserWalletSession;
  readonly onSelectIntent: (id: string) => void;
}) {
  const [taskKey, setTaskKey] = useState(() => `circle-api-${crypto.randomUUID().slice(0, 8)}`);
  const [quote, setQuote] = useState<PaidApiQuote | null>(null);
  const [request, setRequest] = useState<PaidApiResponse | null>(null);
  const [loading, setLoading] = useState<'quote' | 'start' | 'sign' | 'refresh' | null>(null);
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
      setNotice('A current price is unavailable. Check the connected service and try again.');
    } finally {
      setLoading(null);
    }
  }

  async function approve(): Promise<void> {
    const approvedQuote = request?.quote ?? quote;
    if (!props.client || !approvedQuote) return;
    setLoading('start');
    setNotice('');
    try {
      if (!props.userWallet) {
        const result = await props.client.start({ ...paidApiRequest, approved_quote: approvedQuote });
        setRequest(result);
        setNotice('Request accepted. OneShot now owns the payment attempt.');
        return;
      }
      const payerWallet = props.userWallet.address ?? (await props.userWallet.connect());
      if (!payerWallet) throw new Error('No Ethereum wallet is connected');
      const result = await props.client.prepareUserWallet({
        ...paidApiRequest,
        approved_quote: approvedQuote,
        payer_wallet: payerWallet,
      });
      setRequest(result);
      setNotice('Request prepared. Your wallet will now ask you to sign the exact Circle payment.');
      await signAndSubmit(result, approvedQuote, payerWallet);
    } catch (error) {
      if (!props.userWallet) setQuote(null);
      setNotice(
        props.userWallet && error instanceof PaidApiUserWalletSubmissionError
          ? error.message
          : props.userWallet
            ? 'The payment was not completed. If your wallet showed a signature request, check the same request status before trying again.'
          : 'The API request was not accepted. Keep the same request key before retrying.',
      );
    } finally {
      setLoading(null);
    }
  }

  async function signAndSubmit(
    prepared: PaidApiResponse,
    approvedQuote: PaidApiQuote,
    payerWallet: string,
  ): Promise<void> {
    if (!props.client || !props.userWallet) return;
    setLoading('sign');
    const paymentPayload = await props.userWallet.signX402Payment(approvedQuote);
    const submitted = await props.client.submitUserWalletPayment(
      prepared.business_intent_id,
      payerWallet,
      paymentPayload,
    );
    setRequest(submitted);
    setNotice(
      submitted.payment_state === 'COMMITTED'
        ? 'Payment confirmed from your connected wallet. The dataset result is ready.'
        : submitted.payment_state === 'UNKNOWN'
          ? 'The signed payment was recorded but is not final. Check the same request; do not sign another payment.'
          : `Payment state: ${submitted.payment_state}.`,
    );
  }

  async function signPrepared(): Promise<void> {
    if (!request || !quote || !props.userWallet) return;
    const payerWallet = request.payer_wallet ?? props.userWallet.address;
    if (!payerWallet) {
      setNotice('Connect the same wallet that was bound to this request.');
      return;
    }
    setNotice('');
    try {
      await signAndSubmit(request, quote, payerWallet);
    } catch (error) {
      setNotice(
        error instanceof PaidApiUserWalletSubmissionError
          ? error.message
          : 'The payment was not completed. Check the same request status before trying again.',
      );
    } finally {
      setLoading(null);
    }
  }

  async function refresh(): Promise<void> {
    if (!props.client || !request) return;
    setLoading('refresh');
    try {
      const updated =
        props.userWallet && request.payment_mode === 'USER_WALLET'
          ? await props.client.reconcileUserWalletPayment(request.business_intent_id)
          : await props.client.get(request.business_intent_id);
      setRequest(updated);
      setNotice('Payment status checked from the OneShot ledger.');
    } catch {
      setNotice('Payment state could not be refreshed; no new payment was submitted.');
    } finally {
      setLoading(null);
    }
  }

  return (
    <section className="panel paid-api-panel" aria-label="OneShot x402 Dataset service">
      <header className="panel-heading">
        <div>
          <p className="eyebrow">TEAM-OPERATED X402 DEMO</p>
          <h2>OneShot x402 Dataset</h2>
        </div>
        <span className="badge tone-neutral">Arc Testnet</span>
      </header>
      <p>
        Buy a demo dataset from OneShot’s own seller through Circle x402. OneShot keeps one request
        key so a retry reuses the original payment instead of charging twice. When a connected
        wallet is used, it signs the exact payment to the API seller; OneShot never substitutes its
        own wallet.
      </p>
      {props.userWallet && (
        <p className="field-help">
          Circle Gateway requires this wallet to have a funded Arc Testnet Gateway balance. OneShot
          does not deposit or move funds automatically; approval only signs the reviewed payment.
        </p>
      )}
      <label htmlFor="paid-api-task-key">Request key</label>
      <input
        id="paid-api-task-key"
        disabled={loading !== null || request !== null}
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
        Keep this exact key if the browser or agent retries. It identifies the same API request.
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
          {loading === 'quote' ? 'Checking price…' : 'Check price'}
        </button>
      ) : null}
      {quote && !request && (
        <>
          <section className="panel quote-panel" aria-label="Paid API quote">
            <header className="panel-heading">
              <h3>Review payment</h3>
              <span className="badge tone-neutral">No charge yet</span>
            </header>
            <dl className="facts">
              <div>
                <dt>Recipient receives</dt>
                <dd className="mono">
                  {formatAtomicUsdcWithAsset(quote.amount_atomic, quote.asset) ?? 'Unavailable'}
                </dd>
              </div>
              <div>
                <dt>Service destination</dt>
                <dd className="mono" title={quote.recipient}>
                  {shortenAddress(quote.recipient)}
                </dd>
              </div>
              {props.userWallet?.address && (
                <div>
                  <dt>Payer wallet</dt>
                  <dd className="mono" title={props.userWallet.address}>
                    {shortenAddress(props.userWallet.address)}
                  </dd>
                </div>
              )}
              <div>
                <dt>Network</dt>
                <dd>{networkLabel(quote.network)}</dd>
              </div>
            </dl>
            <details className="technical-details">
              <summary>Show API payment details</summary>
              <dl className="facts">
                <div>
                  <dt>Resource</dt>
                  <dd className="break-all">{quote.resource_url}</dd>
                </div>
                <div>
                  <dt>Full destination</dt>
                  <dd className="mono break-all">{quote.recipient}</dd>
                </div>
              </dl>
            </details>
          </section>
          <p className="field-help">
            {props.userWallet
              ? 'Approval binds your wallet, the seller, the amount and Arc Testnet. Your wallet signs one Circle Gateway authorization; OneShot forwards it once and verifies the Arc receipt.'
              : 'Approval creates the request. The server-side Privy execution wallet pays in this test composition; your connected wallet is not charged here.'}
          </p>
          <button type="button" disabled={loading !== null} onClick={() => void approve()}>
            {loading === 'start' || loading === 'sign'
              ? loading === 'sign'
                ? 'Waiting for wallet signature…'
                : 'Preparing request…'
              : props.userWallet
                ? 'Approve and pay from my wallet'
                : 'Approve and get result'}
          </button>
        </>
      )}
      {request && (
        <section className="paid-api-status" aria-label="Paid API payment status">
          <div className="job-row-heading">
            <strong>{paymentStatusCopy(request.payment_state).label}</strong>
            <span className={`badge tone-${paymentStatusCopy(request.payment_state).tone}`}>
              One request
            </span>
          </div>
          <p>{paymentStatusCopy(request.payment_state).description}</p>
          {request.settlement ? (
            <p>
              <strong>Arc payment confirmed.</strong>{' '}
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
              Check this request again later. Do not start a new request while payment verification
              is in progress.
            </p>
          )}
          {props.userWallet && request.payment_state === 'READY' && (
            <button
              type="button"
              className="secondary compact"
              disabled={loading !== null}
              onClick={() => void signPrepared()}
            >
              {loading === 'sign' ? 'Waiting for wallet signature…' : 'Sign and pay from my wallet'}
            </button>
          )}
          {request.response !== undefined && (
            <div className="response-output">
              <strong>API result</strong>
              <pre>{JSON.stringify(request.response, null, 2)}</pre>
            </div>
          )}
          <button
            type="button"
            className="secondary compact"
            disabled={loading !== null}
            onClick={() => void refresh()}
          >
            {loading === 'refresh' ? 'Checking…' : 'Check payment status'}
          </button>
          <button
            type="button"
            className="secondary compact"
            onClick={() => props.onSelectIntent(request.business_intent_id)}
          >
            Open payment proof
          </button>
          <details className="technical-details">
            <summary>Show technical request details</summary>
            <dl className="facts">
              <div>
                <dt>Request identity</dt>
                <dd className="mono break-all">{maskIdentifier(request.business_intent_id, 10)}</dd>
              </div>
              <div>
                <dt>Resource</dt>
                <dd className="break-all">{request.resource_url}</dd>
              </div>
              {request.provider_transaction_hash && (
                <div>
                  <dt>Circle transaction</dt>
                  <dd>
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
                  </dd>
                </div>
              )}
            </dl>
          </details>
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
        Open service deployment runbook
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
  const [resumingJobId, setResumingJobId] = useState<string | null>(null);

  async function refresh(): Promise<void> {
    setLoading(true);
    try {
      setJobs(await props.client.list());
      setError('');
    } catch {
      setError('Requests could not be loaded. Check API readiness and your workspace session.');
    } finally {
      setLoading(false);
    }
  }

  async function resume(jobId: string): Promise<void> {
    setResumingJobId(jobId);
    setError('');
    try {
      await props.client.resume(jobId);
      await refresh();
    } catch {
      setError('The result could not be resumed. No new payment was submitted.');
    } finally {
      setResumingJobId(null);
    }
  }

  useEffect(() => {
    void refresh();
  }, []);

  return (
    <section
      className="panel"
      aria-label="Requests and results"
      aria-busy={loading || resumingJobId !== null}
    >
      <header className="panel-heading">
        <div>
          <p className="eyebrow">API REQUESTS</p>
          <h2>Requests and results</h2>
        </div>
        <button
          type="button"
          className="secondary compact"
          disabled={loading || resumingJobId !== null}
          onClick={() => void refresh()}
        >
          {loading ? 'Refreshing…' : 'Refresh requests'}
        </button>
      </header>
      {error && (
        <p role="alert" className="notice error-notice">
          {error}
        </p>
      )}
      {loading ? (
        <p role="status">Checking requests…</p>
      ) : jobs.length === 0 ? (
        <p>No requests yet. Open Payment services to start a supported request.</p>
      ) : (
        <ul className="attempts job-list">
          {jobs.map((job, index) => {
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
                {job.result ? (
                  <p>
                    <strong>Result ready:</strong> {job.result.report}
                  </p>
                ) : job.payment_state === 'COMMITTED' ? (
                  <button
                    type="button"
                    className="secondary compact"
                    disabled={resumingJobId !== null}
                    onClick={() => void resume(job.job_id)}
                  >
                    {resumingJobId === job.job_id ? 'Resuming…' : 'Resume result (no new payment)'}
                  </button>
                ) : null}
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
    </section>
  );
}
