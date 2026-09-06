# Session Context: Product-First Production Roadmap

## Date/time

- UTC: 20260906T201351Z

## User goal

Rewrite OneShot as a product-first roadmap based on the final B2B paid-API-job
concept. Name the technology stack, organize delivery only by dependencies and
evidence gates, and explain how every domain component and A/B/C lane
contributes to the complete product.

## Key decisions

- The primary vertical is an autonomous B2B agent purchasing a paid API job or
  digital result in USDC.
- The root plan starts with product vision, product flow, user surfaces, system
  context, and the dependency-gated roadmap.
- The stack is explicit: Node.js, TypeScript, pnpm, Fastify, PostgreSQL, `pg`,
  Graphile Worker, `viem`, Privy, Arc, The Graph, React/Vite, Vitest,
  Testcontainers, Playwright, Matchstick, Docker Compose, and GitHub Actions.
- A/B/C lane READMEs state their technology focus. Packet metadata contains
  ownership and dependencies only.
- `docs/DOMAIN_ARCHITECTURE.md` explains system context, domain records, state
  ownership, component responsibilities, success and recovery sequences, port
  boundaries, and A/B/C convergence.
- Post-MVP pilot stages remain separate from the P0-P6 implementation contract.

## Files/components touched

- `plan.md`
- `.agent/PROJECT_CONTEXT.md`
- `milestones/README.md`
- `milestones/coder-a/README.md`, `coder-b/README.md`, `coder-c/README.md`
- All 18 A/B/C packet files
- `docs/DOMAIN_ARCHITECTURE.md`
- This context record

## Validation

- All local Markdown links in `plan.md`, `milestones/`, and `docs/` resolve.
- Exactly 18 packet files remain.
- Packet headers contain no planning-size metadata.
- Mermaid CLI 11.17.0 rendered all 10 diagrams successfully.
- `git diff --check` passes.
- Gate A and Gate B were intentionally not run because the user explicitly
  requested skipping the two-review procedure for the planning phase.

## References

- `C:\dev\thoughts\hackathon_eth_online_2026\brainstorming\11_OneShot — Privy Arc Graph Direction.md`
- `C:\dev\deeptrace\PLAN.md`

## Git state

- Branch: `milestone/product-roadmap`
- Base: `develop` at `5ef6a66313614e67b476f56c98f47c65344fb6ec`
- Original roadmap pull request: `https://github.com/SWOFART/OneShot/pull/7`
  (merged into `develop` before this architecture correction).
- Follow-up pull request: pending from `milestone/product-roadmap`.

## 2026-09-06 architecture correction

- The working Arc Testnet product remains the first live proof.
- Mainnet readiness is now part of P0-P6 through a disabled typed profile,
  deployment/preflight evidence, safe disable, rollback, and a human activation
  gate. No unavailable Arc Mainnet values are guessed.
- PostgreSQL remains authoritative. Direct Privy lookup and Arc receipt/log
  evidence form the required recovery path.
- The Graph is the selected v1 hashless candidate-discovery layer. C01 must
  prove live value, freshness, multiple-candidate handling, and AI-track fit;
  Arc remains authoritative and a failed gate removes the Graph claim.
- Review gates for this corrected tree are intentionally not embedded here;
  immutable Gate A/B evidence is recorded on PR #7 so recording it cannot alter
  the reviewed tree.
## 2026-09-06 migration options

- Arc with direct Privy/RPC evidence remains the smallest default.
- The Graph is the primary `IndexViewPort` adapter for hashless discovery;
  direct Arc or managed RPC remain migration fallbacks.
- Hedera with Privy and x402/Blocky402 is a coherent alternative settlement
  rail for the paid-API vertical. It replaces Arc-specific adapter/evidence
  work while retaining the OneShot domain, PostgreSQL authority, `UNKNOWN`, and
  reconciliation rules.
- A Hedera pivot must be selected before P0 and must prove Privy compatibility;
  it is not a second rail in the same MVP.
- Bazantic is the closest optional third sponsor after the core Hedera flow,
  but it must add a real agent-facing capability and cannot replace Blocky402.
## 2026-09-06 Graph and Arc Memo decision

- Primary submission direction: Privy authorizes, The Graph discovers, Arc
  proves, and OneShot/PostgreSQL decides.
- Target The Graph AI Tooling or AI Use Case, not Composable/Standardized.
- Demonstrate a real Arc payment whose successful response/hash is discarded at
  the adapter fault boundary, followed by live Graph discovery and direct Arc
  verification with no second payment.
- Prefer Arc Memo `memoId = hash(business_intent_id)` for unique correlation only
  if B01 proves Privy can constrain the forwarded USDC call. Otherwise preserve
  stricter authorization and use tuple/window search or a narrow typed contract.
- Hedera + Privy + x402/Blocky402 remains a separate P0 alternative, not a
  second settlement rail in the Arc MVP.
