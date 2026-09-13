import { createHash } from 'node:crypto';
import type { Pool } from 'pg';
import { describe, expect, it, vi } from 'vitest';
import { McpCredentialStore } from '../src/mcp-credentials.js';

const TOKEN = 'a'.repeat(43);
const NOW = new Date('2026-09-13T04:00:00.000Z');

describe('MCP credential store', () => {
  it('stores only a digest and returns the token once', async () => {
    const query = vi.fn(async () => ({ rows: [{ created_at: NOW }] }));
    const store = new McpCredentialStore(
      { query } as unknown as Pick<Pool, 'query'>,
      () => NOW,
      () => TOKEN,
    );

    await expect(store.issue('privy_alice')).resolves.toEqual({
      bearerToken: TOKEN,
      createdAt: NOW.toISOString(),
    });
    const values = query.mock.calls[0]?.[1] as unknown[];
    expect(values).toEqual(['privy_alice', createHash('sha256').update(TOKEN).digest('hex'), NOW]);
    expect(values).not.toContain(TOKEN);
  });

  it('looks up the workspace by token digest', async () => {
    const query = vi.fn(async () => ({ rows: [{ workspace_id: 'privy_alice' }] }));
    const store = new McpCredentialStore({ query } as unknown as Pick<Pool, 'query'>);

    await expect(store.workspaceForToken(TOKEN)).resolves.toBe('privy_alice');
    expect(query.mock.calls[0]?.[1]).toEqual([createHash('sha256').update(TOKEN).digest('hex')]);
    await expect(store.workspaceForToken('short')).resolves.toBeUndefined();
    expect(query).toHaveBeenCalledOnce();
  });
});
