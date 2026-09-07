# Session Context: A02 durable intents and API

## Date/time

- UTC: 2026-09-07T14:50:00Z

## User goal

Implement Coder A's milestone A02: durable PostgreSQL intent ledger, transactional migrations,
canonical domain fingerprint, and Fastify HTTP boundary controls.

## Original prompt/request

Continue plan as Coder A and create PR without review gates.

## Assumptions

- A02 builds upon A01 contracts and foundation on `develop`.
- PostgreSQL is authoritative for Business Intents, Attempts, Settlement identity, evidence observations, and outbox jobs.
- Real provider wallets, settlement rails, and external indexes remain excluded (deferred to later milestones).
- Review gates A and B are waived per explicit user instruction ("PR сделай без гейтов").

## Plan

1. Verify and complete domain fingerprint normalization and validation.
2. Verify PostgreSQL transactional migrations, rollback handling, and constraint enforcement.
3. Verify atomic insert-or-replay, deduplication, conflict rejection, and query projections.
4. Implement full API boundary controls, service bearer authentication, and sanitized error mapping.
5. Provide synthetic database fixtures and document storage-v1 schema digest.
6. Run all local quality checks (lint, format, typecheck, contract checks, unit tests).
7. Commit, push branch to fork, and open PR targeting `develop` without gates.

## Key decisions

- Intent insertion is atomic using transactional insert with `ON CONFLICT DO NOTHING`.
- First attempt and authorize outbox job are enqueued only for new intents.
- Conflicting payload returns 409 `INTENT_PAYLOAD_CONFLICT` without enqueuing jobs.
- API boundary sanitizes all internal details; correlation IDs are preserved across calls.
- Storage V1 schema digest is published and tested against migrations.

## Files/components touched

- Workspace configs: `package.json`, `pnpm-workspace.yaml`, `pnpm-lock.yaml`, `tsconfig.json`, `vitest.config.ts`, `.markdownlint-cli2.jsonc`.
- Workflows: `.github/workflows/stack-lint.yml` (added integration test step).
- `packages/domain`: canonical fingerprinting and normalization.
- `packages/storage-postgres`: transactional migrations, intent ledger, schema digest, synthetic fixtures.
- `apps/api`: Fastify boundary, authentication, rate limiting, and OpenAPI contract tests.

## Commands/checks

- `pnpm install --frozen-lockfile` - pass.
- `pnpm format:check` - pass.
- `pnpm lint` - pass.
- `pnpm typecheck` - pass.
- `pnpm check:generated` - pass.
- `pnpm validate:fixtures` - pass.
- `pnpm test` - pass, 7 files, 52 tests.
- `markdownlint-cli2` - pass, 54 files, 0 errors.
- `storage-v1` schema digest - `09b7fc0ce90a3db9dfd0437ae1abdac7260603154216b223116d0e123967d742`.

## Review gates

- Gate A: Waived by repository owner for this PR.
- Gate B: Waived by repository owner for this PR.
