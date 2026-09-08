import { useMemo, useState } from 'react';

import { createInMemorySettlementClient } from './client.js';
import {
  FIXTURE_EXPLORER_HOSTS,
  SETTLEMENT_SCENARIOS,
  SETTLEMENT_SCENARIO_INTENTS,
} from './fixtures.js';
import { SettlementDetailsRoute } from './SettlementDetailsRoute.js';

export interface DemoShellProps {
  readonly initialScenario?: string;
}

const SCENARIOS = Object.values(SETTLEMENT_SCENARIOS);
const DEFAULT_SCENARIO = SCENARIOS[0]?.scenario ?? '';

/**
 * Standalone fixture viewer for reviewing the slice without the application
 * shell. Every value on screen comes from synthetic fixtures.
 */
export function DemoShell({ initialScenario }: DemoShellProps) {
  const [scenarioName, setScenarioName] = useState(initialScenario ?? DEFAULT_SCENARIO);
  const client = useMemo(() => createInMemorySettlementClient(SETTLEMENT_SCENARIO_INTENTS), []);
  const scenario = SETTLEMENT_SCENARIOS[scenarioName] ?? SETTLEMENT_SCENARIOS[DEFAULT_SCENARIO];

  if (scenario === undefined) {
    return (
      <section className="route-state" role="alert">
        <h1>No fixtures are published.</h1>
      </section>
    );
  }

  return (
    <>
      <div className="demo-bar">
        <strong>Synthetic review fixtures. Not live settlement evidence.</strong>
        <div className="demo-scenarios">
          <label htmlFor="settlement-scenario">Scenario</label>
          <select
            id="settlement-scenario"
            value={scenario.scenario}
            onChange={(event) => setScenarioName(event.target.value)}
          >
            {SCENARIOS.map((entry) => (
              <option key={entry.scenario} value={entry.scenario}>
                {entry.scenario}
              </option>
            ))}
          </select>
        </div>
      </div>
      <SettlementDetailsRoute
        businessIntentId={scenario.intent.business_intent_id}
        client={client}
        allowedExplorerHosts={FIXTURE_EXPLORER_HOSTS}
      />
    </>
  );
}
