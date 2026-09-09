# Live settlement evidence

B03 / Gate P4 handoff artifact.

## Status

`LIVE_RUN`

Live Arc Testnet settlement and policy denial drills have been executed and verified.
Provisioning completed per `docs/settlement/PROVIDER_SETUP.md` with Privy application
`cmtqbf5zo013w0cky3r0jqjca`, server execution wallet `0xfCC366c88A0c980e2FD5a7Cf7a36494E4457D943`,
policy `balx3rtrpns3gnvhz3n32dml`, and funded Arc Testnet account.

Evidence artifact: `evidence/c06/sanitized-proof.json`.

## Live Execution Summary

| Property                 | Live Verified Value                                                                                                                                                                                    |
| ------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| **Network**              | `eip155:5042002` (Arc Testnet)                                                                                                                                                                         |
| **RPC Endpoint**         | `https://rpc.testnet.arc.io`                                                                                                                                                                           |
| **Execution Wallet**     | `0xfCC366c88A0c980e2FD5a7Cf7a36494E4457D943`                                                                                                                                                           |
| **Privy App ID**         | `cmtqbf5zo013w0cky3r0jqjca`                                                                                                                                                                            |
| **Privy Wallet ID**      | `tnfnp0n27bsff7vf6g4dv35r`                                                                                                                                                                             |
| **Privy Policy ID**      | `balx3rtrpns3gnvhz3n32dml`                                                                                                                                                                             |
| **USDC Contract**        | `0x3600000000000000000000000000000000000000`                                                                                                                                                           |
| **Authorized Recipient** | `0xa605EE031E41f04f8e193059a39A24407f83677c`                                                                                                                                                           |
| **Settlement Amount**    | `1000000` atomic units (1.00 USDC)                                                                                                                                                                     |
| **Transaction Hash**     | `0x72ab1e93c95e5295b2dfa9b3abc8cc5130330f3bba07ad18af2c5b7784f57cf7`                                                                                                                                   |
| **Block Number**         | `61116056`                                                                                                                                                                                             |
| **Block Hash**           | `0xc2e18d2ee52e8e046a5f70329265aba27285f7d257bb765d417a7c5613bf4b1b`                                                                                                                                   |
| **Transfer Log Index**   | `23`                                                                                                                                                                                                   |
| **Explorer URL**         | [https://testnet.arcscan.app/tx/0x72ab1e93c95e5295b2dfa9b3abc8cc5130330f3bba07ad18af2c5b7784f57cf7](https://testnet.arcscan.app/tx/0x72ab1e93c95e5295b2dfa9b3abc8cc5130330f3bba07ad18af2c5b7784f57cf7) |
| **Settlement Status**    | `CONFIRMED`                                                                                                                                                                                            |

## Observed Policy Denials (Zero External Broadcasts)

Two live negative tests were executed against Privy policy `balx3rtrpns3gnvhz3n32dml` prior to settlement:

1. **Unauthorized Recipient Denial**:
   - Target recipient: `0x1111111111111111111111111111111111111111` (not in policy allowlist).
   - Privy response: HTTP 400 `policy_violation` (`RPC request denied due to policy violation`).
   - External broadcasts: **0**.
   - Committed settlements: **0**.

2. **Above-Cap Amount Denial**:
   - Transfer amount: `2000000` atomic units (exceeds configured `1000000` cap).
   - Privy response: HTTP 400 `policy_violation` (`RPC request denied due to policy violation`).
   - External broadcasts: **0**.
   - Committed settlements: **0**.

On-chain nonce remained `0` across both denial tests; wallet balance remained unaffected until the single authorized settlement.

## Lost-Hash & Lost-Response Recovery Drill

Simulated worker crash / network partition immediately following transaction submission:

- Initial worker intent state: `UNKNOWN`.
- Authoritative reconciliation lookup via Arc RPC `verifyReceipt`: confirmed on-chain settlement at block `61116056`, log index `23`.
- Intent transitioned from `UNKNOWN` → `COMMITTED`.
- External recovery submissions: **0** (no duplicate broadcast attempted).
- Idempotent replay check: Replaying the business intent returned `200 REPLAYED` with identical settlement binding and unchanged nonce. Exactly **1 intent → 1 settlement** invariant preserved.

## Live The Graph Subgraph MCP and Vertex AI Recovery Agent Drill

Executed and verified with real Subgraph Studio indexing, Subgraph MCP normalization, and Google Cloud Vertex AI Gemini 2.5 Flash:

| Property | Live Verified Value |
| --- | --- |
| **Track** | The Graph: AI Tooling or AI Use Case |
| **Studio Query Endpoint** | `https://api.studio.thegraph.com/query/1758917/oneshot-arc-testnet/version/latest` |
| **Pinned Manifest CID** | `Qma8SKdatVjuwYzrZsHK4ZqVR2MGX8m4BxQFu6PqzXwHLi` |
| **Deployment ID** | `0xaf2b444e00f8d11eb5db6bf1bd33e9f6ff0a211c4539d899ec8c9615afb893a7` |
| **Canonical Subgraph ID** | `69FEby7GetXpJVWJShPL6XjMsWWDowLuqf6cE5MvTHdy` |
| **MCP Tool Name** | `execute_query_by_deployment_id` |
| **MCP Normalization** | Accepted: `true`, Health: `FRESH`, Synced Block: `61153492` |
| **Discovered Candidate** | Tx `0x72ab1e93c95e5295b2dfa9b3abc8cc5130330f3bba07ad18af2c5b7784f57cf7`, block `61116056`, log index `23` |
| **LLM Model Identity** | Google Cloud Vertex AI `gemini-2.5-flash` (`europe-west1`), prompt `recovery-v1` |
| **LLM Advisor Outcome** | Recommendation: `RECONCILE`, Decision ID: `dec-c2763d59...`, Referenced Evidence: `["thegraph:0x72ab..."]` |
| **Deterministic Safety Core** | Command: `MARK_COMMITTED`, Target State: `COMMITTED`, Settlement Permission: `NEVER` |
| **External Submissions** | **0** (zero duplicate broadcasts) |

## What is Proven

- **Privy Authorization**: The corporate execution wallet strictly enforces policy rules on the normal path via `eth_signTransaction`. Disallowed recipients and above-cap amounts are rejected by Privy with zero on-chain transaction broadcast.
- **Arc Testnet Rail**: Real USDC transfer on Arc Testnet succeeds, generating an exact EVM `Transfer(from, to, value)` log verified by `verifyReceipt`.
- **Durable Identity**: Transaction hash, block number, block hash, and log index are deterministically bound to the durable business intent.
- **The Graph AI Tooling Recovery**: Lost-hash candidate discovery via Subgraph Studio and MCP (`execute_query_by_deployment_id`) correctly identifies matching USDC transfers on Arc Testnet; Vertex AI Gemini 2.5 Flash advises `RECONCILE` with traceable decision identity; deterministic safety core verifies on Arc RPC and commits with zero duplicate payments.
- **Fail-Closed Recovery**: Unlearned outcomes and crashes preserve `UNKNOWN` state until verified; reconciliation performs read-only checks without duplicate settlement attempts.

## Limitations

- Arc Mainnet profile remains intentionally disabled (`enabled: false`, `verification: UNPUBLISHED`) pending production launch and human sign-off. Those are the values the profile actually carries in `packages/arc-adapter/src/profiles.ts`; the profile holds no chain ID, RPC, explorer, or token value at all.
- Pinned deployment `Qma8SKdatVjuwYzrZsHK4ZqVR2MGX8m4BxQFu6PqzXwHLi` is live and synchronized via Subgraph Studio; decentralized network Indexer allocation on Arbitrum One remains independent future infrastructure.
