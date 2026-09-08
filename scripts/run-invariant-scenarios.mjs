#!/usr/bin/env node
/**
 * Invariant Scenario Runner (A06.2).
 * Executes identical replay, conflicting replay, ten parallel workers,
 * two processes, restart, lost response, and downstream failure scenarios.
 */
import { formatScenarioResultsTable, runAllInvariantScenarios } from '../apps/worker/dist/index.js';

async function main() {
  process.stdout.write('Running OneShot invariant scenarios (A06.2)...\n\n');

  const results = await runAllInvariantScenarios();
  const table = formatScenarioResultsTable(results);

  process.stdout.write(`${table}\n\n`);

  const failures = results.filter((r) => r.status !== 'PASS');
  const violations = results.filter((r) => !r.atMostOneSettlementSatisfied);

  if (violations.length > 0) {
    process.stderr.write(
      `CRITICAL INVARIANT VIOLATION: ${violations.length} scenario(s) violated at-most-one settlement!\n`,
    );
    process.exit(1);
  }

  if (failures.length > 0) {
    process.stderr.write(
      `FAILURES DETECTED: ${failures.length} scenario(s) failed verification.\n`,
    );
    process.exit(1);
  }

  process.stdout.write(
    'All 7 invariant scenarios PASSED. 1 business intent -> at most 1 committed settlement verified.\n',
  );
}

main().catch((error) => {
  process.stderr.write(
    `Scenario execution error: ${error instanceof Error ? error.stack : String(error)}\n`,
  );
  process.exit(1);
});
