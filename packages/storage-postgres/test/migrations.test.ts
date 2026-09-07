import { describe, expect, it } from 'vitest';
import {
  migrationDigest,
  STORAGE_V1_SCHEMA_DIGEST,
  SYNTHETIC_STORAGE_FIXTURES,
  SYNTHETIC_ACCEPTED_INTENT_FIXTURE,
  SYNTHETIC_COMMITTED_INTENT_FIXTURE,
  SYNTHETIC_UNKNOWN_RECONCILING_FIXTURE,
} from '../src/index.js';

describe('storage-v1 migrations and schema', () => {
  it('matches the frozen storage-v1 schema digest', async () => {
    const digest = await migrationDigest();
    expect(digest).toBe(STORAGE_V1_SCHEMA_DIGEST);
    expect(digest).toMatch(/^[0-9a-f]{64}$/u);
  });

  it('provides valid synthetic database snapshots', () => {
    expect(SYNTHETIC_STORAGE_FIXTURES).toHaveLength(3);

    expect(SYNTHETIC_ACCEPTED_INTENT_FIXTURE.intents[0]?.state).toBe('AUTHORIZING');
    expect(SYNTHETIC_ACCEPTED_INTENT_FIXTURE.attempts).toHaveLength(1);
    expect(SYNTHETIC_ACCEPTED_INTENT_FIXTURE.outbox_jobs).toHaveLength(1);
    expect(SYNTHETIC_ACCEPTED_INTENT_FIXTURE.settlements).toHaveLength(0);

    expect(SYNTHETIC_COMMITTED_INTENT_FIXTURE.intents[0]?.state).toBe('COMMITTED');
    expect(SYNTHETIC_COMMITTED_INTENT_FIXTURE.settlements).toHaveLength(1);
    expect(SYNTHETIC_COMMITTED_INTENT_FIXTURE.evidence).toHaveLength(1);

    expect(SYNTHETIC_UNKNOWN_RECONCILING_FIXTURE.intents[0]?.state).toBe('UNKNOWN');
    expect(SYNTHETIC_UNKNOWN_RECONCILING_FIXTURE.outbox_jobs[0]?.task_identifier).toBe(
      'reconcile_intent',
    );
  });
});
