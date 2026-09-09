# Gate P6 live demo script

This is the judge-facing 2–4 minute walkthrough. It is intentionally a written
script: no video artifact is included in this release candidate.

## Before the demo

Run `pnpm demo:e2e` from a clean checkout. The command builds the workspace,
runs all invariant scenarios, and verifies the sanitized B06/C06 evidence. It
does not send a transaction, change external chain history, or require secrets.

## Walkthrough (about three minutes)

1. **Create and settle (0:00–0:45).** Open the web console's Create/Replay
   view and submit one Business Intent for `1.00 USDC` (`1000000` atomic
   units). Show the durable intent ID, Privy authorization, Arc Testnet receipt,
   and the final `COMMITTED` state.
2. **Replay and policy denial (0:45–1:30).** Submit the same intent again to
   show the existing result. Then try an unauthorized recipient or an amount
   above the configured cap. Privy rejects before broadcast: the audit view
   shows zero broadcasts and zero settlements.
3. **Lost response and recovery (1:30–2:30).** Run the lost-response fixture.
   The intent becomes `UNKNOWN`; the recovery view shows the pinned Subgraph
   MCP candidate and Gemini recommendation. OneShot verifies the matching Arc
   receipt and commits the existing settlement. Replacement submissions remain
   zero.
4. **Safety and release posture (2:30–3:00).** Show `settlementPermission:
   NEVER`, the disabled/fail-closed Arc Mainnet profile, and the safe-disable
   runbook. Explain that Graph data is candidate discovery only; PostgreSQL and
   Arc receipt verification retain financial authority.

## Claims shown

- Arc Testnet + USDC: working testnet evidence; no mainnet transaction is
  claimed.
- Privy: authorization and spending policy boundary with zero-effect denials.
- The Graph: live Subgraph MCP + Gemini hashless recovery evidence, with
  deterministic Arc verification.
- Circle Agent Stack: intentionally out of scope and not claimed.
