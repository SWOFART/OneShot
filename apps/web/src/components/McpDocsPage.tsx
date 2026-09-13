import { CommitRing } from '@oneshot/brand';

import type { Theme } from '../theme.js';

const clientConfig = `{
  "mcpServers": {
    "oneshot": {
      "type": "http",
      "url": "https://oneshot.kapustazh.dev/mcp",
      "headers": {
        "Authorization": "Bearer <ONESHOT_MCP_BEARER_TOKEN>"
      }
    }
  }
}`;

const skillInstall =
  'npx --yes skills@latest add https://github.com/SWOFART/OneShot/tree/develop --skill oneshot-arc-payment';

const toolInput = `{
  "request_key": "<ONESHOT_MCP_REQUEST_KEY>",
  "recipient": "0x<recipient>",
  "amount_usdc": "<approved amount>",
  "purpose": "One approved demo purchase"
}`;

export function McpDocsPage(props: { readonly theme: Theme; readonly onToggleTheme: () => void }) {
  return (
    <main className="app-shell docs-page" aria-label="OneShot MCP documentation">
      <nav className="top-nav" aria-label="Documentation navigation">
        <a className="brand-group" href="/">
          <CommitRing size={36} title="OneShot" />
          <span className="brand-name">OneShot</span>
        </a>
        <div className="nav-status-group">
          <span className="status-badge network-badge">
            <span className="status-dot" />
            Arc Testnet
          </span>
          <span className="status-badge token-badge">USDC</span>
          <button type="button" className="theme-toggle" onClick={props.onToggleTheme}>
            {props.theme === 'dark' ? 'Light theme' : 'Dark theme'}
          </button>
        </div>
        <a className="nav-console-link" href="/app">
          Open workspace
        </a>
      </nav>

      <header className="docs-header">
        <p className="eyebrow">ONESHOT MCP / ARC PAYMENT</p>
        <h1>Connect an agent to one safe payment tool.</h1>
        <p className="docs-lead">
          OneShot exposes <code>arc_payment</code> over Streamable HTTP. It creates or replays one
          durable Arc Testnet USDC intent through the policy-bound Privy server wallet.
        </p>
      </header>

      <section className="docs-section" aria-labelledby="mcp-boundary-heading">
        <h2 id="mcp-boundary-heading">Payment boundary</h2>
        <ul className="docs-facts">
          <li>One configured request key can create one payment intent.</li>
          <li>Exact retries return the original intent; changed fields return a conflict.</li>
        </ul>
      </section>

      <section className="docs-section" aria-labelledby="mcp-skill-heading">
        <h2 id="mcp-skill-heading">Install the agent skill</h2>
        <p>
          First install <a href="https://nodejs.org/en/download">Node.js</a> — npm comes with it.
          Then install the OneShot payment skill:
        </p>
        <pre className="docs-code" aria-label="Agent skill install command">
          <code>{skillInstall}</code>
        </pre>
      </section>

      <section className="docs-section" aria-labelledby="mcp-config-heading">
        <h2 id="mcp-config-heading">Agent configuration</h2>
        <p>
          Every OneShot account gets its own MCP bearer. Sign in, open Profile, and choose Generate
          bearer token — the page shows a ready-made configuration for your agent's MCP client. Keep
          the token private and never paste real credentials into source control.
        </p>
        <pre className="docs-code" aria-label="MCP client configuration">
          <code>{clientConfig}</code>
        </pre>
      </section>

      <section className="docs-section" aria-labelledby="mcp-call-heading">
        <h2 id="mcp-call-heading">Run the walkthrough</h2>
        <ol className="docs-steps">
          <li>Connect, then confirm that the tool list contains only arc_payment.</li>
          <li>Review the recipient, purpose, and amount before giving them to the agent.</li>
          <li>Call arc_payment once with the configured request key.</li>
          <li>Repeat the exact call and confirm it returns the same Business Intent.</li>
          <li>When the state is COMMITTED, open its ArcScan proof and compare the transfer.</li>
        </ol>
        <pre className="docs-code" aria-label="arc_payment tool input">
          <code>{toolInput}</code>
        </pre>
        <p className="docs-note">
          AUTHORIZING, READY, and SUBMITTING mean wait. UNKNOWN means repeat the same call or
          inspect recovery evidence. Only COMMITTED with a stored transaction hash is final proof.
        </p>
      </section>
    </main>
  );
}
