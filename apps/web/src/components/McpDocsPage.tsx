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
  "request_key": "report-one-approved-demo-purchase-850d9a80",
  "payer_wallet": "0x<connected-wallet>",
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
          OneShot exposes <code>arc_payment</code> and <code>arc_payment_submit</code> over
          Streamable HTTP. The connected Privy or MetaMask wallet signs and sends USDC directly to
          the Arc recipient; OneShot only prepares and verifies the payment.
        </p>
      </header>

      <section className="docs-section" aria-labelledby="mcp-boundary-heading">
        <h2 id="mcp-boundary-heading">Payment boundary</h2>
        <ul className="docs-facts">
          <li>The agent generates one random request key for each new approved payment.</li>
          <li>Exact retries return the original intent; changed fields return a conflict.</li>
          <li>The payer is the wallet address selected by the user, never a server wallet.</li>
          <li>
            The second tool verifies the exact receipt and Transfer log for the returned hash.
          </li>
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
          <li>
            Connect, then confirm that the tool list contains arc_payment and arc_payment_submit.
          </li>
          <li>Review the recipient, purpose, and amount before giving them to the agent.</li>
          <li>Pass the connected Privy or MetaMask wallet address as payer_wallet.</li>
          <li>
            The agent generates a request key from the purpose plus eight random hex characters; you
            do not need to provide or copy it.
          </li>
          <li>Call arc_payment once and give the returned signing_url to the user.</li>
          <li>
            The user opens the link, reviews the prepared request, and signs it in Privy or
            MetaMask.
          </li>
          <li>
            Use the returned hash with arc_payment_submit when the agent receives it separately.
          </li>
          <li>When the state is COMMITTED, open its ArcScan proof and compare the transfer.</li>
        </ol>
        <pre className="docs-code" aria-label="arc_payment tool input">
          <code>{toolInput}</code>
        </pre>
        <p className="docs-note">
          READY means sign the exact transaction request. UNKNOWN means repeat submit with the same
          hash or inspect recovery evidence. Only COMMITTED with a stored transaction hash is final
          proof.
        </p>
      </section>
    </main>
  );
}
