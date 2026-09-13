import { RecoveryRoute, type RecoveryClient } from '@oneshot/recovery-ui';
import { SettlementDetailsRoute, type SettlementClient } from '@oneshot/settlement-ui';

function EmptySurface({ title, detail }: { readonly title: string; readonly detail: string }) {
  return (
    <section className="panel surface-empty" role="status">
      <p className="eyebrow">ONESHOT / COMPOSED FRONTEND</p>
      <h2>{title}</h2>
      <p>{detail}</p>
    </section>
  );
}

export function SettlementSurface({
  businessIntentId,
  client,
}: {
  readonly businessIntentId: string;
  readonly client: SettlementClient;
}) {
  if (!businessIntentId) {
    return (
      <EmptySurface
        title="Select a request to inspect payment proof"
        detail="Open a request first. This read-only view never creates or retries a payment."
      />
    );
  }

  return (
    <div className="composed-surface">
      <SettlementDetailsRoute businessIntentId={businessIntentId} client={client} />
    </div>
  );
}

export function RecoverySurface({
  businessIntentId,
  client,
}: {
  readonly businessIntentId: string;
  readonly client: RecoveryClient;
}) {
  if (!businessIntentId) {
    return (
      <EmptySurface
        title="Select a request to inspect recovery control"
        detail="Open a request first. Recovery control is read-only and never starts a payment."
      />
    );
  }

  return (
    <div className="composed-surface recovery-surface" aria-label="Recovery control">
      <RecoveryRoute businessIntentId={businessIntentId} client={client} />
    </div>
  );
}
