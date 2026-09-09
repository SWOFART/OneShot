import { useMemo, useState } from 'react';

import {
  RECOVERY_SCENARIOS,
  RecoveryRoute,
  createInMemoryRecoveryClient,
  type RecoveryScenario,
} from '@oneshot/recovery-ui';
import { SettlementDetailsRoute, type SettlementClient } from '@oneshot/settlement-ui';

function scenarioLabel(scenario: RecoveryScenario): string {
  return scenario
    .split('-')
    .map((word) => `${word.slice(0, 1).toUpperCase()}${word.slice(1)}`)
    .join(' ');
}

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
        title="Select an intent to inspect settlement evidence"
        detail="Create or replay an intent first. This read-only view never creates a payment."
      />
    );
  }

  return (
    <div className="composed-surface">
      <SettlementDetailsRoute businessIntentId={businessIntentId} client={client} />
    </div>
  );
}

export function RecoverySurface({ businessIntentId }: { readonly businessIntentId: string }) {
  const [scenario, setScenario] = useState<RecoveryScenario>('aged-unknown');
  const client = useMemo(() => createInMemoryRecoveryClient(scenario), [scenario]);
  const intentId = businessIntentId || 'intent_demo_018f';

  return (
    <section className="composed-surface recovery-surface" aria-label="Recovery evidence review">
      <div className="fixture-toolbar">
        <div>
          <p className="eyebrow">C05 / COMPOSED REVIEW SURFACE</p>
          <strong>Synthetic recovery fixtures</strong>
          <span>
            Review-only states; no fixture exposes settlement permission or a payment action.
          </span>
        </div>
        <label htmlFor="recovery-scenario">
          Scenario
          <select
            id="recovery-scenario"
            value={scenario}
            onChange={(event) => setScenario(event.target.value as RecoveryScenario)}
          >
            {RECOVERY_SCENARIOS.map((value) => (
              <option value={value} key={value}>
                {scenarioLabel(value)}
              </option>
            ))}
          </select>
        </label>
      </div>
      <RecoveryRoute businessIntentId={intentId} client={client} />
    </section>
  );
}
