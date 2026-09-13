# OneShot MCP `arc_payment` implementation plan

## Decision

Ship one remote MCP tool first:

```text
arc_payment({
  request_key: string,
  recipient: 0x-address,
  amount_usdc: decimal-string,
  purpose: string
})
```

The first release uses the existing policy-bound Privy server execution wallet
and the existing Arc settlement worker. Privy login authenticates the browser;
it does not select the payer. The MCP tool does not use MetaMask, an embedded
browser wallet, or a per-payment wallet popup.

Personal Privy wallets and delegated agent signers remain a separate milestone.
They must not block the first working `arc_payment` demo.

## Non-negotiable behavior

- Arc Testnet (`eip155:5042002`) and Arc USDC are the only network and asset.
- One stable `request_key` maps to one stable Business Intent.
- Repeating the same request returns the existing intent and settlement.
- Reusing the key with different immutable fields returns a conflict.
- `SUBMITTING` and `UNKNOWN` never create a replacement payment.
- Privy policy and OneShot both validate the amount and transaction scope.
- The tool returns authoritative OneShot state, not an inferred success.
- A real demo payment is complete only after a verified Arc receipt is durable.

## Delivery order

| Order | Task                                    | Depends on | Exit condition                                  |
| ----- | --------------------------------------- | ---------- | ----------------------------------------------- |
| 1     | Freeze the tool contract                | None       | Input and output schemas are approved           |
| 2     | Add MCP-only authentication             | Task 1     | `/mcp` accepts only the dedicated credential    |
| 3     | Mount Streamable HTTP MCP               | Task 2     | `initialize` and `tools/list` expose one tool   |
| 4     | Connect `arc_payment` to the ledger     | Task 3     | Calls create or replay one durable intent       |
| 5     | Enforce payment scope and spend bounds  | Task 4     | Invalid or excessive requests broadcast nothing |
| 6     | Return status and proof                 | Task 4     | Replays report the same authoritative state     |
| 7     | Verify failure and concurrency behavior | Tasks 4-6  | Required payment tests pass                     |
| 8     | Document and run one demo               | Task 7     | One real Arc Testnet settlement is verified     |

## Task 1: freeze the tool contract

### Work

- Accept only `request_key`, `recipient`, `amount_usdc`, and `purpose`.
- Parse `amount_usdc` as a six-decimal string into integer atomic units. Never
  use JavaScript floating point.
- Reject malformed addresses, zero amounts, excess precision, empty purposes,
  and oversized strings before creating an intent.
- Define a structured result with:
  - request and Business Intent IDs;
  - authoritative payment state;
  - payer, recipient, decimal amount, and atomic amount;
  - transaction hash and ArcScan link when known;
  - one safe next action: `WAIT`, `CHECK_STATUS`, `VIEW_PROOF`, or
    `FIX_REQUEST`.

### Done when

- The JSON schemas and examples cover accepted, rejected, pending, unknown,
  and committed results.

## Task 2: add MCP-only authentication

### Work

- Add one dedicated high-entropy bearer credential in deployment secret
  storage for the first release.
- Accept it only on `/mcp`; do not let it authorize `/v1/*` routes.
- Keep Privy JWT authentication for the browser and the existing internal
  service credential for internal or legacy routes.
- Bind the MCP principal to one explicit demo workspace.
- Compare credentials in constant time and never log or return them.

### Done when

- Missing, invalid, and browser credentials fail on `/mcp`.
- The MCP credential succeeds on `/mcp` and fails on browser/API routes.

Self-service token generation, token tables, HMAC peppers, and per-user token
rotation are deferred until there is more than one MCP user.

## Task 3: mount the MCP transport

### Work

- Mount the official stateless Streamable HTTP MCP handler in the existing
  Cloud Run API.
- Proxy `/mcp` through the existing Cloudflare Worker without creating another
  deployment.
- Expose exactly one tool named `arc_payment`.
- Return protocol errors as MCP errors without leaking provider responses or
  credentials.

### Done when

- `initialize` succeeds through `https://oneshot.kapustazh.dev/mcp`.
- `tools/list` returns only `arc_payment` with the frozen schema from Task 1.

## Task 4: reuse the durable payment path

### Work

- Derive the Business Intent identity from the workspace and normalized
  `request_key` with one versioned deterministic function.
- Convert the tool input into the existing Arc USDC intent contract.
- Call the existing create-or-replay ledger path and existing worker. Do not
  add a second settlement implementation inside the MCP handler.
- Preserve the existing submission lease, provider idempotency key, receipt
  verification, `UNKNOWN` handling, and recovery behavior.
- Treat another call with the same key as create-or-read, never as a new
  payment command.

### Done when

