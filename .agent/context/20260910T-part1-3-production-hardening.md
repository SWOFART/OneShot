# Production hardening parts 1-3

## Goal

Implement the three requested audit follow-ups on a short-lived branch, with
one commit and one fresh Gate A review prompt after each part:

1. Complete worker deployment configuration and add production API rate limiting.
2. Harden the Privy fallback boundary and PostgreSQL integration-test cleanup.
3. Reconcile stale operational and implementation documentation.

## Branch and base

- Branch: `fix/production-hardening-ops`
- Base: current clean `develop` at the start of this session.
- Scope: testnet-safe operational hardening; no mainnet activation, secrets, or
  external payment effects.

## Acceptance criteria

- Part 1: API runtime defaults to a durable shared rate limiter; limits are
  configurable and tested; worker deployment instructions include every
  required runtime variable and preserve secret-store boundaries.
- Part 2: Privy denied-relay fallback behavior is covered by regression tests;
  ambiguous external effects remain fail-closed; PostgreSQL integration
  cleanup tolerates setup failure without masking the original error.
- Part 3: stale statuses, variable names, and architecture descriptions are
  corrected without changing product scope or sponsor qualification claims.

## Applicable safety cases

The changes touch API access, worker runtime, Privy settlement boundaries, and
PostgreSQL test infrastructure. The relevant matrix cases are Privy denial,
ambiguous submission/no blind retry, service restart, and durable state and
external-effect assertions. No live settlement is authorized for this work.

## Initial validation

The repository was clean on `develop`. Prior audit checks passed lint,
typecheck, unit tests, build, format, generated artifacts, fixtures, browser
tests, and markdown lint. PostgreSQL integration was not runnable locally
because no container runtime was available; it must remain explicitly reported
as unverified until CI or a container runtime executes it.

## Part 1 evidence

- `pnpm.cmd --filter @oneshot/api test`: PASS (50 tests).
- `pnpm.cmd --filter @oneshot/storage-postgres test`: PASS (8 tests).
- `pnpm.cmd typecheck`: PASS.
- `pnpm.cmd lint`: PASS.
- `pnpm.cmd format:check`: PASS.
- `pnpm.cmd test`: PASS (65 files, 974 tests).
- PostgreSQL integration remains unrun locally because no container runtime is
  available; the new limiter SQL is covered by focused unit behavior and the
  migration is included in the integration migration sequence.

Part 1 implements a PostgreSQL-backed fixed-window limiter that fails closed
when the limiter store is unavailable. It keys admission by request IP and
route; correlation IDs remain diagnostic only. Worker deployment documentation
now lists the complete non-secret runtime contract and sends only the three
secret values to Secret Manager.

## Part 2 evidence

- `pnpm.cmd --filter @oneshot/privy-adapter test`: PASS (9 files, 130 tests).
- `pnpm.cmd --filter @oneshot/storage-postgres test`: PASS (2 files, 8 tests).
- `pnpm.cmd --filter @oneshot/api test`: PASS (6 files, 50 tests).
- `pnpm.cmd --filter @oneshot/worker test`: PASS (5 files, 39 tests).
- `pnpm.cmd typecheck`: PASS.
- `pnpm.cmd lint`: PASS.
- `pnpm.cmd format:check`: PASS.
- `pnpm.cmd test`: PASS (66 files, 977 tests).
- The Privy regression suite now covers relay-boundary fallback, generic 401
  rejection without fallback, and policy denial without raw broadcast.
- All PostgreSQL Testcontainers suites guard cleanup when setup fails. Actual
  container-backed integration remains unrun locally because no runtime is
  available.
