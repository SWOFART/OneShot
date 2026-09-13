CREATE TABLE mcp_credentials (
  workspace_id text PRIMARY KEY CHECK (char_length(workspace_id) BETWEEN 1 AND 128),
  token_digest text NOT NULL UNIQUE CHECK (token_digest ~ '^[0-9a-f]{64}$'),
  created_at timestamptz NOT NULL
);
