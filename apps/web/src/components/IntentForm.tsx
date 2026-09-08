import { parseCreateIntentRequest, type CreateIntentRequest } from '@oneshot/contracts';
import { useMemo, useState, type FormEvent } from 'react';

import type { CreateIntentResult, OneShotApiClient } from '../api/client.js';
import { usdcToAtomicUnits } from '../utils/money.js';

interface Props {
  readonly client: OneShotApiClient;
  readonly onIntentCreatedOrSelected?: (intentId: string) => void;
}

interface Outcome {
  readonly kind: 'accepted' | 'replayed' | 'conflict' | 'error';
  readonly title: string;
  readonly message: string;
}

function buildRequest(
  intentId: string,
  recipient: string,
  humanAmount: string,
  purpose: string,
): CreateIntentRequest {
  const amount = usdcToAtomicUnits(humanAmount);
  if (amount === '0') throw new Error('Amount must be greater than zero.');
  return parseCreateIntentRequest({
    business_intent_id: intentId.trim(),
    recipient: recipient.trim(),
    amount_atomic: amount,
    asset: 'USDC',
    network: 'eip155:5042002',
    purpose: purpose.trim(),
  });
}

function outcomeFor(result: CreateIntentResult): Outcome {
  switch (result.kind) {
    case 'ACCEPTED':
      return {
        kind: 'accepted',
        title: 'ACCEPTED — new intent',
        message: `Authoritative state: ${result.intent.state}.`,
      };
    case 'REPLAYED':
      return {
        kind: 'replayed',
        title: 'REPLAYED — identical payload',
        message: 'Existing intent returned. No duplicate settlement was created.',
      };
    case 'PAYLOAD_CONFLICT':
      return {
        kind: 'conflict',
        title: 'PAYLOAD CONFLICT',
        message:
          'This ID already belongs to another immutable payload. Use a new ID only for a new obligation.',
      };
    default:
      return { kind: 'error', title: 'REQUEST FAILED', message: result.message };
  }
}

export function IntentForm({ client, onIntentCreatedOrSelected }: Props) {
  const [intentId, setIntentId] = useState<string>(() => crypto.randomUUID());
  const [recipient, setRecipient] = useState('');
  const [amount, setAmount] = useState('1.00');
  const [purpose, setPurpose] = useState('Paid API job');
  const [submitting, setSubmitting] = useState(false);
  const [validationError, setValidationError] = useState<string | null>(null);
  const [outcome, setOutcome] = useState<Outcome | null>(null);
  const atomicPreview = useMemo(() => {
    try {
      return usdcToAtomicUnits(amount);
    } catch {
      return 'Invalid amount';
    }
  }, [amount]);

  function newObligation(): void {
    setIntentId(crypto.randomUUID());
    setOutcome(null);
    setValidationError(null);
  }

  async function submit(event: FormEvent): Promise<void> {
    event.preventDefault();
    setOutcome(null);
    setValidationError(null);
    let request: CreateIntentRequest;
    try {
      request = buildRequest(intentId, recipient, amount, purpose);
    } catch (error) {
      setValidationError(error instanceof Error ? error.message : 'Invalid intent.');
      return;
    }

    setSubmitting(true);
    try {
      const result = await client.createOrReplayIntent(request);
      setOutcome(outcomeFor(result));
      if (result.kind === 'ACCEPTED' || result.kind === 'REPLAYED') {
        onIntentCreatedOrSelected?.(result.intent.business_intent_id);
      }
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <form
      className="panel form"
      aria-label="Create or replay business intent"
      onSubmit={(event) => void submit(event)}
    >
      <header>
        <h2>Create or replay intent</h2>
        <p>Same ID and payload returns the existing intent. A changed payload fails closed.</p>
      </header>

      {validationError && (
        <div className="notice error" role="alert">
          {validationError}
        </div>
      )}
      {outcome && (
        <div className={`notice ${outcome.kind}`} role="status" aria-live="polite">
          <strong>{outcome.title}</strong>
          <p>{outcome.message}</p>
        </div>
      )}

      <div className="label-row">
        <label htmlFor="intent-id-input">Business Intent ID</label>
        <button className="secondary compact" type="button" onClick={newObligation}>
          New obligation ID
        </button>
      </div>
      <input
        id="intent-id-input"
        value={intentId}
        onChange={(event) => setIntentId(event.target.value)}
        maxLength={128}
        required
      />
      <small>Keep this ID unchanged for every retry of the same job.</small>

      <label htmlFor="recipient-input">Recipient</label>
      <input
        id="recipient-input"
        value={recipient}
        onChange={(event) => setRecipient(event.target.value)}
        placeholder="0x…"
        spellCheck={false}
        required
      />

      <div className="payment-grid">
        <div>
          <label htmlFor="amount-input">Amount in USDC</label>
          <input
            id="amount-input"
            inputMode="decimal"
            value={amount}
            onChange={(event) => setAmount(event.target.value)}
            required
          />
          <small>{atomicPreview} atomic units</small>
        </div>
        <div>
          <span className="field-label">Settlement profile</span>
          <output>Arc Testnet · USDC · eip155:5042002</output>
          <small>Fixed by OpenAPI v1. Payment amount is USDC; native value is separate.</small>
        </div>
      </div>

      <label htmlFor="purpose-input">Purpose</label>
      <input
        id="purpose-input"
        value={purpose}
        onChange={(event) => setPurpose(event.target.value)}
        maxLength={256}
        required
      />

      <button type="submit" disabled={submitting}>
        {submitting ? 'Submitting…' : 'Submit Intent (or Replay)'}
      </button>
    </form>
  );
}
