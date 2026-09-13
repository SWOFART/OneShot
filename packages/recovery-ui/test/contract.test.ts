import { describe, expect, it } from 'vitest';

import { parseRecoveryTimelinePage } from '../src/contract.js';
import { RECOVERY_SCENARIOS, recoveryScenarioPages } from '../src/fixtures.js';

describe('recovery UI contract', () => {
  it.each(RECOVERY_SCENARIOS)('accepts sanitized %s fixtures', (scenario) => {
    for (const page of recoveryScenarioPages[scenario]) {
      expect(parseRecoveryTimelinePage(structuredClone(page))).toEqual(page);
    }
  });

  it.each(['rawProviderBody', 'authorization', 'private_key', 'responseBody'])(
    'rejects forbidden %s fields before component input',
    (field) => {
      const page = structuredClone(recoveryScenarioPages['fresh-wait'][0]);
      expect(page).toBeDefined();
      const unsafe = { ...page, [field]: { hidden: true } };
      expect(() => parseRecoveryTimelinePage(unsafe)).toThrow(/Forbidden recovery UI field/u);
    },
  );

  it('rejects secret-shaped text before component input', () => {
    const page = structuredClone(recoveryScenarioPages['fresh-wait'][0]);
    expect(page).toBeDefined();
    const unsafe = { ...page, summary: 'Authorization: Bearer abc.def.secret' };
    expect(() => parseRecoveryTimelinePage(unsafe)).toThrow(/Unsafe recovery UI text/u);
  });

  it('rejects a mismatched candidate count', () => {
    const page = structuredClone(recoveryScenarioPages['fresh-wait'][0]);
    expect(page?.graph).not.toBeNull();
    const unsafe = { ...page, graph: { ...page?.graph, candidateCount: 99 } };
    expect(() => parseRecoveryTimelinePage(unsafe)).toThrow(/candidate count mismatch/u);
  });
});
