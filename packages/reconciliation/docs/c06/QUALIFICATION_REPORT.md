# C06 sponsor qualification report

Assessment date: 2026-09-08

| Sponsor   | Verdict        | Proven now                                                   | Missing qualifying evidence                                                                                       |
| --------- | -------------- | ------------------------------------------------------------ | ----------------------------------------------------------------------------------------------------------------- |
| Privy     | `NOT VERIFIED` | Adapter policy model and denial simulations                  | Live corporate wallet/policy on normal path; live denial with zero settlement                                     |
| Arc       | `NOT VERIFIED` | Chain/profile guards, receipt verifier, simulator invariants | Real Arc Testnet USDC transaction and exact live receipt/Transfer proof                                           |
| The Graph | `NOT VERIFIED` | MCP boundary, advisory agent contract, degradation matrix    | Pinned live deployment queried through Subgraph MCP; meaningful live model use; Arc-verified discovered candidate |

## Safety evidence

- `C04_RECOVERY_MATRIX_REPORT.md` and `CHAOS_MATRIX_REPORT.md` record zero
  external recovery submissions across normal, duplicate, concurrent, restart,
  degraded MCP, contradictory evidence, and invalid model scenarios.
- `qualification.ts` rejects plan/simulator evidence for every live sponsor check,
  rejects PASS without an evidence reference, and distinguishes an evidenced
  failure (`NOT_QUALIFIED`) from missing proof (`NOT_VERIFIED`).
- The public recovery viewer is explicitly marked **Synthetic review demo** and
  exposes no payment, signing, retry, Attempt-creation, or submission control.

## Limitations

No live Privy application/wallet/policy, funded Arc Testnet wallet, real USDC
receipt, immutable OneShot/Arc Subgraph deployment, approved Subgraph MCP
connection, or configured recovery model trace is present. The current bundle
therefore cannot close C06 live acceptance or support a sponsor qualification
claim. The Graph target remains AI Tooling or AI Use Case only; no
Composable/Standardized claim is made.
