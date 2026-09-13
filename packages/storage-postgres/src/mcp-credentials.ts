import { createHash, randomBytes } from 'node:crypto';
import type { Pool } from 'pg';

const WORKSPACE = /^[a-zA-Z0-9_-]{1,128}$/u;
const TOKEN = /^[a-zA-Z0-9_-]{43}$/u;

export interface McpCredentialStatus {
  readonly configured: boolean;
  readonly createdAt?: string;
}

export interface IssuedMcpCredential {
  readonly bearerToken: string;
  readonly createdAt: string;
}

export class McpCredentialStore {
  constructor(
    private readonly pool: Pick<Pool, 'query'>,
    private readonly now: () => Date = () => new Date(),
    private readonly nextToken: () => string = () => randomBytes(32).toString('base64url'),
  ) {}

  async status(workspaceId: string): Promise<McpCredentialStatus> {
    const workspace = this.workspace(workspaceId);
    const result = await this.pool.query<{ created_at: Date }>(
      'SELECT created_at FROM mcp_credentials WHERE workspace_id = $1',
      [workspace],
    );
    const createdAt = result.rows[0]?.created_at;
    return createdAt
      ? { configured: true, createdAt: createdAt.toISOString() }
      : { configured: false };
  }

  async issue(workspaceId: string, rotate = false): Promise<IssuedMcpCredential | undefined> {
    const workspace = this.workspace(workspaceId);
    const bearerToken = this.nextToken();
    if (!TOKEN.test(bearerToken)) throw new Error('MCP token generator returned an invalid token');
    const createdAt = this.now();
    const digest = this.digest(bearerToken);
    const result = rotate
      ? await this.pool.query<{ created_at: Date }>(
          `INSERT INTO mcp_credentials (workspace_id, token_digest, created_at)
           VALUES ($1, $2, $3)
           ON CONFLICT (workspace_id) DO UPDATE
           SET token_digest = EXCLUDED.token_digest, created_at = EXCLUDED.created_at
           RETURNING created_at`,
          [workspace, digest, createdAt],
        )
      : await this.pool.query<{ created_at: Date }>(
          `INSERT INTO mcp_credentials (workspace_id, token_digest, created_at)
           VALUES ($1, $2, $3)
           ON CONFLICT (workspace_id) DO NOTHING
           RETURNING created_at`,
          [workspace, digest, createdAt],
        );
    const stored = result.rows[0]?.created_at;
    return stored ? { bearerToken, createdAt: stored.toISOString() } : undefined;
  }

  async workspaceForToken(token: string): Promise<string | undefined> {
    if (!TOKEN.test(token)) return undefined;
    const result = await this.pool.query<{ workspace_id: string }>(
      'SELECT workspace_id FROM mcp_credentials WHERE token_digest = $1',
      [this.digest(token)],
    );
    return result.rows[0]?.workspace_id;
  }

  private workspace(value: string): string {
    if (!WORKSPACE.test(value)) throw new Error('Invalid MCP workspace');
    return value;
  }

  private digest(token: string): string {
    return createHash('sha256').update(token, 'utf8').digest('hex');
  }
}
