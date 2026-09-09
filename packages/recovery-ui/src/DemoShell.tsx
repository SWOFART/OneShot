import { useMemo, useState } from 'react';

import { RECOVERY_SCENARIOS, type RecoveryScenario } from './fixtures.js';
import { createInMemoryRecoveryClient } from './mock-server.js';
import { RecoveryRoute } from './RecoveryRoute.js';

function scenarioLabel(scenario: RecoveryScenario): string {
  return scenario
    .split('-')
    .map((word) => `${word.slice(0, 1).toUpperCase()}${word.slice(1)}`)
    .join(' ');
}

export interface DemoShellProps {
  readonly initialScenario: RecoveryScenario;
}

export function DemoShell({ initialScenario }: DemoShellProps) {
  const [scenario, setScenario] = useState<RecoveryScenario>(initialScenario);
  const client = useMemo(() => createInMemoryRecoveryClient(scenario), [scenario]);

  function selectScenario(next: RecoveryScenario): void {
    setScenario(next);
    const url = new URL(window.location.href);
    url.searchParams.set('scenario', next);
    window.history.replaceState(null, '', url);
  }

  return (
    <div className="recovery-slice">
      <aside className="demo-bar" aria-label="Demo controls">
        <div>
          <strong>Synthetic review demo</strong>
          <span>Fixtures only — not live sponsor or settlement evidence.</span>
        </div>
        <label>
          Scenario
          <select
            value={scenario}
            onChange={(event) => selectScenario(event.target.value as RecoveryScenario)}
          >
            {RECOVERY_SCENARIOS.map((value) => (
              <option value={value} key={value}>
                {scenarioLabel(value)}
              </option>
            ))}
          </select>
        </label>
      </aside>
      <RecoveryRoute businessIntentId="intent_demo_018f" client={client} />
    </div>
  );
}
