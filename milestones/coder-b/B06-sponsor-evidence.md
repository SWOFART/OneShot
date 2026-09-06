# B06 — Privy and Arc Sponsor Evidence

Owner: Coder B
Branch: `milestone/b06-sponsor-evidence`
Depends on: B05 only
Project convergence: Gate P6

## Outcome

A sanitized, repeatable evidence bundle demonstrates Privy as the real authorization boundary and Arc Testnet as the real USDC settlement rail, with limitations stated honestly.

## Small tasks

### B06.1 — Privy evidence script

- Demonstrate execution wallet, expected policy identity/scope, normal-path enforcement, and no bypass path.
- Show wrong-scope and above-cap denials with zero committed settlement.

### B06.2 — Arc evidence script

- Demonstrate one authorized ERC-20 USDC settlement on Arc Testnet.
- Bind Privy request identity to transaction hash, final receipt, exact Transfer log, and explorer URL.

### B06.3 — Ambiguity scenario

- Intentionally lose the local success response after possible submission.
- Show B adapter reports ambiguity and evidence lookup locates the original transaction without submitting another.

### B06.4 — Sanitization audit

- Review screenshots, logs, fixtures, commands, and docs for keys, tokens, signatures, private wallet data, raw authorization responses, and environment contents.
- Retain only public/sanitized testnet identifiers.

### B06.5 — Qualification input

- Provide code, test, live-demo, network, transaction, policy, and limitation references for `sponsor-qualification`.
- Use `NOT VERIFIED` when live proof is missing; never promote fixtures into qualification.

## Acceptance evidence

- Privy policy materially constrains the normal path and denials settle zero.
- Arc evidence proves a real final ERC-20 transfer, not only a label or explorer screenshot.
- Repeated demo/reset does not create an unintended second settlement.
- Bundle passes secret/redaction and reproducibility checks.

## Handoff artifact

Publish sanitized Privy/Arc evidence index, exact demo commands, transaction/policy references, denial table, and limitation statement.

## No-wait continuation

B06 closes independently. Gate P6 consumes its exact reviewed bundle alongside A06/C06; mismatches return only to B-owned evidence/code.

## Non-goals

No mainnet claim, wallet-key export, external-account mutation by an agent, or final sponsor verdict for The Graph.
