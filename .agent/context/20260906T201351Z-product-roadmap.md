# Session Context: Product-First Production Roadmap

## Date/time

- UTC: 20260906T201351Z

## User goal

Rewrite the OneShot plan as a clearer production roadmap: begin with the global
product vision and final B2B paid-API-job concept, remove per-packet day counts,
retain approximate scheduling, name the technology stack, and improve the three
A/B/C work lanes.

## Assumptions

- The current delivery commitment is a production-quality testnet MVP.
- The approximate calendar range may be expressed in weeks while fixed daily
  promises are removed.
- Packet estimates use S/M/L effort bands.
- Mainnet or real-funds production remains a separately approved post-MVP stage.

## Key decisions

- The primary vertical is an autonomous B2B agent purchasing a paid API job or
  digital result in USDC.
- The root plan now starts with product vision, product flow, user surfaces, and
  the roadmap estimation model.
- The expected production-MVP range is six to eight weeks with three active
  coders, recalibrated after foundation and live compatibility evidence.
- The stack is explicit: Node.js, TypeScript, pnpm, Fastify, PostgreSQL, pg,
  Graphile Worker, viem, Privy, Arc, The Graph, React/Vite, Vitest,
  Testcontainers, Playwright, Matchstick, Docker Compose, and GitHub Actions.
- A/B/C lane READMEs now state their technology focus; all 18 packets use S/M/L
  estimates instead of working-day forecasts.
- A post-MVP path covers pilot readiness, limited production rollout, and later
  product expansion without expanding the P0-P6 implementation commitment.

## Files/components touched

- plan.md
- .agent/PROJECT_CONTEXT.md
- milestones/README.md
- milestones/coder-a/README.md, coder-b/README.md, coder-c/README.md
- All 18 A/B/C packet files for effort-label conversion
- This context record

## Validation

- All local Markdown links in plan.md and milestones/ resolve.
- Exactly 18 packet files exist and all 18 contain S/M/L effort headers.
- No day-based estimate or legacy Forecast: header remains in the roadmap.
- git diff --check passes.
- Gate A and Gate B were intentionally not run because the user explicitly
  requested skipping the two-review procedure for the planning phase.

## References

- C:\dev\thoughts\hackathon_eth_online_2026\brainstorming\11_OneShot — Privy Arc Graph Direction.md
- C:\dev\deeptrace\PLAN.md

## Git state and next step

- Branch: codex/clarify-product-roadmap
- Base: develop at 5ef6a66313614e67b476f56c98f47c65344fb6ec
- Commit and push follow after final scoped-diff inspection.
