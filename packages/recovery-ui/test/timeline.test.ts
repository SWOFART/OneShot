import { describe, expect, it } from 'vitest';

import { recoveryScenarioPages } from '../src/fixtures.js';
import { mergeTimelinePages } from '../src/timeline.js';

describe('timeline normalization', () => {
  it('merges pages, collapses duplicate observations, and preserves stable ordering', () => {
    const timeline = mergeTimelinePages(recoveryScenarioPages['fresh-wait']);
    expect(timeline).toHaveLength(5);
    expect(timeline.map((entry) => entry.eventId)).toEqual([
      'privy-observation-09',
      'submission-unknown-08',
      'graph-observation-10',
      'advisor-12',
      'decision-12',
    ]);
    expect(timeline.find((entry) => entry.eventId === 'graph-observation-10')?.duplicateCount).toBe(
      1,
    );
  });

  it('labels equal-clock events without durable sequence as order ambiguous', () => {
    const timeline = mergeTimelinePages(recoveryScenarioPages['fresh-wait']);
    expect(timeline.find((entry) => entry.eventId === 'privy-observation-09')?.orderAmbiguous).toBe(
      true,
    );
    expect(
      timeline.find((entry) => entry.eventId === 'submission-unknown-08')?.orderAmbiguous,
    ).toBe(true);
  });
});
