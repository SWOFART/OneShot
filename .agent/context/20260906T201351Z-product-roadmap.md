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
- Pull request: `https://github.com/SWOFART/OneShot/pull/7`
