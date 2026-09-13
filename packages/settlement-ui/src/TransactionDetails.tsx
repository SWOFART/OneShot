import type { SettlementDetailsView } from './contract.js';

export interface TransactionDetailsProps {
  readonly view: SettlementDetailsView;
}

/**
 * B05.4 verified transaction details.
 *
 * The transaction block renders only when the projection marked the settlement
 * verified: a committed durable state, a well-formed Arc identity, and
 * authoritative Arc evidence. Anything less renders as unverified rather than
 * presenting an unproven hash as settled fact.
 */
export function TransactionDetails({ view }: TransactionDetailsProps) {
  const transaction = view.transaction;

  if (transaction === null) {
    return (
      <section className="panel transaction-panel" aria-labelledby="transaction-heading">
        <header className="panel-heading">
          <h2 id="transaction-heading">Transaction</h2>
          <span className="badge tone-neutral">
            {view.verification === 'UNVERIFIED' ? 'Unverified' : 'None recorded'}
          </span>
        </header>
        <p className="panel-lede">
          {view.verification === 'UNVERIFIED'
            ? 'A settlement record exists but is not yet bound to authoritative Arc evidence, so its details are withheld.'
            : 'No settled transaction is recorded for this intent.'}
        </p>
      </section>
    );
  }

  return (
    <section className="panel transaction-panel" aria-labelledby="transaction-heading">
      <header className="panel-heading">
        <h2 id="transaction-heading">Transaction</h2>
        <span className="badge tone-success">Verified</span>
      </header>
      <dl className="facts">
        <div>
          <dt>Transaction hash</dt>
          <dd className="mono break-all">{transaction.transactionHash}</dd>
        </div>
        <div>
          <dt>Block</dt>
          <dd className="mono">{transaction.blockNumber}</dd>
        </div>
        <div>
          <dt>Token contract</dt>
          <dd className="mono break-all">{transaction.tokenContract ?? 'Not reported'}</dd>
        </div>
        <div>
          <dt>Recipient</dt>
          <dd className="mono break-all">{transaction.recipient}</dd>
        </div>
        <div>
          <dt>Amount</dt>
          <dd>
            <span className="mono">{transaction.amountDisplay ?? 'Malformed amount'}</span>{' '}
            {view.policy.asset}
          </dd>
        </div>
        <div>
          <dt>Transfer identity</dt>
          <dd className="mono">log index {transaction.transferLogIndex}</dd>
        </div>
        <div>
          <dt>Provider reference</dt>
          <dd className="mono break-all">{transaction.providerReferenceId}</dd>
        </div>
      </dl>
      {transaction.explorer.href !== null ? (
        <p className="explorer-link">
          <a href={transaction.explorer.href} target="_blank" rel="noreferrer noopener">
            View on the Arc explorer
          </a>
        </p>
      ) : (
        <p className="panel-note">
          {transaction.explorer.rejectedReason ??
            'No explorer link was published for this transaction.'}
        </p>
      )}
    </section>
  );
}
