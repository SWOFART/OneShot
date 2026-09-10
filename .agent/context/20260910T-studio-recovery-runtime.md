# Studio Recovery Runtime

- Branch: `fix/studio-recovery-runtime`
- Base: `develop` at `c140405`
- Goal: restore read-only Arc recovery candidate discovery through the working
  Graph Studio endpoint and stop using a stale fixed upper block at runtime.
- Acceptance: production configuration accepts an HTTPS Studio query URL;
  recovery queries use the current Arc head; unavailable, empty, or ambiguous
  Graph results remain non-authoritative and never enable settlement.
- Assumption: Arc Testnet deployment remains Studio-only because it is not
  served by The Graph Network Gateway.
- Non-goals: publishing Arc to The Graph Network, claiming a live official MCP
  transport, resolving ambiguous multiple candidates, or enabling submissions.
- Safety: Cloud Run worker revision `oneshot-worker-00005-h8z` has
  `ONESHOT_SUBMISSIONS_DISABLED=true` and minimum instances set to zero.

## Evidence

- Live Studio query: deployment
  `QmPEUSL6aXY7RVjGFFMbs5L4Q4pxG4TB73cHQ7nechGQY7`, indexing errors false,
  indexed within five blocks of Arc head, real candidates returned.
- Live Network Gateway query: GraphQL error `subgraph not found` for the pinned
  deployment.
- Production recovery views for both existing `UNKNOWN` intents reported Graph
  health `UNAVAILABLE` before this fix.
- Local checks: format, lint, typecheck, build, generated-contract check,
  fixture validation, 64 test files / 958 tests, worker 38 tests,
  reconciliation 85 tests, Gate P6 offline demo, Markdown lint, and diff check
  pass.
- PostgreSQL integration tests require a container runtime, which is not
  available locally; the no-container run fails before tests start and remains
  required in CI.
