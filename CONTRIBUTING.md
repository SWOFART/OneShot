# Contributing

OneShot keeps one approved business obligation tied to at most one committed
USDC settlement. `develop` is the integration branch. `main` is the release
branch. Do not push to either directly.

Local setup, the state machine, and the repository layout are in the
[developer guide](docs/DEVELOPER_GUIDE.md). Milestones are in
[ROADMAP.md](ROADMAP.md).

## From issue to pull request

1. Open an issue with a template in `.github/ISSUE_TEMPLATE/`. Security problems
   do not go there. Use [private vulnerability reporting](SECURITY.md).
2. A maintainer triages the issue: set `type:*`, `area:*`, and `priority:*`,
   then move `status:needs-triage` to `status:ready` or `status:blocked`.
   Put milestone work on a GitHub milestone when one exists.
3. Non-trivial work starts from a planning issue (`[Plan]`) or a short note on
   the issue that names the outcome, acceptance criteria, and non-goals. See
   [docs/planning/README.md](docs/planning/README.md).
4. Branch from current `develop` unless a maintainer names another base.
   Keep the branch to one issue or one tight outcome.
5. Run the local checks below. Open a pull request to `develop`, fill the pull
   request template, and link the issue.
6. Required CI must pass on that head. A human reviews and merges.

## Conventions

- One `business_intent_id` stays stable across retries, restarts, and parallel
  workers. That intent has at most one committed settlement.
- An `UNKNOWN` outcome is reconciled before any further payment. A missing or
  delayed index is not proof that the payment did not happen.
- Money is integer atomic units or `bigint`. Do not use floating point.
- Testnet is the default. Mainnet stays disabled until official parameters and
  an explicit human authorization exist.
- Do not commit secrets, tokens, seed phrases, or live credentials. Redact logs
  in issues and pull requests.
- Do not weaken a compiler, lint, type, or test setting to get a pass.
- Do not import another package's private implementation. Use the published
  contracts, ports, and fixtures.

## Payment and recovery changes

When a change touches intents, retries, workers, payments, settlement, or
reconciliation, add or extend a test for each case that applies:

| Case | Required result |
| --- | --- |
| Same request twice, or two workers for one intent | Exactly one committed settlement |
| Conflicting payload, same intent id | At most one settlement, and the conflict is explicit |
| Crash before submission | No settlement; retry is allowed from durable state |
| Crash or timeout after a possible submission | `UNKNOWN`; no blind retry |
| Lost payment response | The original settlement is kept; no second payment |
| Empty, delayed, or ambiguous index result | Stay `UNKNOWN`; absence is not non-payment |
| Policy denial or amount over the cap | No settlement |
| Restart after the intent is durable | State survives and the invariant holds |
| Supplier failure after payment | The payment remains; no replacement payment |

Assert durable state and the external settlement count, not only an HTTP status.

## Local checks

From a clean install:

```bash
pnpm install --frozen-lockfile
pnpm lint
pnpm typecheck
pnpm test
```

`pnpm test` builds first and runs unit tests. Use `pnpm test:integration` when
Postgres is available, and `pnpm test:browser` when the web UI changes.
`pnpm format:check` covers Prettier.

## Labels

The catalog is [`.github/labels.yml`](.github/labels.yml).

- `type:*` is what the issue is.
- `priority:p0` through `priority:p3` is urgency. `p0` is settlement safety or
  an outage.
- `area:*` is the subsystem.
- `status:*` is where the issue sits.

Sync the catalog onto GitHub without deleting unrelated labels:

```bash
GH_TOKEN=... GITHUB_REPOSITORY=SWOFART/OneShot node scripts/sync-github-labels.mjs
```

The `Sync labels` workflow runs the same command on `workflow_dispatch`, and
when the catalog changes on `develop` or `main`. It needs permission to manage
issues. This repository does not create labels, milestones, or projects by
itself until that command or workflow runs.
