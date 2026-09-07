# Session Context: C04 recovery matrix and integration

## Date/time

- UTC: 2026-09-07T22:10:16Z

## User goal

Implement Coder C milestone C04 and review the finished candidate with fresh
FreePi processes using GLM 5.3.

## Original prompt/request

"C04 план начинай делать. Делай ревью через free pi glm5-3"

## Assumptions

- C02/C03 merged through PR #22 and are the complete simulator baseline for C04.
- C04 remains package-local and zero-submit; live adapter replacement stays at Gate P4.

## Plan

1. Add the versioned recovery service and append-only evidence-command seam.
2. Compose local, known-identity, Subgraph MCP, and advisor simulators behind public ports.
3. Execute the complete C04 recovery matrix and publish replacement guidance.
4. Run package/root checks, FreePi Gate A, draft PR CI, and FreePi Gate B.

## Key decisions

- Preserve deterministic safety-core authority; model and index outputs stay advisory.
- Make duplicate delivery converge through deterministic record and command identities.

## Files/components touched

- `docs/COMPOSITION_MANIFEST.md`: updated reconciliation port reference to `RecoveryService` with Subgraph MCP adapter.
- `docs/GATE_P4_CHECKLIST.md`: references `GATE_P4_RECOVERY_REPLACEMENT.md` and `RecoveryCommandStorePort`.
- `packages/reconciliation`: recovery service, simulators, full pre-live matrix, schemas, and integration tests.
- `.agent/context/20260907T221016Z-c04-recovery-matrix-integration.md`: this session record.

## Commands/checks

- `git fetch origin develop` - PASS.
- Current `develop` rebased with PR #27 at `4295bd9c909d39bd750eed8d756ec4b0abe77958`.
- `pnpm format:check` - PASS (Prettier 3.9.6).
- `pnpm lint` - PASS (ESLint 10.10.0, 0 issues).
- `pnpm typecheck` - PASS (TypeScript 6.0.3, 0 issues).
- `pnpm check:generated` - PASS (contracts current).
- `pnpm validate:fixtures` - PASS (9 fixtures validated).
- `pnpm test` - PASS (35 test files, 504 tests passing; 66 in reconciliation package).
- `npx markdownlint-cli2` - PASS (88 markdown files, 0 issues).
- `git diff --check` - PASS (no whitespace or merge marker issues).

## External-doc findings

- None; C04 is a frozen simulator and integration milestone.

## Unresolved questions

- None.

## Git and PR state

- Branch: `milestone/c04-recovery-matrix-integration`
- Base: `origin/develop` at `4295bd9c909d39bd750eed8d756ec4b0abe77958`
- Commit: uncommitted
- PR: not created
- CI: not applicable

## Review gates

- Gate A: NOT RUN
- Gate B: NOT RUN

## Handoff/next steps

1. Stage candidate files and capture candidate tree SHA (`git write-tree`).
2. Run FreePi Gate A pre-push review with `npx free-pi-cli` (GLM 5.3).
3. Commit, push branch, open draft PR, verify CI, then run FreePi Gate B.
