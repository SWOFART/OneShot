import { useEffect, useState } from 'react';
import type { IssuedMcpCredential, JobApiClient, McpCredentialStatus } from '../api/job-client.js';

const MCP_URL = 'https://oneshot.kapustazh.dev/mcp';
const SKILL_INSTALL =
  'npx --yes skills@latest add https://github.com/SWOFART/OneShot/tree/develop --skill oneshot-arc-payment';

function configFor(token: string): string {
  return JSON.stringify(
    {
      mcpServers: {
        oneshot: {
          type: 'http',
          url: MCP_URL,
          headers: { Authorization: `Bearer ${token}` },
        },
      },
    },
    null,
    2,
  );
}

export function McpProfile(props: { readonly client: JobApiClient }) {
  const [status, setStatus] = useState<McpCredentialStatus | null>(null);
  const [issued, setIssued] = useState<IssuedMcpCredential | null>(null);
  const [copied, setCopied] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    void props.client
      .mcpCredentialStatus()
      .then(setStatus)
      .catch(() => setError('MCP access is unavailable right now.'));
  }, [props.client]);

  async function issue(): Promise<void> {
    setBusy(true);
    setCopied(false);
    setError(null);
    try {
      const credential = await props.client.issueMcpCredential(status?.configured === true);
      setIssued(credential);
      setStatus({
        configured: true,
        created_at: credential.created_at,
        request_key: credential.request_key,
      });
    } catch {
      setError('Could not generate the MCP bearer token.');
    } finally {
      setBusy(false);
    }
  }

  async function copyBearer(): Promise<void> {
    try {
      if (!issued || !navigator.clipboard) throw new Error('Clipboard is unavailable');
      await navigator.clipboard.writeText(issued.bearer_token);
      setCopied(true);
    } catch {
      setCopied(false);
      setError('Could not copy the bearer token.');
    }
  }

  return (
    <section className="panel" aria-labelledby="profile-heading">
      <p className="eyebrow">PROFILE / AGENT ACCESS</p>
      <h2 id="profile-heading">Connect your agent</h2>
      <p>Your bearer is bound to this Privy account and its private request workspace.</p>
      <p>
        <a href="/docs/mcp">Open MCP documentation</a>
      </p>

      <button type="button" disabled={busy} onClick={() => void issue()}>
        {busy
          ? 'Generating…'
          : status?.configured
            ? 'Rotate bearer token'
            : 'Generate bearer token'}
      </button>
      {error && <p role="alert">{error}</p>}
      {status?.configured && !issued && (
        <p className="docs-note">
          A bearer already exists. It is stored only as a digest, so rotate it to reveal a new one.
        </p>
      )}
      {issued && (
        <>
          <p className="docs-note" role="status">
            Copy this configuration now. The bearer will be hidden when you leave this page.
          </p>
          <pre className="docs-code" aria-label="Personal MCP client configuration">
            <code>{configFor(issued.bearer_token)}</code>
          </pre>
          <button type="button" className="btn-copy" onClick={() => void copyBearer()}>
            {copied ? 'Bearer copied' : 'Copy bearer token'}
          </button>
          <p>
            Request key: <code>{issued.request_key}</code>
          </p>
        </>
      )}

      <h3 className="skill-install-heading">Install the payment skill for the agent</h3>
      <p>
        First install <a href="https://nodejs.org/en/download">Node.js</a> — npm comes with it and
        brings <code>npx</code>. Then install the OneShot payment skill:
      </p>
      <pre className="docs-code" aria-label="Personal agent skill install command">
        <code>{SKILL_INSTALL}</code>
      </pre>
    </section>
  );
}
