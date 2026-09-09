# C06 sponsor qualification report

Assessment date: 2026-09-09

| Sponsor | Verdict | Proven now | Missing qualifying evidence |
| --- | --- | --- | --- |
| Privy | `QUALIFIED` | Live server wallet signing (`eth_signTransaction`), policy rules enforcement on normal path, and live policy violation denials (`400 policy_violation`) with zero external broadcasts and zero settlements. Evidence: `evidence/c06/sanitized-proof.json`. | None for testnet qualification (production mainnet gated on project launch). |
| Arc | `QUALIFIED` | Real Arc Testnet USDC transfer (`1000000` atomic units / 1.00 USDC to `0xa605...`), confirmed in block `61116056` (tx `0x72ab1e93c95e5295b2dfa9b3abc8cc5130330f3bba07ad18af2c5b7784f57cf7`), exact Transfer event log verified (`transferLogIndex: 23`), durable settlement identity bound to transaction hash and explorer URL, lost-response crash recovery verified with 0 duplicate broadcasts. Evidence: `evidence/c06/sanitized-proof.json`. | None for testnet qualification (production mainnet gated on project launch). |
| The Graph | `QUALIFIED` | Live Arc USDC Subgraph queried via Subgraph Studio and MCP (`execute_query_by_deployment_id`) on pinned immutable deployment `QmPEUSL6aXY7RVjGFFMbs5L4Q4pxG4TB73cHQ7nechGQY7`; candidate USDC transfer discovered in block `61116056`; live Vertex AI Recovery Advisor (Gemini 2.5 Flash) analyzed candidate evidence and emitted structured `RECONCILE` recommendation with decision ID and referenced evidence; deterministic safety core verified transfer on Arc RPC, resulting in `MARK_COMMITTED` with `settlementPermission: NEVER` and zero duplicate broadcasts. Target track: AI Tooling or AI Use Case. Evidence: `evidence/c06/graph-proof.json`. | None for testnet AI Tooling qualification. |

## Safety evidence

- `evidence/c06/sanitized-proof.json`, `evidence/c06/graph-proof.json`, and `docs/settlement/LIVE_EVIDENCE.md` document the live Arc Testnet settlement (`0x72ab...`), two live policy denials with zero external broadcasts, simulated crash recovery with zero duplicate submissions, and the full live Subgraph MCP + Vertex AI Gemini lost-hash recovery proof.
- `C04_RECOVERY_MATRIX_REPORT.md` and `CHAOS_MATRIX_REPORT.md` record zero
  external recovery submissions across normal, duplicate, concurrent, restart,
  degraded MCP, contradictory evidence, and invalid model scenarios.
- `qualification.ts` rejects plan/simulator evidence for every live sponsor check,
  rejects PASS without an evidence reference, and distinguishes an evidenced
  failure (`NOT_QUALIFIED`) from missing proof (`NOT_VERIFIED`).
- The public recovery viewer is explicitly marked **Synthetic review demo** and
  exposes no payment, signing, retry, Attempt-creation, or submission control.

## Limitations

Live Privy corporate wallet signing, policy enforcement, zero-settlement denials, real Arc Testnet USDC settlement, and live The Graph Subgraph MCP discovery with Vertex AI Gemini recovery advisory have all been executed, verified, and recorded with sanitized proofs in `evidence/c06/sanitized-proof.json`. The Graph target is AI Tooling or AI Use Case only; no Composable/Standardized claim is made. Pinned deployment `QmPEUSL6aXY7RVjGFFMbs5L4Q4pxG4TB73cHQ7nechGQY7` is live and synchronized via Subgraph Studio; decentralized network Indexer allocation remains independent future infrastructure. Arc Mainnet profile remains intentionally disabled pending production launch.
