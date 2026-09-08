import { describe, expect, it } from 'vitest';

import { RECOVERY_MOCK_SERVER_VERSION } from '../src/contract.js';
import { createInMemoryRecoveryClient, handleRecoveryMockRequest } from '../src/mock-server.js';

describe('C05 frozen mock server', () => {
  it('serves versioned paginated recovery data', async () => {
    const client = createInMemoryRecoveryClient('aged-unknown');
    const first = await client.readPage('intent_custom', null);
    const second = await client.readPage('intent_custom', first.page.nextCursor);

    expect(first.mockServerVersion).toBe(RECOVERY_MOCK_SERVER_VERSION);
    expect(first.businessIntentId).toBe('intent_custom');
    expect(first.page.nextCursor).toBe('older');
    expect(second.page.cursor).toBe('older');
  });

  it('exposes refresh and escalation only', async () => {
    const client = createInMemoryRecoveryClient('aged-unknown');
    await expect(client.refresh('intent_custom')).resolves.toMatchObject({
      action: 'REFRESH_STATUS',
      accepted: true,
    });
    await expect(client.escalate('intent_custom')).resolves.toMatchObject({
      action: 'ESCALATE',
      accepted: true,
    });
    expect(
      handleRecoveryMockRequest(
        'http://mock.local/mock/v1/intents/intent_custom/recovery/retry',
        'POST',
      ),
    ).toBeNull();
  });

  it('fails closed on mutating methods for recovery reads', () => {
    expect(
      handleRecoveryMockRequest(
        'http://mock.local/mock/v1/intents/intent_custom/recovery?scenario=fresh-wait',
        'DELETE',
      ),
    ).toMatchObject({ status: 405 });
  });
});
