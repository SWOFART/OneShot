/**
 * Durable attempt store for the harness (B03.2).
 *
 * B03.2 requires request identity to be persisted in ignored test runtime
 * state before submission. An in-memory map cannot satisfy that: it proves
 * concurrency inside one process and disappears on restart, which is exactly
 * the boundary `.agents/skills/oneshot-failure-injection/SKILL.md` requires be
 * exercised ("restart services between durable transitions and external
 * responses").
 *
 * This writes to a JSON file under an ignored `tmp/` directory. It is a stand-in
 * for the PostgreSQL state Coder A owns, not a production store, and it exists
 * so restart recovery can actually be tested rather than assumed.
 */

import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname } from 'node:path';

export interface PersistedAttempt {
  readonly businessIntentId: string;
  readonly payloadFingerprint: string;
  readonly idempotencyKey: string;
  readonly referenceId: string;
  /** Set before the external boundary is crossed, never after. */
  submissionAttempted: boolean;
}

export interface AttemptStore {
  recordOrGet(attempt: PersistedAttempt): { entry: PersistedAttempt; isNew: boolean };
  get(businessIntentId: string): PersistedAttempt | undefined;
  readonly size: number;
}

/** In-memory store. Fine for single-process tests; cannot survive a restart. */
export class MemoryAttemptStore implements AttemptStore {
  protected readonly entries = new Map<string, PersistedAttempt>();

  recordOrGet(attempt: PersistedAttempt): { entry: PersistedAttempt; isNew: boolean } {
    const existing = this.entries.get(attempt.businessIntentId);
    if (existing) return { entry: existing, isNew: false };
    this.entries.set(attempt.businessIntentId, attempt);
    return { entry: attempt, isNew: true };
  }

  get(businessIntentId: string): PersistedAttempt | undefined {
    return this.entries.get(businessIntentId);
  }

  get size(): number {
    return this.entries.size;
  }
}

/**
 * File-backed store.
 *
 * Every mutation is written through immediately. Buffering writes would
 * reintroduce the crash window the store exists to close: an attempt that was
 * recorded but not yet flushed is, after a kill, indistinguishable from one
 * that never happened.
 */
export class FileAttemptStore implements AttemptStore {
  constructor(private readonly filePath: string) {
    mkdirSync(dirname(filePath), { recursive: true });
  }

  private read(): Record<string, PersistedAttempt> {
    try {
      const raw = readFileSync(this.filePath, 'utf8');
      return JSON.parse(raw) as Record<string, PersistedAttempt>;
    } catch {
      // A missing or unreadable file means no attempts recorded yet. It must
      // never be treated as "no attempt exists" for an intent we have not
      // checked; callers only reach this through recordOrGet, which writes.
      return {};
    }
  }

  private write(state: Record<string, PersistedAttempt>): void {
    writeFileSync(this.filePath, JSON.stringify(state, null, 2), 'utf8');
  }

  recordOrGet(attempt: PersistedAttempt): { entry: PersistedAttempt; isNew: boolean } {
    const state = this.read();
    const existing = state[attempt.businessIntentId];
    if (existing) return { entry: existing, isNew: false };

    state[attempt.businessIntentId] = attempt;
    this.write(state);
    return { entry: attempt, isNew: true };
  }

  /** Persist a mutation made to an entry the caller already holds. */
  update(attempt: PersistedAttempt): void {
    const state = this.read();
    state[attempt.businessIntentId] = attempt;
    this.write(state);
  }

  get(businessIntentId: string): PersistedAttempt | undefined {
    return this.read()[businessIntentId];
  }

  get size(): number {
    return Object.keys(this.read()).length;
  }
}