- One valid tool call reaches the existing `SERVER_PRIVY` payment mode.
- Identical replay returns the same Business Intent.
- Changed recipient, amount, asset, network, or purpose conflicts explicitly.

## Task 5: enforce payment scope and total exposure

### Work

- Keep Privy rules for Arc chain ID `5042002`, the Arc USDC contract,
  zero native value, ERC-20 `transfer`, and the approved per-payment cap.
- Validate the recipient as an EVM address even when the current policy permits
  any recipient.
- Keep the application settlement cap equal to or lower than the Privy cap.
- Add a cumulative control before allowing repeated unique requests. Choose
  one:
  - a Privy rolling USDC spending cap for normal use; or
  - a one-intent quota for a literal single-payment demo.
- Fail readiness when the attached wallet, policy, digest, network, token, or
  cap differs from the reviewed deployment baseline.

### Done when

- Above-cap and exhausted-quota requests create zero broadcasts and zero
  settlements.
- Policy drift makes the tool unavailable before submission.

## Task 6: return authoritative status and proof

### Work

- Wait only for a short bounded interval after create-or-replay.
- Return the current durable state when settlement is still processing.
- Include an ArcScan link only for a stored transaction hash.
- Return the original result for a committed replay.
- For `UNKNOWN`, instruct the caller to repeat the same tool call or inspect the
  proof. Never suggest a new `request_key`.

### Done when

- Every non-final response gives a safe next action.
- No response claims payment from queue acceptance alone.

## Task 7: test the payment boundary

### Required tests

- Valid and invalid MCP authentication; route isolation.
- `tools/list` exposes exactly one tool.
- Input validation and exact decimal-to-atomic conversion.
- One normal request produces exactly one committed settlement.
- Ten sequential identical calls produce one settlement.
- Ten parallel identical calls produce one settlement.
- Same key with changed immutable payload returns a conflict.
- Privy denial, amount above cap, and exhausted quota produce zero broadcasts.
- Crash or lost response after possible submission enters `UNKNOWN`, then
  reconciliation finds the original payment without resubmission.
- Committed replay returns the original transaction and result.

### Validation commands

- Focused MCP, API, worker, Privy adapter, and storage tests.
- PostgreSQL integration tests.
- Full unit suite, typecheck, lint, formatting check, production build, and
  browser tests.

## Task 8: document and demonstrate

### Work

- Add one short `/docs/mcp` page with generic Streamable HTTP configuration and
  one copy-ready client example.
- Use an environment-variable placeholder for the bearer credential.
- Demonstrate one real `arc_payment` call, one identical replay, and one proof
  view.
- Record the Business Intent ID, verified Arc transaction, policy identity,
  and zero-duplicate result without recording secrets.

### Done when

- A fresh client can connect using the page and list `arc_payment`.
- The demo shows one real Arc Testnet USDC settlement and no replacement
  settlement on replay.

Client-specific setup pages and an installable `oneshot-arc-payment` skill are
deferred until the tool contract is stable.

## Milestone 2: personal Privy wallets

Start this milestone only after the server-wallet MCP path is working.

1. Replace the fixed MCP principal with a principal containing credential kind,
   Privy subject, opaque workspace ID, and MCP token ID.
2. Create one isolated workspace and one revocable MCP token per Privy user.
3. Store only a SHA-256 digest of each random 32-byte token and enforce
   one-active-token generation atomically.
4. Bind jobs, intents, recovery, activity, results, and proofs to the workspace;
   return `404` for cross-workspace identifiers.
5. Discover the user's embedded Ethereum wallet and show funding/readiness.
6. Create a user-owned Privy override policy and add the OneShot P-256 key
   quorum as an additional signer after one explicit user authorization.
7. Resolve wallet and signer policy per workspace in the worker while keeping
   the existing global execution wallet only for legacy service requests.
8. Add the **Agents** tab for wallet status, signer enable/disable, policy
   controls, and MCP token lifecycle.
9. Replace the current request list with a workspace-bound unified feed.
10. Add multi-user isolation, concurrent token generation, signer attachment,
    policy update, and browser accessibility tests.

## Explicitly excluded from the first release

- MetaMask or browser-wallet payment execution.
- Personal embedded-wallet settlement.
- Arbitrary policy editor.
- MCP OAuth.
- Multiple active MCP credentials.
- OneShot team or Privy teammate administration.
- Multiple MCP tools, assets, or networks.

## References

- [Arc MCP setup](https://docs.arc.io/ai/mcp)
- [MCP Streamable HTTP transport](https://modelcontextprotocol.io/specification/2025-06-18/basic/transports)
- [Privy server signers](https://docs.privy.io/recipes/wallets/user-and-server-signers)
- [Privy policy capabilities](https://docs.privy.io/controls/policies/overview)
