import type { RecoveryTimelinePage, TimelineEntry } from './contract.js';

export interface TimelineItem extends TimelineEntry {
  readonly duplicateCount: number;
  readonly orderAmbiguous: boolean;
}

function compareSequence(left: string | null, right: string | null): number | null {
  if (left === null || right === null || !/^\d+$/u.test(left) || !/^\d+$/u.test(right)) {
    return null;
  }
  const leftValue = BigInt(left);
  const rightValue = BigInt(right);
  return leftValue < rightValue ? -1 : leftValue > rightValue ? 1 : 0;
}

export function mergeTimelinePages(
  pages: readonly RecoveryTimelinePage[],
): readonly TimelineItem[] {
  const byId = new Map<
    string,
    { entry: TimelineEntry; duplicateCount: number; firstSeen: number }
  >();
  let seen = 0;

  for (const page of pages) {
    for (const entry of page.timeline) {
      const existing = byId.get(entry.eventId);
      if (existing) {
        existing.duplicateCount += 1;
      } else {
        byId.set(entry.eventId, { entry, duplicateCount: 0, firstSeen: seen });
      }
      seen += 1;
    }
  }

  const ordered = [...byId.values()].sort((left, right) => {
    const sequence = compareSequence(left.entry.sequence, right.entry.sequence);
    if (sequence !== null && sequence !== 0) return sequence;
    const time = Date.parse(left.entry.timestamp) - Date.parse(right.entry.timestamp);
    return time === 0 ? left.firstSeen - right.firstSeen : time;
  });

  return ordered.map((item, index) => {
    const previous = ordered[index - 1]?.entry;
    const next = ordered[index + 1]?.entry;
    const sameClockWithoutSequence = (other: TimelineEntry | undefined): boolean =>
      other !== undefined &&
      item.entry.timestamp === other.timestamp &&
      (item.entry.sequence === null || other.sequence === null);
    return {
      ...item.entry,
      duplicateCount: item.duplicateCount,
      orderAmbiguous: sameClockWithoutSequence(previous) || sameClockWithoutSequence(next),
    };
  });
}

export function formatUtc(value: string): string {
  return new Intl.DateTimeFormat('en', {
    dateStyle: 'medium',
    timeStyle: 'medium',
    timeZone: 'UTC',
  }).format(new Date(value));
}

export function authorityLabel(authority: TimelineEntry['authorityClass']): string {
  switch (authority) {
    case 'AUTHORITATIVE_ONESHOT':
      return 'Authoritative · OneShot';
    case 'AUTHORITATIVE_CHAIN_EVIDENCE':
      return 'Authoritative · Arc chain';
    case 'PROVIDER_OBSERVATION':
      return 'Observation · Provider';
    case 'NON_AUTHORITATIVE_CANDIDATE_DISCOVERY':
      return 'Candidate discovery · Non-authoritative';
    case 'ADVISORY_AGENT_OBSERVATION':
      return 'Advisory · LLM';
  }
}
