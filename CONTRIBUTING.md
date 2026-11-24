# Contributing

OneShot keeps one approved business obligation tied to at most one committed
USDC settlement. Changes that touch payment, retry, or recovery need tests from
`.agent/TEST_MATRIX.md`.

`develop` is the integration branch. `main` is the release branch. Do not push
to either directly.

## From issue to pull request

1. Open an issue with a template in `.github/ISSUE_TEMPLATE/`. Security problems
   do not go there. Use [private vulnerability reporting](SECURITY.md).
2. A maintainer triages the issue: set `type:*`, `area:*`, and `priority:*`,
   then move `status:needs-triage` to `status:ready` or `status:blocked`.
   Put milestone work on a GitHub milestone when one exists.
3. Non-trivial work starts from a planning issue (`[Plan]`) or a short note on
   the issue that names the outcome, acceptance criteria, and non-goals. The
   roadmap lives in [ROADMAP.md](ROADMAP.md). The planning notes live in
   [docs/planning/README.md](docs/planning/README.md).
4. Branch from current `develop` unless the maintainer names another base.
   Keep the branch to one issue or one tight outcome.
5. Run the applicable local checks from
   [the implementation loop](.agent/IMPLEMENTATION_LOOP.md). Open a pull request
   to `develop` and fill the pull request template. Link the issue.
6. Required CI must pass on that head. A human reviews and merges. Agents do
   not merge.

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
`pnpm format:check` covers Prettier. Do not weaken a check to make it pass.

## Secrets

Do not commit `.env` files, keys, tokens, or live credentials. Redact logs in
issues and pull requests.
