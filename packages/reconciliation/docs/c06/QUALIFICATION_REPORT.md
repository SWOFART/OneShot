# C06 sponsor qualification report

Assessment date: 2026-09-09

| Sponsor   | Verdict        | Proven now                                                                                                                                                                                                                                                                                                                                                                                                                                         | Missing qualifying evidence                                                                                                                                                                              |
| --------- | -------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Privy     | `QUALIFIED`    | Live server wallet signing (`eth_signTransaction`), policy rules enforcement on normal path, and live policy violation denials (`400 policy_violation`) with zero external broadcasts and zero settlements. Evidence: `evidence/c06/sanitized-proof.json`.                                                                                                                                                                                         | None for testnet qualification (production mainnet gated on project launch).                                                                                                                             |
| Arc       | `QUALIFIED`    | Real Arc Testnet USDC transfer (`1000000` atomic units / 1.00 USDC to `0xa605...`), confirmed in block `61116056` (tx `0x72ab1e93c95e5295b2dfa9b3abc8cc5130330f3bba07ad18af2c5b7784f57cf7`), exact Transfer event log verified (`transferLogIndex: 23`), durable settlement identity bound to transaction hash and explorer URL, lost-response crash recovery verified with 0 duplicate broadcasts. Evidence: `evidence/c06/sanitized-proof.json`. | None for testnet qualification (production mainnet gated on project launch).                                                                                                                             |
| The Graph | `NOT VERIFIED` | The Studio-only Arc deployment is live, synchronized, and returns real USDC candidates through the native `STUDIO_GRAPHQL` path. The ETHOnline AI track accepts live provider data through an API-key Studio query, and the deterministic recovery core still treats results as read-only observations.                                                                                                                                            | A fresh trace must show Studio data materially affecting the Vertex decision and deterministic disposition. The Network Gateway does not serve this Arc deployment, so no official MCP trace is claimed. |

## Safety evidence

- `evidence/c06/sanitized-proof.json`, `evidence/c06/graph-proof.json`, and `docs/settlement/LIVE_EVIDENCE.md` document the live Arc Testnet settlement (`0x72ab...`), two live policy denials with zero external broadcasts, simulated crash recovery with zero duplicate submissions, and historical Graph/Vertex observations. The active implementation records the transport truthfully as `STUDIO_GRAPHQL`; the fresh live qualification trace remains pending.
- `C04_RECOVERY_MATRIX_REPORT.md` and `CHAOS_MATRIX_REPORT.md` record zero
  external recovery submissions across normal, duplicate, concurrent, restart,
  degraded MCP, contradictory evidence, and invalid model scenarios.
- `qualification.ts` rejects plan/simulator evidence for every live sponsor check,
  rejects PASS without an evidence reference, and distinguishes an evidenced
  failure (`NOT_QUALIFIED`) from missing proof (`NOT_VERIFIED`).
- The public recovery viewer is explicitly marked **Synthetic review demo** and
  exposes no payment, signing, retry, Attempt-creation, or submission control.

## Limitations

Live Privy corporate wallet signing, policy enforcement, zero-settlement denials,
and real Arc Testnet USDC settlement remain verified. The pinned deployment
`QmPEUSL6aXY7RVjGFFMbs5L4Q4pxG4TB73cHQ7nechGQY7` is live and synchronized in
Subgraph Studio, but the production recovery path uses direct Studio GraphQL
because the Arc deployment is not served by the Network Gateway. The Graph AI
Tooling claim remains `NOT VERIFIED` until a fresh Studio trace proves meaningful
data use by the model and deterministic core. Arc Mainnet remains disabled.
