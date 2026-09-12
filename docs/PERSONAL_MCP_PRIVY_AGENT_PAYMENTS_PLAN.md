# Personal OneShot MCP and Privy agent payments

## Summary

Add a remote OneShot MCP server at `https://oneshot.kapustazh.dev/mcp` with one tool, `arc_payment`. Each Privy user receives an isolated workspace, a policy-bound embedded wallet, private request history, and one revocable MCP bearer token.

Payments execute autonomously after one-time signer enablement. Privy, rather than OneShot, enforces the Arc network, USDC contract, recipient allowlist, and per-payment cap through an additional signer policy.

## Identity, tokens, and request privacy

- Replace the current authorization-only result with an authenticated principal containing the credential kind, Privy subject, opaque workspace ID, and MCP token ID when applicable.
- Create one personal workspace automatically for each verified Privy DID.
- Allow one active MCP token per user. Return the complete 32-byte random token only when generated, store only an HMAC-SHA-256 digest using a deployment pepper, and revoke it immediately when deleted.
- Limit MCP tokens to `/mcp`. Use Privy JWTs for browser and profile routes. Keep `SERVICE_BEARER_TOKEN` for internal and legacy operations only, and remove its machine-token input from the public workspace.
- Add workspace-bound storage for direct Arc payments and enforce workspace ownership for jobs, paid APIs, intents, recovery, activity, results, and payment proofs.
- Return `404` for cross-user identifiers so the API does not disclose whether another user's request exists.
- Keep existing unattributed data unchanged in a reserved legacy/service workspace. Never return it to ordinary Privy users.
- Replace the Requests tab's job-only query with a unified personal request feed covering Arc payments, service jobs, and paid APIs.

## Privy wallet and workspace experience

- Configure Privy to create an Ethereum embedded wallet for every authenticated user.
- Add an **Agents** workspace tab containing:
  - Embedded Arc wallet address and funding/readiness status.
  - Recipient allowlist and maximum USDC-per-payment controls.
  - One-time enable/disable state for the OneShot agent signer.
  - MCP token generation, immediate copy, metadata, and deletion.
  - Links to MCP documentation and Privy Dashboard team management.
- Create one user-owned Privy override policy for the OneShot signer. Permit only:
  - `eth_sendTransaction`.
  - Arc chain ID `5042002`.
  - Arc USDC contract `0x3600000000000000000000000000000000000000`.
  - ERC-20 `transfer` calls.
  - Recipients in the configured allowlist, up to 100 addresses.
  - Amounts less than or equal to the configured per-payment cap.
- Let unmatched methods default to deny. Attach this policy only to the OneShot additional signer so the user's normal wallet access remains unchanged.
- Make **Enable agent payments** call Privy's `addSigners` once, then verify the signer and policy attachment through the API. Use the user's Privy authorization for later policy changes.
- Resolve wallet and policy configuration per workspace in the payment worker, then construct the existing authorization and settlement adapters for that identity. Retain the global execution-wallet path only for legacy service requests.
- Configure the OneShot P-256 signer ID and private key through deployment configuration and secret storage.
- Keep teammate invitations and roles in Privy Dashboard. Do not reproduce Privy team administration in OneShot.

## MCP, API, documentation, and skill

- Mount the official stateless Streamable HTTP MCP handler in the existing Cloud Run API and proxy `/mcp` through the Cloudflare Worker. Do not create another deployment.
- Build a fresh MCP server for each authenticated request and expose exactly one tool:

```text
arc_payment({
  request_key: string,
  recipient: 0x-address,
  amount_usdc: decimal-string,
  purpose: string
})
```

- Derive the internal intent identity from workspace plus `request_key`. An identical replay returns the existing payment; the same key with changed payment fields returns a conflict.
- Wait briefly for durable processing, then return structured output containing request ID, authoritative state, wallet, recipient, decimal and atomic amounts, transaction hash and explorer link when available, and the safe next action.
- Treat repeating the identical tool call as a status refresh. `SUBMITTING` or `UNKNOWN` must never create or broadcast a replacement payment.
- Add these browser APIs:
  - `GET /v1/me`
  - `PUT /v1/me/agent-policy`
  - `POST /v1/me/agent-access/verify`
  - `POST /v1/me/mcp-token`
  - `DELETE /v1/me/mcp-token`
  - `GET /v1/requests`
- Add a public `/docs/mcp` page modeled on the [Arc MCP setup page](https://docs.arc.io/ai/mcp), with copy-ready setup for Codex, Claude Code/Desktop, Cursor, VS Code, and generic Streamable HTTP clients. Use environment-variable placeholders rather than embedding the token in static documentation.
- Add an installable `oneshot-arc-payment` skill containing `SKILL.md` and `agents/openai.yaml`. Teach stable request keys, policy-denial handling, authoritative state interpretation, proof retrieval, and the prohibition on replacement payments after uncertainty.

## Tests and acceptance scenarios

- Verify Privy JWT principals, valid/invalid/revoked MCP tokens, MCP-token route restrictions, and legacy service-token isolation.
- Verify two users can use the same request key while seeing only their own data; all cross-user status, proof, result, reconcile, and payment lookups return `404`.
- Verify one-active-token behavior, show-once secret handling, digest-only storage, copy flow, revocation, and concurrent generation.
- Verify embedded-wallet discovery, canonical policy creation and update, signer attachment, invalid allowlists/caps, and safe denial for missing or drifted policy configuration.
- Verify MCP initialization, `tools/list` exposing only `arc_payment`, authenticated calls, input validation, and structured results.
- Verify concurrent identical calls create one intent and one submission; changed payloads conflict; policy rejection broadcasts nothing; committed replay returns the original transaction; timeout or `UNKNOWN` never resubmits.
- Verify legacy records remain hidden, the unified Requests feed remains personal, bearer tokens are not persisted in browser storage, and the Agents and documentation pages pass browser and accessibility tests.
- Run focused package tests, PostgreSQL integration tests, the full unit suite, typecheck, lint, formatting check, production build, and browser tests.

## Assumptions and intentional exclusions

- Arc Testnet and Arc USDC remain the only enabled network and asset.
- Agent payments require one initial Privy signer authorization but no per-payment approval inside the configured policy.
- This release does not add daily/rolling caps, an arbitrary policy editor, MCP OAuth, multiple active API tokens, or OneShot team CRUD.
- Privy Dashboard remains responsible for account teammates. Privy Organizations can be considered later if shared-wallet or quorum behavior becomes necessary.
- The Privy application uses TEE wallet execution and has a registered OneShot authorization-key quorum.
- Existing recovery and session changes in the original worktree remain separate and untouched.

## References

- [Arc MCP setup](https://docs.arc.io/ai/mcp)
- [MCP Streamable HTTP transport](https://modelcontextprotocol.io/specification/2025-06-18/basic/transports)
- [Privy server signers](https://docs.privy.io/recipes/wallets/user-and-server-signers)
- [Privy policy capabilities](https://docs.privy.io/controls/policies/overview)
